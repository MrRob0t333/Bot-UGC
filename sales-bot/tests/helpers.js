"use strict";

/** Utilidades de teste: banco em memória, vendas Roblox falsas, fetch e Roblox mockados. */

const { openDatabase } = require("../src/db/driver");
const { migrate } = require("../src/db/migrations");
const { createRepository } = require("../src/db/repository");

const OWNER_A = "1108166595374751828";
const OWNER_B = "433699177705504768";

function memoryRepo() {
  const db = openDatabase(":memory:");
  migrate(db);
  return createRepository(db);
}

/** Venda no formato (esperado) da API v2 de transações da Roblox. */
function rawSale(n, overrides = {}) {
  return {
    id: 0,
    idHash: `hash-${n}`,
    transactionType: "Sale",
    created: overrides.created || new Date(Date.UTC(2026, 9, 18, 12, 0, 0) - n * 60000).toISOString(),
    isPending: overrides.isPending ?? false,
    agent: { id: 1000 + n, type: "User", name: `comprador${n}` },
    details: { id: 500 + (n % 3), name: `Item ${n % 3}`, type: "Asset", place: null },
    currency: { amount: overrides.amount ?? 7, type: "Robux" },
    purchaseToken: `tok-${n}`,
    ...overrides.extra,
  };
}

/**
 * Fonte Roblox falsa: `pages` é uma lista de listas de vendas brutas
 * (página 0 = mais recentes). Conta chamadas.
 */
function fakeRoblox(pagesRef, extras = {}) {
  const calls = { pages: [], funds: 0 };
  const { parseSalesPage } = require("../src/roblox/parser");
  return {
    calls,
    async getSalesPage(groupId, cursor) {
      calls.pages.push(cursor);
      if (extras.failWith) throw extras.failWith;
      const pages = typeof pagesRef === "function" ? pagesRef() : pagesRef;
      const index = cursor ? Number(cursor.replace("c", "")) : 0;
      const data = pages[index] || [];
      const json = { data, nextPageCursor: index + 1 < pages.length ? `c${index + 1}` : null };
      return { ...parseSalesPage(json, String(groupId)), raw: json };
    },
    async getFunds() {
      calls.funds += 1;
      if (extras.fundsError) throw extras.fundsError;
      return { robux: 12480, raw: { robux: 12480 } };
    },
    async getRevenueSummary() {
      return { pendingRobux: 3200, raw: { pendingRobux: 3200 } };
    },
    async getAuthenticatedUser() {
      return { id: 1, name: "alt" };
    },
    async getGroupInfo(id) {
      return { id, name: "Grupo" };
    },
  };
}

function testConfig(overrides = {}) {
  return {
    timezone: "America/Sao_Paulo",
    ownerIds: [OWNER_A, OWNER_B],
    groups: [
      { id: "111", name: "Grupo A", split: { [OWNER_A]: 50, [OWNER_B]: 50 } },
      { id: "222", name: "Grupo B", split: { [OWNER_A]: 100, [OWNER_B]: 0 } },
    ],
    sync: {
      pollIntervalMinutes: 3,
      pendingRecheckDays: 10,
      backfillPageDelayMs: 0,
      fundsSnapshotMinutes: 30,
      backupKeep: 14,
      maxIncrementalPages: 100,
      pendingSweepMinutes: 0,
      maxSweepPages: 1000,
    },
    schedules: {
      daily: { hour: 23, minute: 0 },
      weekly: { hour: 23, minute: 5 },
      weeklyDay: 0,
      monthly: { hour: 9, minute: 0 },
      monthlyDay: 1,
    },
    discord: { summaryChannelId: "999", salesChannelId: "998" },
    ...overrides,
  };
}

function fakeAlerts() {
  const sent = [];
  const active = new Set();
  return {
    sent,
    active,
    async raise(key, alert) {
      if (active.has(key)) return false;
      active.add(key);
      sent.push({ key, ...alert });
      return true;
    },
    async resolve(key, alert) {
      if (!active.has(key)) return false;
      active.delete(key);
      if (alert?.title) sent.push({ key, resolved: true, ...alert });
      return true;
    },
    async notify(alert) {
      sent.push({ key: null, ...alert });
    },
  };
}

module.exports = { memoryRepo, rawSale, fakeRoblox, testConfig, fakeAlerts, OWNER_A, OWNER_B };
