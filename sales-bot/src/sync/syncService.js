"use strict";

/**
 * Coletor de vendas (princípios do DDIA):
 *  - ingestão idempotente (upsert por ID da transação);
 *  - backfill retomável por cursor salvo, sem gerar avisos;
 *  - sincronização incremental do mais novo para o mais antigo com regra de parada;
 *  - avisos via "outbox": vendas novas ficam com notified_at NULL até o Discord confirmar.
 *
 * Regra de parada do incremental: para quando uma página inteira já era conhecida
 * E todas as vendas dela são mais antigas que o "corte". O corte é a venda pendente
 * mais antiga do grupo (limitada a PENDING_RECHECK_DAYS); sem pendentes, o corte é
 * "agora" (basta uma página inteira conhecida). Assim os pendentes são re-lidos até
 * virarem liberados, sem varrer 10 dias de páginas a cada 3 minutos.
 */

const { RobloxAuthError, RobloxPermissionError, RobloxError } = require("../roblox/errors");
const { formatNumber } = require("../format");

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTH_RETRY_MS = 15 * 60 * 1000;
const PERMISSION_RETRY_MS = 30 * 60 * 1000;
const FAILURE_ALERT_THRESHOLD = 5;
const BACKFILL_PAGES_PER_CYCLE = 50;

const defaultSleep = ms => new Promise(resolve => {
  const timer = setTimeout(resolve, ms);
  timer.unref?.();
});

