"use strict";

/**
 * Resumos automáticos (diário, semanal, mensal) no fuso configurado.
 * Cada ocorrência é registrada no banco para não repetir após reinícios;
 * se o bot estava fora no horário, recupera até 6h depois.
 */

const { zonedParts, zonedTimeToUtc, addLocalDays, startOfMonth, formatDate, DAY_MS } = require("../time");
const { resolvePeriod } = require("../reports/periods");
const { buildSummary } = require("../reports/summary");
const { summaryEmbed } = require("./embeds");

const CATCH_UP_MS = 6 * 60 * 60 * 1000;
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Ocorrência mais recente (<= now) de cada agenda, ou null se desligada. */
function lastOccurrence(kind, schedules, now, tz) {
  const p = zonedParts(now, tz);
  if (kind === "daily") {
    if (!schedules.daily) return null;
    let at = zonedTimeToUtc(p.year, p.month, p.day, schedules.daily.hour, schedules.daily.minute, 0, tz);
    if (at > now) at = addLocalDays(at, -1, tz);
    return at;
  }
  if (kind === "weekly") {
    if (!schedules.weekly) return null;
    const diff = (p.weekday - schedules.weeklyDay + 7) % 7;
    const base = addLocalDays(zonedTimeToUtc(p.year, p.month, p.day, 12, 0, 0, tz), -diff, tz);
    const b = zonedParts(base, tz);
    let at = zonedTimeToUtc(b.year, b.month, b.day, schedules.weekly.hour, schedules.weekly.minute, 0, tz);
    if (at > now) at = addLocalDays(at, -7, tz);
    return at;
  }
  if (kind === "monthly") {
    if (!schedules.monthly) return null;
    let at = zonedTimeToUtc(p.year, p.month, schedules.monthlyDay, schedules.monthly.hour, schedules.monthly.minute, 0, tz);
    if (at > now) {
      const prev = zonedParts(startOfMonth(now, tz, -1), tz);
      at = zonedTimeToUtc(prev.year, prev.month, schedules.monthlyDay, schedules.monthly.hour, schedules.monthly.minute, 0, tz);
    }
    return at;
  }
  return null;
}

function titleFor(kind, period, tz) {
  if (kind === "daily") return `Resumo diário · ${formatDate(period.start, tz)}`;
  if (kind === "weekly") return `Resumo semanal · ${formatDate(period.start, tz)} → ${formatDate(new Date(period.end.getTime() - 1), tz)}`;
  const p = zonedParts(period.start, tz);
  return `Resumo mensal · ${MONTH_NAMES[p.month - 1]}/${p.year}`;
}

const PERIOD_FOR = { daily: "hoje", weekly: "semana", monthly: "mes_passado" };

function createScheduler({ repo, config, send, ctx, logger, clock = () => new Date() }) {
  let running = false;

  async function runKind(kind, occurrence) {
    const period = resolvePeriod(PERIOD_FOR[kind], { now: occurrence, timeZone: config.timezone });
    const summary = buildSummary(repo, { period, groups: config.groups, ownerIds: config.ownerIds });
    const embed = summaryEmbed(summary, ctx, { title: titleFor(kind, period, config.timezone) });
    await send(config.discord.summaryChannelId, { embeds: [embed] });
    logger?.info(`Resumo ${kind} enviado (${period.description}).`);
  }

  return {
    lastOccurrence: (kind, now = clock()) => lastOccurrence(kind, config.schedules, now, config.timezone),

    /** Verifica e dispara os resumos devidos. Chamado a cada ~30s. */
    async tick() {
      if (running) return [];
      running = true;
      const fired = [];
      try {
        const now = clock();
        for (const kind of ["daily", "weekly", "monthly"]) {
          const occurrence = lastOccurrence(kind, config.schedules, now, config.timezone);
          if (!occurrence) continue;
          const key = `schedule:${kind}:last`;
          const last = repo.getState(key);
          if (last === occurrence.toISOString()) continue;
          if (now - occurrence > CATCH_UP_MS) {
            // Perdeu a janela (bot fora por muito tempo): registra sem enviar.
            repo.setState(key, occurrence.toISOString());
            continue;
          }
          try {
            await runKind(kind, occurrence);
            repo.setState(key, occurrence.toISOString());
            fired.push(kind);
          } catch (error) {
            logger?.warn(`Falha ao enviar resumo ${kind} (tento de novo):`, error?.message || error);
          }
        }
      } finally {
        running = false;
      }
      return fired;
    },
  };
}

module.exports = { createScheduler, lastOccurrence, titleFor, CATCH_UP_MS, DAY_MS };
