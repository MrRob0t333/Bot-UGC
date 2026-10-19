"use strict";

/**
 * Porta de entrada da camada Roblox (Clean Architecture): o resto do bot só
 * depende do contrato abaixo, nunca de URLs, cookies ou formato bruto da API.
 *
 * Para trocar o cookie por uma API key do Open Cloud no futuro, crie
 * `openCloudClient.js` implementando os mesmos métodos e escolha-o aqui.
 *
 * @typedef {object} Sale
 * @property {string} id            chave única "<groupId>:<idTransação|h:hash>"
 * @property {string} groupId
 * @property {string} createdAt     ISO UTC
 * @property {number} amount        Robux líquidos
 * @property {boolean} isPending
 * @property {string|null} itemId, itemName, itemType, placeId, placeName, buyerId, buyerName
 * @property {string} rawJson
 *
 * @typedef {object} RobloxSalesSource
 * @property {(groupId: string, cursor?: string|null) => Promise<{sales: Sale[], nextCursor: string|null, skipped: object[]}>} getSalesPage
 * @property {(groupId: string) => Promise<{robux: number|null}>} getFunds
 * @property {(groupId: string, timeFrame: string) => Promise<{pendingRobux: number|null}>} getRevenueSummary
 * @property {() => Promise<{id: number, name: string}>} getAuthenticatedUser
 * @property {(groupId: string) => Promise<{id: string, name: string|null}>} getGroupInfo
 */

const { createCookieClient } = require("./cookieClient");
const errors = require("./errors");

/** @returns {RobloxSalesSource} */
function createRobloxClient(config, { logger, fetchImpl } = {}) {
  return createCookieClient({
    cookie: config.roblox.cookie,
    timeoutMs: config.roblox.timeoutMs,
    requestsPerMinute: config.roblox.requestsPerMinute,
    logger,
    fetchImpl,
  });
}

module.exports = { createRobloxClient, ...errors };