function createSyncService(deps) {
  const {
    repo,
    roblox,
    config,
    logger,
    alerts,
    clock = () => new Date(),
    sleep = defaultSleep,
    backfillPagesPerCycle = BACKFILL_PAGES_PER_CYCLE,
  } = deps;

  let inFlight = null;
  let stopping = false;
  const groupRetryAt = new Map();

  function cookieState() {
    return repo.getState("cookie:status") || { status: "unknown" };
  }

  function setCookieState(patch) {
    const next = { ...cookieState(), ...patch, checkedAt: clock().toISOString() };
    repo.setState("cookie:status", next);
    return next;
  }

  async function onAuthOk() {
    const previous = cookieState();
    if (previous.status !== "ok") setCookieState({ status: "ok", retryAt: null, message: null });
    await alerts?.resolve("cookie_invalid", {
      title: "Cookie Roblox voltou a funcionar",
      message: "A coleta de vendas foi retomada normalmente.",
    });
  }

  async function onAuthError(error) {
    const retryAt = new Date(clock().getTime() + AUTH_RETRY_MS).toISOString();
    setCookieState({ status: "invalid", retryAt, message: error.message });
    await alerts?.raise("cookie_invalid", {
      title: "Cookie Roblox inválido ou expirado",
      message: [
        "A Roblox recusou o cookie da conta alternativa (401).",
        "Gere um novo `.ROBLOSECURITY`, atualize `ROBLOX_COOKIE` no `.env`, rode `npm run check` e reinicie com `pm2 restart sales-bot --update-env`.",
        "Vou continuar tentando a cada 15 minutos.",
      ].join("\n"),
    });
  }

  async function onPermissionError(group, error) {
    groupRetryAt.set(group.id, clock().getTime() + PERMISSION_RETRY_MS);
    await alerts?.raise(`forbidden:${group.id}`, {
      title: `Sem permissão no grupo ${group.name}`,
      message: [
        `A conta alternativa não pode ver as finanças do grupo **${group.name}** (${group.id}) — erro 403.`,
        "Confira se ela está no grupo e se o cargo dela tem a permissão de ver a receita/finanças do grupo.",
        "Vou tentar de novo a cada 30 minutos.",
      ].join("\n"),
    });
    return error;
  }

  async function recordFailure(group, error) {
    const now = clock();
    const state = repo.getSyncState(group.id);
    const failures = Number(state.consecutive_failures || 0) + 1;
    repo.updateSyncState(group.id, {
      last_attempt_at: now.toISOString(),
      last_error_at: now.toISOString(),
      last_error: String(error?.message || error).slice(0, 500),
      consecutive_failures: failures,
    });
    repo.recordSyncError(group.id, error?.kind || "erro", error?.message || String(error), now);
    if (failures >= FAILURE_ALERT_THRESHOLD && !(error instanceof RobloxAuthError) && !(error instanceof RobloxPermissionError)) {
      await alerts?.raise(`failures:${group.id}`, {
        title: `Falhas seguidas no grupo ${group.name}`,
        message: `${failures} sincronizações seguidas falharam. Último erro: ${String(error?.message || error).slice(0, 300)}`,
        level: "warn",
      });
    }
  }

  async function recordSuccess(group, patch) {
    repo.updateSyncState(group.id, {
      ...patch,
      last_attempt_at: clock().toISOString(),
      last_success_at: clock().toISOString(),
      consecutive_failures: 0,
    });
    groupRetryAt.delete(group.id);
    await alerts?.resolve(`failures:${group.id}`, {
      title: `Grupo ${group.name} sincronizando de novo`,
      message: "As falhas seguidas pararam.",
    });
    await alerts?.resolve(`forbidden:${group.id}`, {
      title: `Permissão restabelecida no grupo ${group.name}`,
      message: "A conta alternativa voltou a ver as finanças do grupo.",
    });
  }

  /** Avança o backfill até `maxPages` páginas. Retorna { pages, inserted, done }. */
  async function runBackfillChunk(group, { maxPages = backfillPagesPerCycle } = {}) {
    let state = repo.getSyncState(group.id);
    if (state.backfill_done) return { pages: 0, inserted: 0, done: true };
    if (!state.backfill_started_at) {
      state = repo.updateSyncState(group.id, { backfill_started_at: clock().toISOString() });
      logger?.info(`Backfill iniciado: ${group.name} (${group.id})`);
    }
    let cursor = state.backfill_cursor || null;
    let pages = 0;
    let inserted = 0;
    while (pages < maxPages && !stopping) {
      let page;
      try {
        page = await roblox.getSalesPage(group.id, cursor);
      } catch (error) {
        // Cursor salvo pode expirar: recomeça do topo (ingestão é idempotente).
        if (cursor && error instanceof RobloxError && error.status === 400) {
          logger?.warn(`Cursor de backfill expirou em ${group.name}; recomeçando do início.`);
          cursor = null;
          repo.updateSyncState(group.id, { backfill_cursor: null });
          continue;
        }
        throw error;
      }
      logSkipped(group, page.skipped);
      const result = repo.upsertSales(page.sales, { markNotified: true, now: clock() });
      inserted += result.inserted.length;
      pages += 1;
      cursor = page.nextCursor;
      const totalPages = Number(repo.getSyncState(group.id).backfill_pages || 0) + 1;
      if (!cursor) {
        repo.updateSyncState(group.id, {
          backfill_done: 1,
          backfill_cursor: null,
          backfill_pages: totalPages,
          backfill_completed_at: clock().toISOString(),
        });
        const total = repo.countSales({ groupId: group.id });
        logger?.info(`Backfill concluído: ${group.name} — ${total} vendas no banco.`);
        await alerts?.notify({
          title: `Histórico importado: ${group.name}`,
          message: `Backfill concluído com **${formatNumber(total)}** vendas no banco (${formatNumber(totalPages)} páginas). A partir de agora só vendas novas geram aviso.`,
          level: "info",
        });
        return { pages, inserted, done: true };
      }
      repo.updateSyncState(group.id, { backfill_cursor: cursor, backfill_pages: totalPages });
      if (config.sync.backfillPageDelayMs > 0 && pages < maxPages) await sleep(config.sync.backfillPageDelayMs);
    }
    return { pages, inserted, done: false };
  }

  /** Incremental: novas vendas (para aviso) + atualização de pendentes. */
  async function runIncremental(group) {
    const now = clock();
    const windowStart = new Date(now.getTime() - config.sync.pendingRecheckDays * DAY_MS);
    const oldestPending = repo.oldestPendingCreatedAt(group.id);
    const cutoff = oldestPending ? new Date(Math.max(oldestPending.getTime(), windowStart.getTime())) : now;

    let cursor = null;
    let pages = 0;
    const totals = { inserted: [], released: [], becamePending: [] };
    for (;;) {
      const page = await roblox.getSalesPage(group.id, cursor);
      logSkipped(group, page.skipped);
      const result = repo.upsertSales(page.sales, { markNotified: false, now: clock() });
      totals.inserted.push(...result.inserted);
      totals.released.push(...result.released);
      totals.becamePending.push(...result.becamePending);
      pages += 1;

      if (!page.sales.length) break;
      const allKnown = result.inserted.length === 0;
      const allOlderThanCutoff = page.sales.every(sale => new Date(sale.createdAt).getTime() <= cutoff.getTime());
      if (allKnown && allOlderThanCutoff) break;
      if (!page.nextCursor) break;
      if (pages >= config.sync.maxIncrementalPages) {
        logger?.warn(`Incremental de ${group.name} atingiu o limite de ${pages} páginas; continua no próximo ciclo.`);
        break;
      }
      cursor = page.nextCursor;
    }
    return { pages, inserted: totals.inserted, released: totals.released, becamePending: totals.becamePending };
  }

  function logSkipped(group, skipped) {
    if (skipped?.length) {
      logger?.warn(`${skipped.length} transação(ões) ignorada(s) em ${group.name}: ${[...new Set(skipped.map(item => item.problem))].join(", ")}`);
    }
  }

  async function syncGroup(group) {
    const startedAt = clock();
    const result = { groupId: group.id, groupName: group.name, ok: false, backfill: null, newSales: 0, released: 0, pages: 0 };
    try {
      const state = repo.getSyncState(group.id);
      if (!state.backfill_done) {
        result.backfill = await runBackfillChunk(group);
      }
      const incremental = await runIncremental(group);
      result.newSales = incremental.inserted.length;
      result.released = incremental.released.length;
      result.pages = incremental.pages;
      result.ok = true;
      await recordSuccess(group, { last_new_sales: result.newSales, last_pages: result.pages });
      await onAuthOk();
      logger?.debug(`Sync ${group.name}: ${result.newSales} novas, ${result.released} liberadas, ${result.pages} pág. em ${clock() - startedAt} ms`);
    } catch (error) {
      result.error = error;
      if (error instanceof RobloxAuthError) await onAuthError(error);
      else if (error instanceof RobloxPermissionError) await onPermissionError(group, error);
      await recordFailure(group, error);
      logger?.warn(`Falha ao sincronizar ${group.name}: ${error?.message || error}`);
    }
    return result;
  }

  /**
   * Um ciclo de sincronização de todos os grupos (single-flight: chamadas
   * simultâneas compartilham o mesmo ciclo).
   */
  function runCycle({ force = false } = {}) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const startedAt = clock();
      const cookie = cookieState();
      if (!force && cookie.status === "invalid" && cookie.retryAt && Date.parse(cookie.retryAt) > startedAt.getTime()) {
        return { skipped: "cookie_invalid", retryAt: cookie.retryAt, groups: [] };
      }
      const groups = [];
      for (const group of config.groups) {
        if (stopping) break;
        const retryAt = groupRetryAt.get(group.id);
        if (!force && retryAt && retryAt > clock().getTime()) {
          groups.push({ groupId: group.id, groupName: group.name, ok: false, skipped: "permission_backoff" });
          continue;
        }
        const result = await syncGroup(group);
        groups.push(result);
        // Cookie inválido afeta todos os grupos: não insiste nos demais.
        if (result.error instanceof RobloxAuthError) break;
      }
      repo.setState("sync:last_cycle", { at: clock().toISOString(), ms: clock() - startedAt });
      return { groups, startedAt: startedAt.toISOString(), durationMs: clock() - startedAt };
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  /** Saldo + pendentes de cada grupo (snapshot). */
  async function snapshotFunds() {
    const results = [];
    for (const group of config.groups) {
      if (stopping) break;
      try {
        const funds = await roblox.getFunds(group.id);
        let pendingRobux = null;
        let summaryRaw = null;
        try {
          const summary = await roblox.getRevenueSummary(group.id, "Day");
          pendingRobux = summary.pendingRobux;
          summaryRaw = summary.raw;
        } catch (error) {
          if (error instanceof RobloxAuthError) throw error;
          logger?.warn(`Resumo de receita indisponível para ${group.name}: ${error.message}`);
        }
        repo.insertFundsSnapshot({
          groupId: group.id,
          robux: funds.robux,
          pendingRobux,
          raw: { currency: funds.raw ?? null, revenueSummaryDay: summaryRaw },
          takenAt: clock(),
        });
        results.push({ groupId: group.id, groupName: group.name, ok: true, robux: funds.robux, pendingRobux });
      } catch (error) {
        if (error instanceof RobloxAuthError) await onAuthError(error);
        else if (error instanceof RobloxPermissionError) await onPermissionError(group, error);
        repo.recordSyncError(group.id, `saldo:${error?.kind || "erro"}`, error?.message || String(error), clock());
        results.push({ groupId: group.id, groupName: group.name, ok: false, error });
        if (error instanceof RobloxAuthError) break;
      }
    }
    repo.setState("funds:last_snapshot", clock().toISOString());
    return results;
  }

  return {
    runCycle,
    syncGroup,
    runBackfillChunk,
    runIncremental,
    snapshotFunds,
    cookieState,
    isRunning: () => Boolean(inFlight),
    waitIdle: () => inFlight || Promise.resolve(),
    stop() {
      stopping = true;
    },
  };
}

module.exports = { createSyncService, AUTH_RETRY_MS, FAILURE_ALERT_THRESHOLD };
