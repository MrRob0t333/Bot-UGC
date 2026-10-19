"use strict";

/** Formatação pt-BR compartilhada (números, porcentagens, variação). */

const integerFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return integerFormat.format(Math.round(Number(value)));
}

function formatRobux(value) {
  return `${formatNumber(value)} Robux`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${percentFormat.format(value)}%`;
}

/**
 * Variação percentual entre atual e anterior.
 * @returns {{ pct: number|null, text: string, direction: "up"|"down"|"flat"|"new"|"none" }}
 */
function percentChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0 && cur === 0) return { pct: 0, text: "— sem vendas nos dois períodos", direction: "none" };
  if (prev === 0) return { pct: null, text: "▲ novo (anterior sem vendas)", direction: "new" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return { pct: 0, text: "= 0,0%", direction: "flat" };
  const arrow = pct > 0 ? "▲" : "▼";
  return { pct, text: `${arrow} ${formatPercent(Math.abs(pct))}`, direction: pct > 0 ? "up" : "down" };
}

function truncate(text, max) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

/** Remove marcação Markdown do Discord de textos vindos da Roblox (nomes). */
function escapeMarkdown(text) {
  return String(text ?? "").replace(/([\\*_`~|>[\]()#-])/g, "\\$1");
}

module.exports = { formatNumber, formatRobux, formatPercent, percentChange, truncate, escapeMarkdown };
