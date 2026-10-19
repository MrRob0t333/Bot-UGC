"use strict";

/**
 * Embeds como objetos JSON da API do Discord (o discord.js aceita direto).
 * Princípios: número principal em destaque no topo, comparação com o período
 * anterior (▲/▼ %), poucas cores, nada de enfeite.
 */

const { formatNumber, formatPercent, truncate, escapeMarkdown } = require("../format");
const { formatDateTime, formatShortDateTime, formatDate } = require("../time");

const COLORS = {
  primary: 0x2f6fde,
  neutral: 0x6e7781,
  ok: 0x1a7f37,
  warn: 0xd29922,
  error: 0xcf222e,
};

const NET_NOTE = "Valores líquidos (após a taxa da Roblox)";

function profileUrl(userId) {
  return userId ? `https://www.roblox.com/users/${userId}/profile` : null;
}

function itemUrl(sale) {
  if (!sale.itemId) return null;
  const type = String(sale.itemType || "").toLowerCase();
  if (type.includes("gamepass") || type.includes("game pass")) return `https://www.roblox.com/game-pass/${sale.itemId}`;
  if (type.includes("asset") || type.includes("bundle") || !type) return `https://www.roblox.com/catalog/${sale.itemId}`;
  return null;
}

function link(text, url) {
  const label = escapeMarkdown(text);
  return url ? `[${label}](${url})` : label;
}

function buyerText(sale) {
  if (!sale.buyerName && !sale.buyerId) return "desconhecido";
  return link(sale.buyerName || `ID ${sale.buyerId}`, profileUrl(sale.buyerId));
}

function itemText(sale) {
  return link(truncate(sale.itemName || (sale.itemId ? `Item ${sale.itemId}` : "Item desconhecido"), 80), itemUrl(sale));
}

function statusText(isPending) {
  return isPending ? "⏳ Pendente" : "✅ Liberado";
}

// ---------------------------------------------------------------- vendas

function saleEmbed(sale, ctx) {
  return {
    color: COLORS.primary,
    title: `Nova venda · ${formatNumber(sale.amount)} Robux`,
    description: `**${itemText(sale)}**\n${escapeMarkdown(ctx.groupName(sale.groupId))}`,
    fields: [
      { name: "Comprador", value: buyerText(sale), inline: true },
      { name: "Status", value: statusText(sale.isPending), inline: true },
      { name: "Horário", value: formatDateTime(new Date(sale.createdAt), ctx.timeZone), inline: true },
    ],
    footer: { text: `${NET_NOTE} · ${truncate(sale.itemType || "", 40)}`.replace(/ · $/, "") },
    timestamp: sale.createdAt,
  };
}

