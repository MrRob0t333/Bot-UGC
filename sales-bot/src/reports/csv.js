"use strict";

/**
 * CSV para o Excel em português: UTF-8 com BOM, separador ";", quebra CRLF.
 * Textos vindos da Roblox são protegidos contra injeção de fórmula (=, +, -, @).
 */

const { formatDateTime, zonedParts, pad } = require("../time");

const BOM = "﻿";
const SEPARATOR = ";";

function escapeCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatLocalSeconds(date, tz) {
  const p = zonedParts(date, tz);
  return `${formatDateTime(date, tz)}:${pad(p.second)}`;
}

const COLUMNS = [
  ["Data (local)", (sale, ctx) => formatLocalSeconds(new Date(sale.createdAt), ctx.timeZone)],
  ["Data (UTC)", sale => sale.createdAt],
  ["Grupo", (sale, ctx) => ctx.groupName(sale.groupId)],
  ["ID do grupo", sale => sale.groupId],
  ["Item", sale => sale.itemName],
  ["ID do item", sale => sale.itemId],
  ["Tipo do item", sale => sale.itemType],
  ["Lugar", sale => sale.placeName],
  ["Valor líquido (Robux)", sale => sale.amount],
  ["Bruto (preço cadastrado)", (sale, ctx) => ctx.grossPrice(sale.itemId)],
  ["Status", sale => (sale.isPending ? "Pendente" : "Liberado")],
  ["Comprador", sale => sale.buyerName],
  ["ID do comprador", sale => sale.buyerId],
  ["ID da transação", sale => sale.id],
];

/**
 * @param {object[]} sales vendas normalizadas (repository.rowToSale)
 * @param {object} ctx { timeZone, groupName(id), grossPrice(itemId) }
 */
function salesToCsv(sales, ctx) {
  const context = {
    timeZone: ctx.timeZone || "America/Sao_Paulo",
    groupName: ctx.groupName || (id => id),
    grossPrice: ctx.grossPrice || (() => null),
  };
  const lines = [COLUMNS.map(([header]) => escapeCell(header)).join(SEPARATOR)];
  for (const sale of sales) {
    lines.push(COLUMNS.map(([, getter]) => escapeCell(getter(sale, context))).join(SEPARATOR));
  }
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

module.exports = { salesToCsv, escapeCell, BOM, SEPARATOR, COLUMNS };
