"use strict";

/**
 * Agregações de vendas para resumos, independentes do Discord.
 */

const { percentChange } = require("../format");
const { defaultSplit } = require("../config");

/**
 * Divide um total inteiro entre sócios pelo método dos maiores restos,
 * garantindo que as partes (inteiras) somem exatamente o total.
 * @param {number} total
 * @param {Record<string, number>} split porcentagens que somam 100
 */
function splitAmount(total, split) {
  const entries = Object.entries(split);
  if (!entries.length) return {};
  const raw = entries.map(([userId, percent]) => {
    const exact = (total * percent) / 100;
    return { userId, exact, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let leftover = total - raw.reduce((sum, item) => sum + item.floor, 0);
  const order = [...raw].sort((a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId));
  for (const item of order) {
    if (leftover <= 0) break;
    if (item.exact === 0) continue;
    item.floor += 1;
    leftover -= 1;
  }
  return Object.fromEntries(raw.map(item => [item.userId, item.floor]));
}

/** Soma as partes de cada sócio a partir dos totais por grupo. */
function partnerShares(byGroup, groups, ownerIds) {
  const totals = new Map();
  for (const ownerId of ownerIds) totals.set(ownerId, 0);
  for (const row of byGroup) {
    const group = groups.find(entry => entry.id === String(row.groupId));
    const split = group?.split || defaultSplit(ownerIds);
    for (const [userId, amount] of Object.entries(splitAmount(row.net, split))) {
      totals.set(userId, (totals.get(userId) || 0) + amount);
    }
  }
  return [...totals.entries()].map(([userId, net]) => ({ userId, net }));
}

function groupName(groups, groupId) {
  return groups.find(entry => entry.id === String(groupId))?.name || `Grupo ${groupId}`;
}

/**
 * @param {object} repo
 * @param {object} options { period, groupId, groups, ownerIds }
 */
function buildSummary(repo, { period, groupId = null, groups = [], ownerIds = [] }) {
  const filter = { start: period.start, end: period.end, groupId };
  const totals = repo.totals(filter);
  const avgTicket = totals.count ? totals.net / totals.count : 0;

  let previous = null;
  if (period.previous) {
    const prevTotals = repo.totals({ start: period.previous.start, end: period.previous.end, groupId });
    const prevAvg = prevTotals.count ? prevTotals.net / prevTotals.count : 0;
    previous = {
      ...prevTotals,
      avgTicket: prevAvg,
      change: {
        net: percentChange(totals.net, prevTotals.net),
        count: percentChange(totals.count, prevTotals.count),
        avgTicket: percentChange(avgTicket, prevAvg),
      },
    };
  }

  const byGroup = repo.totalsByGroup(filter).map(row => ({
    ...row,
    name: groupName(groups, row.groupId),
    sharePct: totals.net ? (row.net / totals.net) * 100 : 0,
  }));

  const gross = repo.grossEstimate(filter);

  return {
    period,
    groupId,
    groupName: groupId ? groupName(groups, groupId) : null,
    totals,
    avgTicket,
    previous,
    topItems: repo.topItems(filter, 5),
    topBuyers: repo.topBuyers(filter, 5),
    byGroup,
    partners: partnerShares(byGroup, groups, ownerIds),
    gross: gross.coveredCount > 0 ? gross : null,
  };
}

// Campos de contagem/valor que uma simulação multiplica (percentuais e datas ficam iguais).
const SCALED_KEYS = ["net", "count", "releasedNet", "releasedCount", "pendingNet", "pendingCount", "gross", "coveredNet", "coveredCount"];

function scaleRow(row, factor) {
  const out = { ...row };
  for (const key of SCALED_KEYS) if (typeof out[key] === "number") out[key] = Math.round(out[key] * factor);
  return out;
}

/**
 * Cópia do resumo com valores e contagens multiplicados (comando /simular).
 * A comparação com o período anterior é removida: comparar número simulado com real não faz sentido.
 */
function scaleSummary(summary, factor) {
  return {
    ...summary,
    simulatedFactor: factor,
    totals: scaleRow(summary.totals, factor),
    previous: null,
    topItems: summary.topItems.map(row => scaleRow(row, factor)),
    topBuyers: summary.topBuyers.map(row => scaleRow(row, factor)),
    byGroup: summary.byGroup.map(row => scaleRow(row, factor)),
    partners: summary.partners.map(row => scaleRow(row, factor)),
    gross: summary.gross ? scaleRow(summary.gross, factor) : null,
  };
}

module.exports = { buildSummary, scaleSummary, splitAmount, partnerShares, groupName };
