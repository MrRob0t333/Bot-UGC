"use strict";

/**
 * Parser defensivo das respostas da API de economia da Roblox.
 * Princípio: nunca confiar no formato. Campos ausentes viram null, o JSON bruto
 * é sempre preservado e só uma resposta sem a lista de vendas é tratada como erro.
 */

const crypto = require("crypto");
const { RobloxParseError } = require("./errors");

function pick(object, ...paths) {
  for (const path of paths) {
    let value = object;
    for (const key of path.split(".")) {
      if (value === null || value === undefined) break;
      value = value[key];
    }
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function asIdString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "0") return null;
  return text;
}

function asBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return /^(true|1|yes|pending)$/i.test(value.trim());
  return false;
}

function asDate(value) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Hash determinístico para vendas sem ID estável (ordem fixa de campos). */
function deterministicHash(groupId, fields) {
  const material = JSON.stringify([String(groupId), ...fields.map(value => (value === null || value === undefined ? null : String(value)))]);
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
}

/**
 * Normaliza uma venda. Retorna null (e o motivo) se faltar o mínimo (data e valor).
 * @returns {{ sale: object|null, problem: string|null }}
 */
function parseSale(raw, groupId) {
  if (!raw || typeof raw !== "object") return { sale: null, problem: "entrada não é um objeto" };

  const created = asDate(pick(raw, "created", "createdAt", "created_at", "date", "timestamp"));
  const amountRaw = pick(raw, "currency.amount", "amount", "robux", "price");
  const amount = amountRaw === null ? NaN : Number(amountRaw);
  if (!created) return { sale: null, problem: "sem data de criação" };
  if (!Number.isFinite(amount)) return { sale: null, problem: "sem valor numérico" };

  const buyerId = asIdString(pick(raw, "agent.id", "agent.agentId", "buyer.id", "user.id"));
  const buyerName = pick(raw, "agent.name", "agent.username", "buyer.name", "user.name");
  const itemId = asIdString(pick(raw, "details.id", "details.assetId", "item.id", "assetId"));
  const itemName = pick(raw, "details.name", "item.name", "assetName");
  const itemType = pick(raw, "details.type", "item.type", "assetType");
  const placeId = asIdString(pick(raw, "details.place.placeId", "details.place.id", "place.placeId", "place.id"));
  const placeName = pick(raw, "details.place.name", "place.name");
  const currencyType = pick(raw, "currency.type", "currencyType") || "Robux";
  const isPending = asBool(pick(raw, "isPending", "pending", "is_pending"));

  const transactionId = asIdString(pick(raw, "idHash", "id", "transactionId", "purchaseToken"));
  const localId = transactionId
    ? transactionId
    : `h:${deterministicHash(groupId, [created.toISOString(), buyerId, itemId, amount, placeId, itemType])}`;

  return {
    problem: null,
    sale: {
      id: `${groupId}:${localId}`,
      hasStableId: Boolean(transactionId),
      groupId: String(groupId),
      createdAt: created.toISOString(),
      amount: Math.trunc(amount),
      currencyType: String(currencyType),
      isPending,
      itemId,
      itemName: itemName === null ? null : String(itemName),
      itemType: itemType === null ? null : String(itemType),
      placeId,
      placeName: placeName === null ? null : String(placeName),
      buyerId,
      buyerName: buyerName === null ? null : String(buyerName),
      rawJson: JSON.stringify(raw),
    },
  };
}

/**
 * Página de transações. Lança RobloxParseError se não houver lista de dados.
 * @returns {{ sales: object[], nextCursor: string|null, skipped: {problem, raw}[] }}
 */
function parseSalesPage(json, groupId) {
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.transactions) ? json.transactions : null;
  if (!list) {
    throw new RobloxParseError(`Resposta de transações do grupo ${groupId} sem lista "data" (chaves: ${Object.keys(json || {}).join(", ") || "nenhuma"}).`);
  }
  const sales = [];
  const skipped = [];
  for (const raw of list) {
    // Ignora explicitamente transações que não são venda, se o campo existir.
    const type = pick(raw, "transactionType", "type");
    if (type && typeof type === "string" && !/sale/i.test(type) && raw?.details) {
      skipped.push({ problem: `tipo ${type}`, raw });
      continue;
    }
    const { sale, problem } = parseSale(raw, groupId);
    if (sale) sales.push(sale);
    else skipped.push({ problem, raw });
  }
  const nextCursor = pick(json, "nextPageCursor", "nextCursor", "next_page_cursor");
  return { sales, nextCursor: nextCursor ? String(nextCursor) : null, skipped };
}

function parseFunds(json) {
  const value = pick(json, "robux", "balance", "amount");
  const robux = value === null ? null : Number(value);
  return { robux: Number.isFinite(robux) ? Math.trunc(robux) : null };
}

/** Resumo de receita: guardamos tudo, mas expomos o pendente e as vendas de itens. */
function parseRevenueSummary(json) {
  const number = key => {
    const value = Number(json?.[key]);
    return Number.isFinite(value) ? Math.trunc(value) : null;
  };
  return {
    pendingRobux: number("pendingRobux"),
    itemSaleRobux: number("itemSaleRobux"),
    raw: json ?? null,
  };
}

module.exports = { parseSale, parseSalesPage, parseFunds, parseRevenueSummary, deterministicHash, pick };
