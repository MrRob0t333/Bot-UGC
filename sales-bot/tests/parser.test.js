"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSale, parseSalesPage, parseFunds, parseRevenueSummary } = require("../src/roblox/parser");
const { RobloxParseError } = require("../src/roblox/errors");
const { rawSale } = require("./helpers");

test("parser: venda completa no formato esperado", () => {
  const { sale, problem } = parseSale(rawSale(1, { isPending: true, amount: 70 }), "111");
  assert.equal(problem, null);
  assert.equal(sale.id, "111:hash-1");
  assert.equal(sale.hasStableId, true);
  assert.equal(sale.groupId, "111");
  assert.equal(sale.amount, 70);
  assert.equal(sale.isPending, true);
  assert.equal(sale.buyerId, "1001");
  assert.equal(sale.buyerName, "comprador1");
  assert.equal(sale.itemId, "501");
  assert.equal(sale.itemName, "Item 1");
  assert.equal(sale.itemType, "Asset");
  assert.equal(sale.currencyType, "Robux");
  assert.deepEqual(JSON.parse(sale.rawJson).purchaseToken, "tok-1");
});

test("parser: usa id numérico quando não há idHash e ignora id 0", () => {
  const raw = rawSale(2, { extra: { idHash: undefined, id: 987654321 } });
  assert.equal(parseSale(raw, "111").sale.id, "111:987654321");
  const zero = rawSale(3, { extra: { idHash: "", id: 0, purchaseToken: undefined } });
  const { sale } = parseSale(zero, "111");
  assert.match(sale.id, /^111:h:[0-9a-f]{32}$/);
  assert.equal(sale.hasStableId, false);
});

test("parser: hash determinístico é estável entre execuções", () => {
  const raw = rawSale(4, { extra: { idHash: null, id: null, purchaseToken: null } });
  const a = parseSale(raw, "111").sale.id;
  const b = parseSale(JSON.parse(JSON.stringify(raw)), "111").sale.id;
  assert.equal(a, b);
  const other = parseSale({ ...raw, currency: { amount: 8 } }, "111").sale.id;
  assert.notEqual(a, other);
});

test("parser: campos ausentes viram null sem quebrar", () => {
  const { sale } = parseSale({ idHash: "x", created: "2026-10-18T10:00:00Z", currency: { amount: "5" } }, "9");
  assert.equal(sale.amount, 5);
  assert.equal(sale.buyerId, null);
  assert.equal(sale.itemName, null);
  assert.equal(sale.placeId, null);
  assert.equal(sale.isPending, false);
});

test("parser: place aninhado e variações de nome de campo", () => {
  const { sale } = parseSale({
    idHash: "p",
    createdAt: "2026-10-18T10:00:00Z",
    pending: "true",
    agent: { id: 5, name: "z" },
    details: { id: 7, name: "Passe", type: "GamePass", place: { placeId: 42, name: "Meu Jogo" } },
    currency: { amount: 70, type: "Robux" },
  }, "1");
  assert.equal(sale.placeId, "42");
  assert.equal(sale.placeName, "Meu Jogo");
  assert.equal(sale.isPending, true);
});

test("parser: rejeita vendas sem data ou sem valor", () => {
  assert.equal(parseSale({ idHash: "a", currency: { amount: 1 } }, "1").sale, null);
  assert.equal(parseSale({ idHash: "a", created: "2026-01-01T00:00:00Z" }, "1").sale, null);
  assert.equal(parseSale(null, "1").sale, null);
});

test("parser: página com cursor e itens inválidos ignorados", () => {
  const page = parseSalesPage({ data: [rawSale(1), { lixo: true }, rawSale(2)], nextPageCursor: "abc" }, "111");
  assert.equal(page.sales.length, 2);
  assert.equal(page.skipped.length, 1);
  assert.equal(page.nextCursor, "abc");
});

test("parser: página sem lista lança RobloxParseError", () => {
  assert.throws(() => parseSalesPage({ errors: [{ message: "x" }] }, "111"), RobloxParseError);
});

test("parser: saldo e resumo de receita", () => {
  assert.deepEqual(parseFunds({ robux: 12480 }), { robux: 12480 });
  assert.deepEqual(parseFunds({}), { robux: null });
  const summary = parseRevenueSummary({ recurringRobuxStipend: 0, itemSaleRobux: 100, pendingRobux: 30 });
  assert.equal(summary.pendingRobux, 30);
  assert.equal(summary.itemSaleRobux, 100);
});
