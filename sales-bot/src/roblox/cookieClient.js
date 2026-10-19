"use strict";

/**
 * Implementação do "RobloxSalesSource" usando o cookie .ROBLOSECURITY de uma conta
 * alternativa com permissão só de ver as finanças do grupo.
 *
 * Contrato (veja src/roblox/index.js):
 *   getSalesPage(groupId, cursor?) -> { sales, nextCursor, skipped }
 *   getFunds(groupId)              -> { robux, raw }
 *   getRevenueSummary(groupId, tf) -> { pendingRobux, itemSaleRobux, raw }
 *   getAuthenticatedUser()         -> { id, name, displayName }
 *   getGroupInfo(groupId)          -> { id, name } (público)
 */

const { createHttpClient } = require("./http");
const { parseSalesPage, parseFunds, parseRevenueSummary } = require("./parser");
const { registerSecret } = require("../logger");

const ECONOMY = "https://economy.roblox.com";

function createCookieClient(options = {}) {
  const { cookie, timeoutMs, requestsPerMinute, logger, fetchImpl, sleep, random, maxRetries, baseDelayMs } = options;
  if (!cookie) throw new Error("ROBLOX_COOKIE ausente.");
  registerSecret(cookie);

  const http = createHttpClient({
    fetchImpl,
    sleep,
    random,
    timeoutMs,
    requestsPerMinute,
    maxRetries,
    baseDelayMs,
    logger,
    defaultHeaders: {
      Cookie: `.ROBLOSECURITY=${cookie}`,
      Accept: "application/json",
      "User-Agent": "sales-bot/1.0 (+discord)",
    },
  });

  return {
    kind: "cookie",
    http,

    async getSalesPage(groupId, cursor = null) {
      const url = new URL(`${ECONOMY}/v2/groups/${groupId}/transactions`);
      url.searchParams.set("transactionType", "Sale");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const json = await http.getJson(url.toString());
      return { ...parseSalesPage(json, String(groupId)), raw: json };
    },

    async getFunds(groupId) {
      const json = await http.getJson(`${ECONOMY}/v1/groups/${groupId}/currency`);
      return { ...parseFunds(json), raw: json };
    },

    async getRevenueSummary(groupId, timeFrame = "Day") {
      const json = await http.getJson(`${ECONOMY}/v1/groups/${groupId}/revenue/summary/${timeFrame}`);
      return parseRevenueSummary(json);
    },

    async getAuthenticatedUser() {
      const json = await http.getJson("https://users.roblox.com/v1/users/authenticated");
      return { id: json?.id ?? null, name: json?.name ?? null, displayName: json?.displayName ?? null };
    },

    async getGroupInfo(groupId) {
      const json = await http.getJson(`https://groups.roblox.com/v1/groups/${groupId}`);
      return { id: String(json?.id ?? groupId), name: json?.name ?? null };
    },
  };
}

module.exports = { createCookieClient };
