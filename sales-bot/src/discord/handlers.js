"use strict";

/**
 * Tratamento das interações (comandos, autocomplete, botões).
 * Usa só a interface do objeto Interaction (reply/deferReply/editReply/update/respond),
 * então pode ser testado com interações falsas.
 */

const { resolvePeriod, PeriodError, LABELS } = require("../reports/periods");
const { buildSummary, groupName: groupNameOf } = require("../reports/summary");
const { bucketize, chooseGranularity } = require("../reports/timeline");
const { salesToCsv, BOM } = require("../reports/csv");
const { buildBarChartSvg, svgToPng, parseColor, NAMED_COLORS } = require("../charts/barChart");
const { formatNumber, percentChange, truncate } = require("../format");
const { formatDate, dayKey, DAY_MS } = require("../time");
const { redact } = require("../logger");
const embeds = require("./embeds");
const { totalPagesFor, nextPage, parseCustomId, buttonsRow, PAGE_SIZE, SESSION_TTL_MS } = require("./pagination");

const EPHEMERAL = 64; // MessageFlags.Ephemeral
const MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024;

class UserError extends Error {}

function formatUptime(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days}d` : null, hours ? `${hours}h` : null, `${minutes}min`].filter(Boolean).join(" ");
}

function createHandlers(app) {
  const { config, repo, logger } = app;
  const tz = config.timezone;
  const ctx = {
    timeZone: tz,
    groupName: id => groupNameOf(config.groups, id),
  };

  function isOwner(userId) {
    return config.ownerIds.includes(String(userId));
  }

  // ------------------------------------------------------------ opções

  function groupFromOption(interaction) {
    const raw = interaction.options.getString("grupo");
    if (!raw) return null;
    const value = String(raw).trim();
    const group = config.groups.find(entry => entry.id === value)
      || config.groups.find(entry => entry.name.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"));
    if (!group) throw new UserError(`Grupo "${truncate(value, 50)}" não está configurado. Escolha um da lista.`);
    return group;
  }

  function itemFilterFromOption(value) {
    if (!value) return {};
    const text = String(value).trim();
    if (text.startsWith("id:")) return { itemId: text.slice(3) };
    if (/^\d+$/.test(text)) return { itemId: text };
    return { itemQuery: text };
  }

  function periodFromOptions(interaction, fallback, groupId) {
    const key = interaction.options.getString("periodo") || fallback;
    const earliest = repo.totals({ groupId }).firstAt;
    try {
      return resolvePeriod(key, {
        now: app.clock(),
        timeZone: tz,
        start: interaction.options.getString("inicio"),
        end: interaction.options.getString("fim"),
        earliest,
      });
    } catch (error) {
      if (error instanceof PeriodError) throw new UserError(error.message);
      throw error;
    }
  }

  function isPublic(interaction) {
    return Boolean(interaction.options.getBoolean?.("publico"));
  }

  // ------------------------------------------------------------ comandos

  async function resumo(interaction) {
    const group = groupFromOption(interaction);
    const period = periodFromOptions(interaction, "hoje", group?.id);
    const summary = buildSummary(repo, { period, groupId: group?.id || null, groups: config.groups, ownerIds: config.ownerIds });
    await interaction.editReply({ embeds: [embeds.summaryEmbed(summary, ctx)] });
  }

  function renderSalesPage(session) {
    const totalCount = repo.countSales(session.filter);
    const totalPages = totalPagesFor(totalCount);
    session.page = Math.min(Math.max(1, session.page), totalPages);
    const sales = repo.listSales(session.filter, { limit: PAGE_SIZE, offset: (session.page - 1) * PAGE_SIZE });
    const totals = repo.totals(session.filter);
    const embed = embeds.salesPageEmbed({
      sales,
      page: session.page,
      totalPages,
      totalCount,
      totals,
      title: session.title,
      filtersText: session.filtersText,
      timeZone: tz,
      groupName: ctx.groupName,
    });
    const components = totalPages > 1 ? [buttonsRow(session.id, session.page, totalPages)] : [];
    return { embeds: [embed], components, totalPages };
  }

  async function vendas(interaction) {
    const group = groupFromOption(interaction);
    const period = periodFromOptions(interaction, "30d", group?.id);
    const itemOption = interaction.options.getString("item");
    const buyer = interaction.options.getString("comprador");
    const filter = { start: period.start, end: period.end, groupId: group?.id || null, ...itemFilterFromOption(itemOption), buyer: buyer || null };
    const filtersParts = [period.description];
    if (group) filtersParts.push(group.name);
    if (filter.itemId) filtersParts.push(`item: ${repo.itemInfo(filter.itemId)?.itemName || filter.itemId}`);
    if (filter.itemQuery) filtersParts.push(`item contém "${filter.itemQuery}"`);
    if (buyer) filtersParts.push(`comprador: ${buyer}`);

    const session = app.pagination.create({
      ownerId: interaction.user.id,
      filter,
      title: `Vendas · ${period.label}`,
      filtersText: filtersParts.join(" · "),
    });
    const view = renderSalesPage(session);
    await interaction.editReply({ embeds: view.embeds, components: view.components });

    if (view.totalPages > 1) {
      // Ao expirar, desabilita os botões (o token da interação vale 15 min).
      const timer = setTimeout(() => {
        app.pagination.delete(session.id);
        interaction.editReply({ components: [buttonsRow(session.id, session.page, view.totalPages, { disabled: true })] })
          .catch(() => {});
      }, SESSION_TTL_MS);
      timer.unref?.();
    }
  }

  async function onPageButton(interaction, parsed) {
    if (!isOwner(interaction.user.id)) {
      await interaction.reply({ content: "Sem permissão.", flags: EPHEMERAL });
      return;
    }
    if (parsed.action === "noop") {
      await interaction.deferUpdate?.();
      return;
    }
    const session = app.pagination.get(parsed.sessionId);
    if (!session) {
      await interaction.reply({ content: "Esta lista expirou (10 min). Rode `/vendas` de novo.", flags: EPHEMERAL });
      return;
    }
    if (session.ownerId !== interaction.user.id) {
      await interaction.reply({ content: "Só quem abriu esta lista pode usar os botões.", flags: EPHEMERAL });
      return;
    }
    const totalPages = totalPagesFor(repo.countSales(session.filter));
    session.page = nextPage(parsed.action, session.page, totalPages);
    const view = renderSalesPage(session);
    await interaction.update({ embeds: view.embeds, components: view.components });
  }

  async function exportar(interaction) {
    const group = groupFromOption(interaction);
    const period = periodFromOptions(interaction, "mes_atual", group?.id);
    const filter = { start: period.start, end: period.end, groupId: group?.id || null };
    const sales = repo.listSales(filter, { limit: 10_000_000, offset: 0, order: "ASC" });
    if (!sales.length) {
      await interaction.editReply({ content: `Nenhuma venda em ${period.description}${group ? ` (${group.name})` : ""}.` });
      return;
    }
    const prices = new Map(repo.db.prepare("SELECT item_id, gross_price FROM item_prices").all().map(row => [row.item_id, Number(row.gross_price)]));
    const csvCtx = { timeZone: tz, groupName: ctx.groupName, grossPrice: itemId => (prices.has(itemId) ? prices.get(itemId) : null) };
    const baseName = `vendas_${period.key}${group ? `_${group.id}` : ""}_${dayKey(app.clock(), tz)}`;
    const files = splitCsvFiles(sales, csvCtx, baseName);
    if (files.length > 10) {
      throw new UserError("Exportação grande demais para o Discord. Escolha um período menor.");
    }
    const total = sales.reduce((sum, sale) => sum + sale.amount, 0);
    await interaction.editReply({
      content: `**${formatNumber(sales.length)}** vendas · **${formatNumber(total)} Robux** líquidos · ${period.description}${group ? ` · ${group.name}` : ""}${files.length > 1 ? `\nArquivo dividido em ${files.length} partes (limite do Discord).` : ""}`,
      files,
    });
  }

  function splitCsvFiles(sales, csvCtx, baseName) {
    const whole = Buffer.from(salesToCsv(sales, csvCtx), "utf8");
    if (whole.length <= MAX_ATTACHMENT_BYTES) return [{ attachment: whole, name: `${baseName}.csv` }];
    const parts = Math.ceil(whole.length / (MAX_ATTACHMENT_BYTES * 0.9));
    const size = Math.ceil(sales.length / parts);
    const files = [];
    for (let index = 0; index < parts; index += 1) {
      const chunk = sales.slice(index * size, (index + 1) * size);
      if (!chunk.length) break;
      files.push({ attachment: Buffer.from(salesToCsv(chunk, csvCtx), "utf8"), name: `${baseName}_parte${index + 1}.csv` });
    }
    return files;
  }

  function chartAttachment(buckets, { baseName, ...style }) {
    const svg = buildBarChartSvg(buckets, style);
    const png = svgToPng(svg, { theme: style.theme });
    if (png) return { file: { attachment: png, name: `${baseName}.png` }, image: `attachment://${baseName}.png` };
    return { file: { attachment: Buffer.from(svg, "utf8"), name: `${baseName}.svg` }, image: null };
  }

  /** "×10", "×2,5" */
  function multiplierLabel(factor) {
    return `×${String(Number(factor.toFixed(2))).replace(".", ",")}`;
  }

  /**
   * /grafico com aparência personalizável (cor, tema, textos, linha de média).
   * O multiplicador muda só o que aparece neste gráfico (banco e outros comandos ficam reais)
   * e deixa um "×N" discreto e fixo ao lado do título, que os textos personalizados não removem.
   */
  async function grafico(interaction) {
    const group = groupFromOption(interaction);
    const period = periodFromOptions(interaction, "30d", group?.id);
    const options = interaction.options;
    const rawFactor = options.getNumber?.("multiplicador");
    const factor = rawFactor === null || rawFactor === undefined ? 1 : rawFactor;
    if (!Number.isFinite(factor) || factor <= 0 || factor > 1000) throw new UserError("O multiplicador precisa ser maior que 0 e no máximo 1000.");
    const colorText = options.getString("cor");
    const color = parseColor(colorText);
    if (colorText && !color) throw new UserError(`Cor inválida. Use um nome (${Object.keys(NAMED_COLORS).join(", ")}) ou um código como #1A9F55.`);
    const theme = options.getString("tema") || "claro";
    const showAverage = options.getBoolean?.("media") !== false;
    const tag = factor === 1 ? "" : multiplierLabel(factor);

    const filter = { start: period.start, end: period.end, groupId: group?.id || null };
    const totals = repo.totals(filter);
    const start = period.start || (totals.firstAt ? new Date(totals.firstAt) : new Date(app.clock().getTime() - 30 * DAY_MS));
    const { granularity, buckets } = bucketize(repo.salesTimeline(filter), start, period.end, tz);
    // Só a exibição é multiplicada; os dados reais não mudam.
    const shown = factor === 1 ? buckets : buckets.map(bucket => ({ ...bucket, net: Math.round(bucket.net * factor), count: Math.round(bucket.count * factor) }));
    const net = Math.round(totals.net * factor);
    const count = Math.round(totals.count * factor);
    const unit = granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês";
    const avg = shown.length ? net / shown.length : 0;

    const title = options.getString("titulo") || `${formatNumber(net)} Robux em ${formatNumber(count)} vendas`;
    const subtitle = options.getString("subtitulo") ?? `${period.label}${group ? ` · ${group.name}` : ""} · por ${unit}${showAverage ? ` · média ${formatNumber(avg)}/${unit}` : ""}`;
    const footer = options.getString("rodape") ?? `Valores líquidos · ${period.description}`;
    const baseName = `grafico_${period.key}_${dayKey(app.clock(), tz)}`;
    const chart = chartAttachment(shown, { title, titleTag: tag, subtitle, footer, baseName, color, theme, showAverage });
    const embedTitle = options.getString("titulo") || `Vendas por ${unit} · ${period.label}`;
    const embed = {
      color: parseInt((color || "#2F6FDE").slice(1), 16),
      title: `${embedTitle}${tag ? ` · ${tag}` : ""}`.slice(0, 256),
      description: `## ${formatNumber(net)} Robux\n${formatNumber(count)} vendas${showAverage ? ` · média ${formatNumber(avg)} por ${unit}` : ""}`,
      footer: { text: (options.getString("rodape") ?? `Valores líquidos (após a taxa da Roblox) · ${period.description}`).slice(0, 2048) || " " },
    };
    if (chart.image) embed.image = { url: chart.image };
    await interaction.editReply({
      content: chart.image ? undefined : "⚠️ `@resvg/resvg-js` não está instalado; enviei o gráfico em SVG. Rode `npm install` para gerar PNG.",
      embeds: [embed],
      files: [chart.file],
    });
  }

  async function saldo(interaction) {
    const results = await app.sync.snapshotFunds();
    const rows = config.groups.map(group => {
      const live = results.find(result => result.groupId === group.id && result.ok);
      if (live) return { name: group.name, robux: live.robux, pendingRobux: live.pendingRobux, stale: false };
      const last = repo.latestFunds(group.id);
      return { name: group.name, robux: last?.robux ?? null, pendingRobux: last?.pendingRobux ?? null, stale: Boolean(last), takenAt: last?.takenAt };
    });
    const failures = results.filter(result => !result.ok);
    await interaction.editReply({
      content: failures.length ? `⚠️ Não consegui consultar ao vivo: ${failures.map(f => `${f.groupName} (${redact(f.error?.message || "erro")})`).join("; ").slice(0, 1500)}` : undefined,
      embeds: [embeds.fundsEmbed(rows, ctx)],
    });
  }

  function resolveItem(value) {
    const filter = itemFilterFromOption(value);
    if (filter.itemId) return repo.itemInfo(filter.itemId);
    const [best] = repo.findItems(filter.itemQuery || "", 1);
    return best ? repo.itemInfo(best.itemId) : null;
  }

  async function item(interaction) {
    const info = resolveItem(interaction.options.getString("nome"));
    if (!info) throw new UserError("Item não encontrado nas vendas registradas. Comece a digitar e escolha um da lista.");
    const now = app.clock();
    const filter = { itemId: info.itemId };
    const totals = repo.totals(filter);
    const start = new Date(totals.firstAt || now);
    const granularity = chooseGranularity(start, now);
    const { buckets } = bucketize(repo.salesTimeline(filter), start, now, tz, granularity);
    const last30 = repo.totals({ ...filter, start: new Date(now - 30 * DAY_MS), end: now });
    const prev30 = repo.totals({ ...filter, start: new Date(now - 60 * DAY_MS), end: new Date(now - 30 * DAY_MS) });
    const stats = {
      totals,
      buckets,
      granularity,
      last30,
      change30: percentChange(last30.net, prev30.net),
      topBuyers: repo.topBuyers(filter, 5),
    };
    const embed = embeds.itemEmbed(info, stats, ctx);
    const baseName = `item_${info.itemId}`;
    const unit = granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês";
    const chart = chartAttachment(buckets, {
      title: truncate(info.itemName || `Item ${info.itemId}`, 60),
      subtitle: `${formatNumber(totals.net)} Robux em ${formatNumber(totals.count)} vendas · por ${unit}`,
      footer: `Valores líquidos · desde ${totals.firstAt ? formatDate(new Date(totals.firstAt), tz) : "—"}`,
      baseName,
    });
    if (chart.image) embed.image = { url: chart.image };
    await interaction.editReply({ embeds: [embed], files: chart.image ? [chart.file] : [] });
  }

  async function status(interaction) {
    const groups = config.groups.map(group => ({
      name: `${group.name} (${group.id})`,
      state: repo.getSyncState(group.id),
      salesCount: repo.countSales({ groupId: group.id }),
    }));
    const data = {
      groups,
      cookie: app.sync.cookieState(),
      recentErrors: repo.recentErrors(5),
      uptime: formatUptime(Date.now() - app.startedAt),
      totalSales: repo.totalSalesCount(),
      unnotified: repo.countUnnotified(),
      dbDriver: app.dbDriver,
      lastBackup: repo.getState("backup:last"),
      lastFunds: repo.getState("funds:last_snapshot"),
    };
    await interaction.editReply({ embeds: [embeds.statusEmbed(data, ctx)] });
  }

  async function sincronizar(interaction) {
    // Só a busca de vendas novas (rápido); backfill e revisão seguem nos ciclos automáticos.
    const result = await app.sync.runCycle({ force: true, background: false });
    await app.notifier?.flush();
    const lines = (result.groups || []).map(group => {
      if (group.ok) {
        const backfill = group.backfill && !group.backfill.done ? ` · backfill: +${formatNumber(group.backfill.pages)} pág. (continua)` : "";
        return `✅ **${group.groupName}**: ${formatNumber(group.newSales)} nova(s), ${formatNumber(group.released)} liberada(s), ${formatNumber(group.pages)} pág.${backfill}`;
      }
      return `❌ **${group.groupName}**: ${redact(group.error?.message || group.skipped || "falhou")}`;
    });
    await interaction.editReply({
      content: [`Sincronização concluída em ${formatNumber(result.durationMs || 0)} ms.`, ...lines].join("\n").slice(0, 2000),
    });
  }

  const COMMAND_HANDLERS = { resumo, vendas, exportar, grafico, saldo, item, status, sincronizar };

  // ------------------------------------------------------------ autocomplete

  async function autocomplete(interaction) {
    if (!isOwner(interaction.user.id)) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    const query = String(focused?.value || "").trim();
    if (focused?.name === "grupo") {
      const needle = query.toLocaleLowerCase("pt-BR");
      const choices = config.groups
        .filter(group => !needle || group.name.toLocaleLowerCase("pt-BR").includes(needle) || group.id.includes(needle))
        .slice(0, 25)
        .map(group => ({ name: truncate(`${group.name} (${group.id})`, 100), value: group.id }));
      await interaction.respond(choices);
      return;
    }
    if (focused?.name === "item" || focused?.name === "nome") {
      let groupId = null;
      try {
        groupId = interaction.options.getString("grupo") || null;
      } catch {
        groupId = null;
      }
      const choices = repo.itemSuggestions(query, 25, groupId).map(entry => ({
        name: truncate(`${entry.itemName || `Item ${entry.itemId}`} · ${formatNumber(entry.count)} vendas`, 100),
        value: `id:${entry.itemId}`.slice(0, 100),
      }));
      await interaction.respond(choices);
      return;
    }
    await interaction.respond([]);
  }

  // ------------------------------------------------------------ roteador

  async function handle(interaction) {
    try {
      if (interaction.isAutocomplete?.()) {
        await autocomplete(interaction);
        return;
      }
      if (interaction.isButton?.()) {
        const parsed = parseCustomId(interaction.customId);
        if (parsed) await onPageButton(interaction, parsed);
        return;
      }
      if (!interaction.isChatInputCommand?.()) return;

      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ content: "Sem permissão.", flags: EPHEMERAL });
        return;
      }
      const handler = COMMAND_HANDLERS[interaction.commandName];
      if (!handler) {
        await interaction.reply({ content: "Comando desconhecido.", flags: EPHEMERAL });
        return;
      }
      const ephemeral = interaction.commandName === "sincronizar" ? true : !isPublic(interaction);
      await interaction.deferReply(ephemeral ? { flags: EPHEMERAL } : {});
      await handler(interaction);
    } catch (error) {
      await replyError(interaction, error);
    }
  }

  async function replyError(interaction, error) {
    const userFacing = error instanceof UserError;
    if (!userFacing) logger?.error(`Erro em ${interaction.commandName || interaction.customId || "interação"}:`, error);
    const content = userFacing ? `⚠️ ${error.message}` : `❌ Erro inesperado: ${redact(error?.message || String(error)).slice(0, 300)}`;
    try {
      if (interaction.isAutocomplete?.()) {
        if (!interaction.responded) await interaction.respond([]);
      } else if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, embeds: [], components: [], files: [] });
      } else {
        await interaction.reply({ content, flags: EPHEMERAL });
      }
    } catch (replyFailure) {
      logger?.warn("Não foi possível responder ao erro:", replyFailure?.message || replyFailure);
    }
  }

  return { handle, isOwner, ctx, formatUptime, splitCsvFiles, UserError, LABELS, BOM };
}

module.exports = { createHandlers, formatUptime, EPHEMERAL, UserError };
