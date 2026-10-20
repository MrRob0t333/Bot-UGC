"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, saleFromRow, groupIdFromFilename, importSalesCsv } = require("../src/importers/salesCsv");
const { parseSalesPage } = require("../src/roblox/parser");
const { memoryRepo, rawSale } = require("./helpers");

const HEADER = "Id,Buyer User Id,Date and Time,Location,Location Id,Universe Id,Universe,Asset Id,Asset Name,Asset Type,Hold Status,Revenue,Price";
const BASE = Date.UTC(2026, 9, 18, 12, 0, 0);
const at = minutesAgo => new Date(BASE - minutesAgo * 60000).toISOString();

function csvLine({ id, buyer, when, item, name = "Item", status = "Held", revenue = 7, price = 23 }) {
  return [id, buyer, when, "Website", "Null", "Null", "Null", item, name.includes(",") ? `"${name}"` : name, "Hat", status, `${revenue}.0`, `${price}.0`].join(",");
}

/** Banco com vendas "da API" de 0 a 9 min atrás (rawSale: comprador 1000+n, item 500+n%3, 7 Robux). */
function repoWithApiSales() {
  const repo = memoryRepo();
  const raws = Array.from({ length: 10 }, (_, n) => rawSale(n, { created: at(n) }));
  repo.upsertSales(parseSalesPage({ data: raws }, "111").sales, { markNotified: true });
  repo.updateSyncState("111", { backfill_done: 1 });
  return repo;
}

test("csv: parser lida com BOM, aspas, vírgulas e aspas escapadas", () => {
  const rows = parseCsv(`\uFEFF${HEADER}\r\nA,1,2026-10-01T00:00:00Z,Game,77,Null,Null,9,"The Crimson God, Buffet""s Head",Hat,Released,27.0,90.0\r\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Asset Name"], 'The Crimson God, Buffet"s Head');
  const sale = saleFromRow(rows[0], "111");
  assert.equal(sale.id, "111:csv:A");
  assert.equal(sale.amount, 27);
  assert.equal(sale.gross, 90);
  assert.equal(sale.isPending, false);
  assert.equal(sale.placeId, "77");
  assert.equal(groupIdFromFilename("Sales_Group460864337_2026-10.csv"), "460864337");
  assert.equal(groupIdFromFilename("vendas.csv"), null);
});

test("csv: importa o que é mais antigo que a API, confere o período em comum e não duplica", () => {
  const repo = repoWithApiSales();
  const lines = [
    csvLine({ id: "novo1", buyer: 1005, when: new Date(BASE + 60000).toISOString(), item: 502 }), // mais nova que a API
    csvLine({ id: "par3", buyer: 1003, when: new Date(Date.parse(at(3)) + 2000).toISOString(), item: 500 }), // = venda 3 (2 s de diferença)
    csvLine({ id: "par4", buyer: 1004, when: new Date(Date.parse(at(4)) - 1500).toISOString(), item: 501 }), // = venda 4
    csvLine({ id: "sempar", buyer: 9999, when: at(5), item: 500 }), // período da API, sem par
    csvLine({ id: "antiga1", buyer: 50, when: at(60 * 24 * 5), item: 700, revenue: 30, price: 100, status: "Released" }),
    csvLine({ id: "antiga2", buyer: 51, when: at(60 * 24 * 6), item: 701, name: "Chapéu, azul", revenue: 20, price: 65 }),
    "x,1,data-ruim,Website,Null,Null,Null,1,a,Hat,Held,abc,1",
  ];
  const text = [HEADER, ...lines].join("\n");
  const result = importSalesCsv(repo, { groupId: "111", text });
  assert.equal(result.rows, 7);
  assert.equal(result.imported, 2);
  assert.equal(result.importedNet, 50);
  assert.equal(result.importedGross, 165);
  assert.equal(result.matched, 2);
  assert.equal(result.unmatched, 1);
  assert.equal(result.newerSkipped, 1);
  assert.equal(result.invalid, 1);
  assert.equal(repo.countSales({ groupId: "111" }), 12);
  assert.equal(repo.countUnnotified(), 0);

  // Reimportar o mesmo arquivo não muda nada.
  const again = importSalesCsv(repo, { groupId: "111", text });
  assert.equal(again.imported, 0);
  assert.equal(again.alreadyImported, 2);
  assert.equal(repo.countSales({ groupId: "111" }), 12);
});

test("csv: recusa enquanto o bot ainda não sincronizou ou importa o histórico pela API", () => {
  const empty = memoryRepo();
  assert.throws(() => importSalesCsv(empty, { groupId: "111", text: `${HEADER}\n${csvLine({ id: "a", buyer: 1, when: at(1), item: 1 })}` }), /ainda não tem vendas/);
  const repo = memoryRepo();
  repo.upsertSales(parseSalesPage({ data: [rawSale(1)] }, "111").sales);
  assert.throws(() => importSalesCsv(repo, { groupId: "111", text: `${HEADER}\n${csvLine({ id: "a", buyer: 1, when: at(1), item: 1 })}` }), /ainda está importando/);
  repo.updateSyncState("111", { backfill_done: 1 });
  assert.throws(() => importSalesCsv(repo, { groupId: "111", text: "a,b\n1,2" }), /Não parece o relatório/);
});