function groupedSalesEmbed(sales, ctx, { maxLines = 20 } = {}) {
  const total = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const lines = [];
  let length = 0;
  let shown = 0;
  for (const sale of [...sales].reverse()) {
    if (shown >= maxLines) break;
    const line = `\`${formatShortDateTime(new Date(sale.createdAt), ctx.timeZone)}\` **${formatNumber(sale.amount)}** · ${truncate(escapeMarkdown(sale.itemName || "Item"), 40)} · ${truncate(escapeMarkdown(sale.buyerName || "?"), 24)}${sale.isPending ? " ⏳" : ""}`;
    if (length + line.length > 3600) break;
    lines.push(line);
    length += line.length + 1;
    shown += 1;
  }
  if (sales.length > shown) lines.push(`… e mais ${formatNumber(sales.length - shown)} venda(s). Use \`/vendas\` para ver todas.`);

  const byGroup = new Map();
  for (const sale of sales) {
    const entry = byGroup.get(sale.groupId) || { net: 0, count: 0 };
    entry.net += sale.amount;
    entry.count += 1;
    byGroup.set(sale.groupId, entry);
  }
  const fields = byGroup.size > 1
    ? [{
      name: "Por grupo",
      value: [...byGroup.entries()]
        .sort((a, b) => b[1].net - a[1].net)
        .map(([groupId, entry]) => `${escapeMarkdown(ctx.groupName(groupId))}: **${formatNumber(entry.net)}** (${formatNumber(entry.count)})`)
        .join("\n")
        .slice(0, 1024),
    }]
    : [];

  return {
    color: COLORS.primary,
    title: `${formatNumber(sales.length)} novas vendas · ${formatNumber(total)} Robux`,
    description: lines.join("\n"),
    fields,
    footer: { text: `${NET_NOTE}${byGroup.size === 1 ? ` · ${ctx.groupName([...byGroup.keys()][0])}` : ""}` },
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- resumo

function rankedList(rows, nameOf, { empty = "—" } = {}) {
  if (!rows.length) return empty;
  return rows
    .map((row, index) => `${index + 1}. ${nameOf(row)} — **${formatNumber(row.net)}** (${formatNumber(row.count)})`)
    .join("\n")
    .slice(0, 1024);
}

function summaryEmbed(summary, ctx, { title } = {}) {
  const { totals, previous, period } = summary;
  const heading = title || `Resumo · ${period.label}${summary.groupName ? ` · ${summary.groupName}` : ""}`;
  const descriptionLines = [`## ${formatNumber(totals.net)} Robux`];
  if (previous) {
    descriptionLines.push(`${previous.change.net.text} vs período anterior (${formatNumber(previous.net)})`);
  }
  if (!totals.count) descriptionLines.push("Nenhuma venda neste período.");

  const fields = [
    {
      name: "Vendas",
      value: `**${formatNumber(totals.count)}**${previous ? `\n${previous.change.count.text}` : ""}`,
      inline: true,
    },
    {
      name: "Ticket médio",
      value: `**${formatNumber(summary.avgTicket)}**${previous ? `\n${previous.change.avgTicket.text}` : ""}`,
      inline: true,
    },
    {
      name: "Liberado · Pendente",
      value: `**${formatNumber(totals.releasedNet)}** · ${formatNumber(totals.pendingNet)}\n${formatNumber(totals.pendingCount)} venda(s) pendente(s)`,
      inline: true,
    },
  ];

  if (totals.count) {
    fields.push({
      name: "Top 5 itens",
      value: rankedList(summary.topItems, row => link(truncate(row.itemName || `Item ${row.itemId}`, 40), itemUrl({ itemId: row.itemId, itemType: row.itemType }))),
      inline: false,
    });
    fields.push({
      name: "Top 5 compradores",
      value: rankedList(summary.topBuyers, row => link(truncate(row.buyerName || `ID ${row.buyerId}`, 32), profileUrl(row.buyerId))),
      inline: false,
    });
    if (!summary.groupId && summary.byGroup.length) {
      fields.push({
        name: "Por grupo",
        value: summary.byGroup
          .map(row => `${escapeMarkdown(row.name)}: **${formatNumber(row.net)}** (${formatPercent(row.sharePct)})`)
          .join("\n")
          .slice(0, 1024),
        inline: false,
      });
    }
    fields.push({
      name: "Parte de cada sócio",
      value: summary.partners.map(row => `<@${row.userId}>: **${formatNumber(row.net)}**`).join("\n") || "—",
      inline: false,
    });
    if (summary.gross) {
      fields.push({
        name: "Bruto estimado (preços cadastrados)",
        value: `≈ **${formatNumber(summary.gross.gross)}** em ${formatNumber(summary.gross.coveredCount)} de ${formatNumber(totals.count)} vendas (líquido dessas: ${formatNumber(summary.gross.coveredNet)})`,
        inline: false,
      });
    }
  }

  return {
    color: COLORS.primary,
    title: heading,
    description: descriptionLines.join("\n"),
    fields,
    footer: { text: `${NET_NOTE} · ${period.description}` },
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- lista paginada

function salesPageEmbed({ sales, page, totalPages, totalCount, totals, title, filtersText, timeZone, groupName }) {
  const lines = sales.map(sale => {
    const when = formatShortDateTime(new Date(sale.createdAt), timeZone);
    const item = truncate(escapeMarkdown(sale.itemName || `Item ${sale.itemId || "?"}`), 38);
    const buyer = sale.buyerName ? link(truncate(sale.buyerName, 22), profileUrl(sale.buyerId)) : "?";
    return `\`${when}\` **${formatNumber(sale.amount)}** · ${item} · ${buyer}${sale.isPending ? " ⏳" : ""}`;
  });
  const description = [
    `**${formatNumber(totals.net)} Robux** em **${formatNumber(totalCount)}** vendas · pendente ${formatNumber(totals.pendingNet)}`,
    filtersText ? `-# ${filtersText}` : null,
    "",
    lines.length ? lines.join("\n") : "Nenhuma venda encontrada com esses filtros.",
  ].filter(line => line !== null).join("\n");
  const groupsOnPage = [...new Set(sales.map(sale => sale.groupId))];
  return {
    color: COLORS.primary,
    title,
    description: description.slice(0, 4096),
    footer: {
      text: `Página ${page} de ${Math.max(1, totalPages)} · ${NET_NOTE}${groupsOnPage.length === 1 && groupName ? ` · ${groupName(groupsOnPage[0])}` : ""}`,
    },
  };
}

// ---------------------------------------------------------------- saldo / item / status / alerta

function fundsEmbed(rows, ctx) {
  const total = rows.reduce((sum, row) => sum + (row.robux || 0), 0);
  const pending = rows.reduce((sum, row) => sum + (row.pendingRobux || 0), 0);
  return {
    color: COLORS.primary,
    title: "Saldo dos grupos",
    description: `## ${formatNumber(total)} Robux\nPendentes: **${formatNumber(pending)}**`,
    fields: rows.map(row => ({
      name: row.name,
      value: [
        `Saldo: **${formatNumber(row.robux)}**`,
        `Pendentes: ${formatNumber(row.pendingRobux)}`,
        row.stale ? `-# ⚠️ dado salvo em ${formatDateTime(new Date(row.takenAt), ctx.timeZone)} (API indisponível agora)` : null,
      ].filter(Boolean).join("\n"),
      inline: true,
    })),
    footer: { text: "Saldo = Robux disponíveis no grupo · Pendentes = ainda não liberados pela Roblox" },
    timestamp: new Date().toISOString(),
  };
}

function itemEmbed(info, stats, ctx) {
  const lines = stats.buckets
    .slice(-12)
    .map(bucket => `${bucket.label.padEnd(7)} ${formatNumber(bucket.net).padStart(9)}  ${formatNumber(bucket.count).padStart(5)}`);
  const fields = [
    { name: "Vendas", value: `**${formatNumber(stats.totals.count)}**`, inline: true },
    { name: "Ticket médio", value: `**${formatNumber(stats.totals.count ? stats.totals.net / stats.totals.count : 0)}**`, inline: true },
    { name: "Pendente", value: formatNumber(stats.totals.pendingNet), inline: true },
    {
      name: "Primeira · última venda",
      value: stats.totals.firstAt
        ? `${formatDate(new Date(stats.totals.firstAt), ctx.timeZone)} · ${formatDateTime(new Date(stats.totals.lastAt), ctx.timeZone)}`
        : "—",
      inline: false,
    },
    {
      name: "Últimos 30 dias",
      value: `**${formatNumber(stats.last30.net)}** em ${formatNumber(stats.last30.count)} vendas · ${stats.change30.text} vs 30 dias anteriores`,
      inline: false,
    },
  ];
  if (lines.length) {
    fields.push({
      name: `Por ${stats.granularity === "month" ? "mês" : stats.granularity === "week" ? "semana" : "dia"} (líquido · vendas)`,
      value: `\`\`\`\n${lines.join("\n")}\n\`\`\``.slice(0, 1024),
      inline: false,
    });
  }
  if (stats.topBuyers.length) {
    fields.push({
      name: "Top compradores",
      value: rankedList(stats.topBuyers, row => link(truncate(row.buyerName || `ID ${row.buyerId}`, 32), profileUrl(row.buyerId))),
      inline: false,
    });
  }
  return {
    color: COLORS.primary,
    title: truncate(info.itemName || `Item ${info.itemId}`, 200),
    url: itemUrl({ itemId: info.itemId, itemType: info.itemType }) || undefined,
    description: `## ${formatNumber(stats.totals.net)} Robux\n${info.groupIds.map(ctx.groupName).map(escapeMarkdown).join(" · ")}`,
    fields,
    footer: { text: `${NET_NOTE} · item ${info.itemId}${info.itemType ? ` · ${info.itemType}` : ""}` },
    timestamp: new Date().toISOString(),
  };
}

function statusEmbed(status, ctx) {
  const cookieLabels = {
    ok: "✅ OK",
    invalid: "❌ Inválido/expirado",
    unknown: "❔ Ainda não testado",
  };
  const fields = status.groups.map(group => {
    const s = group.state;
    const lines = [
      `Última sync OK: ${s.last_success_at ? formatDateTime(new Date(s.last_success_at), ctx.timeZone) : "nunca"}`,
      `Backfill: ${s.backfill_done ? `concluído${s.backfill_completed_at ? ` em ${formatDate(new Date(s.backfill_completed_at), ctx.timeZone)}` : ""}` : `em andamento (${formatNumber(s.backfill_pages)} pág.)`}`,
      `Vendas no banco: ${formatNumber(group.salesCount)}`,
    ];
    if (Number(s.consecutive_failures) > 0) lines.push(`⚠️ ${s.consecutive_failures} falha(s) seguida(s)`);
    if (s.last_error && (!s.last_success_at || s.last_error_at > s.last_success_at)) lines.push(`Erro: ${truncate(s.last_error, 150)}`);
    return { name: group.name, value: lines.join("\n").slice(0, 1024), inline: false };
  });
  if (status.recentErrors.length) {
    fields.push({
      name: "Erros recentes",
      value: status.recentErrors
        .map(err => `\`${formatShortDateTime(new Date(err.occurred_at), ctx.timeZone)}\` ${err.group_id ? `${ctx.groupName(err.group_id)}: ` : ""}${truncate(err.message, 120)}`)
        .join("\n")
        .slice(0, 1024),
    });
  }
  fields.push({
    name: "Sistema",
    value: [
      `Uptime: ${status.uptime}`,
      `Banco: ${status.dbDriver} · ${formatNumber(status.totalSales)} vendas`,
      `Avisos pendentes de envio: ${formatNumber(status.unnotified)}`,
      `Último backup: ${status.lastBackup ? formatDateTime(new Date(status.lastBackup.at), ctx.timeZone) : "nenhum ainda"}`,
      `Último saldo: ${status.lastFunds ? formatDateTime(new Date(status.lastFunds), ctx.timeZone) : "nenhum ainda"}`,
    ].join("\n"),
  });
  const cookieOk = status.cookie.status === "ok";
  return {
    color: cookieOk ? COLORS.ok : status.cookie.status === "invalid" ? COLORS.error : COLORS.neutral,
    title: "Status do sales-bot",
    description: `Cookie Roblox: **${cookieLabels[status.cookie.status] || status.cookie.status}**${status.cookie.checkedAt ? ` · verificado ${formatDateTime(new Date(status.cookie.checkedAt), ctx.timeZone)}` : ""}${status.cookie.status === "invalid" && status.cookie.retryAt ? `\nPróxima tentativa: ${formatDateTime(new Date(status.cookie.retryAt), ctx.timeZone)}` : ""}`,
    fields,
    timestamp: new Date().toISOString(),
  };
}

function alertEmbed(alert) {
  const color = alert.level === "ok" ? COLORS.ok : alert.level === "warn" ? COLORS.warn : alert.level === "info" ? COLORS.neutral : COLORS.error;
  const prefix = alert.level === "ok" ? "✅" : alert.level === "info" ? "ℹ️" : "⚠️";
  return {
    color,
    title: truncate(`${prefix} ${alert.title}`, 256),
    description: String(alert.message || "").slice(0, 4096),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  COLORS,
  saleEmbed,
  groupedSalesEmbed,
  summaryEmbed,
  salesPageEmbed,
  fundsEmbed,
  itemEmbed,
  statusEmbed,
  alertEmbed,
  profileUrl,
  itemUrl,
};
