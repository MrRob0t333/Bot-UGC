"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSummary, splitAmount, partnerShares } = require("../src/reports/summary");
const { resolvePeriod } = require("../src/reports/periods");
const { percentChange, formatNumber } = require("../src/format");
const { salesToCsv, BOM } = require("../src/reports/csv");
const { parseSalesPage } = require("../src/roblox/parser");
const { summaryEmbed, groupedSalesEmbed, saleEmbed } = require("../src/discord/embeds");
const { buildBarChartSvg } = require("../src/charts/barChart");
const { memoryRepo, rawSale, testConfig, OWNER_A, OWNER_B } = require("./helpers");

const TZ = "America/Sao_Paulo";

function insert(repo, groupId, items) {
  const raws = items.map((item, i) => rawSale(item.n ?? i, { created: item.created, amount: item.amount, isPending: item.pending, extra: item.extra }));
  repo.upsertSales(parseSalesPage({ data: raws }, groupId).sales, { markNotified: true });
}

test("divisão: 50/50 com valor ímpar soma exatamente o total", () => {
  assert.deepEqual(splitAmount(7, { a: 50, b: 50 }), { a: 4, b: 3 });
  assert.deepEqual(splitAmount(100, { a: 100, b: 0 }), { a: 100, b: 0 });
  const thirds = splitAmount(100, { a: 33.3333333333, b: 33.3333333333, c: 33.3333333334 });
  assert.equal(thirds.a + thirds.b + thirds.c, 100);
  assert.deepEqual(splitAmount(0, { a: 50, b: 50 }), { a: 0, b: 0 });
});

test("divisão: soma as partes de vários grupos com divisões diferentes", () => {
  const config = testConfig();
  const shares = partnerShares(
    [{ groupId: "111", net: 1000 }, { groupId: "222", net: 300 }, { groupId: "999", net: 10 }],
    config.groups,
    config.ownerIds,
  );
  const byUser = Object.fromEntries(shares.map(row => [row.userId, row.net]));
  // 111: 500/500; 222: 300/0; 999 (não configurado): 50/50 → 5/5
  assert.equal(byUser[OWNER_A], 805);
  assert.equal(byUser[OWNER_B], 505);
});

test("variação percentual", () => {
  assert.equal(percentChange(110, 100).text, "▲ 10,0%");
  assert.equal(percentChange(90, 100).text, "▼ 10,0%");
  assert.equal(percentChange(5, 0).direction, "new");
  assert.equal(percentChange(0, 0).direction, "none");
  assert.equal(formatNumber(12480), "12.480");
});

test("resumo: totais, comparação, tops, por grupo, sócios e bruto estimado", () => {
  const repo = memoryRepo();
  const config = testConfig();
  const now = new Date("2026-10-18T17:40:00Z"); // 14:40 SP
  // hoje (18/10 SP)
  insert(repo, "111", [
    { n: 1, created: "2026-10-18T12:00:00Z", amount: 70 },
    { n: 2, created: "2026-10-18T13:00:00Z", amount: 30, pending: true },
  ]);
  insert(repo, "222", [{ n: 3, created: "2026-10-18T14:00:00Z", amount: 100 }]);
  // ontem até 14:40 (período anterior): 100
  insert(repo, "111", [{ n: 4, created: "2026-10-17T15:00:00Z", amount: 100 }]);
  // ontem depois das 14:40 (fora do anterior equivalente)
  insert(repo, "111", [{ n: 5, created: "2026-10-17T22:00:00Z", amount: 999 }]);
  repo.replaceItemPrices([{ itemId: "501", price: 100 }]);

  const period = resolvePeriod("hoje", { now, timeZone: TZ });
  const summary = buildSummary(repo, { period, groups: config.groups, ownerIds: config.ownerIds });
  assert.equal(summary.totals.net, 200);
  assert.equal(summary.totals.count, 3);
  assert.equal(summary.totals.pendingNet, 30);
  assert.equal(summary.totals.releasedNet, 170);
  assert.equal(Math.round(summary.avgTicket), 67);
  assert.equal(summary.previous.net, 100);
  assert.equal(summary.previous.change.net.text, "▲ 100,0%");
  assert.equal(summary.topItems[0].net, 100);
  assert.equal(summary.byGroup.length, 2);
  const shares = Object.fromEntries(summary.partners.map(row => [row.userId, row.net]));
  assert.equal(shares[OWNER_A], 150); // 50 do grupo A + 100 do grupo B
  assert.equal(shares[OWNER_B], 50);
  // item 501 = venda n=1 (n%3=1) → bruto 100
  assert.equal(summary.gross.coveredCount, 1);
  assert.equal(summary.gross.gross, 100);

  const embed = summaryEmbed(summary, { timeZone: TZ, groupName: id => id });
  assert.match(embed.description, /^## 200 Robux/);
  assert.match(embed.description, /▲ 100,0% vs período anterior/);
  assert.ok(embed.fields.some(field => field.name === "Parte de cada sócio" && field.value.includes(`<@${OWNER_A}>: **150**`)));
  assert.ok(embed.fields.some(field => field.name.startsWith("Bruto estimado")));
  assert.match(embed.footer.text, /líquidos/);
});

test("resumo: filtro por grupo e período vazio", () => {
  const repo = memoryRepo();
  const config = testConfig();
  insert(repo, "111", [{ n: 1, created: "2026-10-18T12:00:00Z", amount: 70 }]);
  const period = resolvePeriod("mes_passado", { now: new Date("2026-10-18T12:00:00Z"), timeZone: TZ });
  const summary = buildSummary(repo, { period, groupId: "111", groups: config.groups, ownerIds: config.ownerIds });
  assert.equal(summary.totals.count, 0);
  assert.equal(summary.groupName, "Grupo A");
  const embed = summaryEmbed(summary, { timeZone: TZ, groupName: id => id });
  assert.match(embed.description, /Nenhuma venda/);
});

test("CSV: BOM, separador ;, CRLF, aspas e proteção contra fórmula", () => {
  const sales = [{
    id: "111:abc",
    groupId: "111",
    createdAt: "2026-10-18T01:30:05Z",
    amount: 70,
    isPending: true,
    itemId: "501",
    itemName: 'Camisa "Top"; edição',
    itemType: "Asset",
    placeName: null,
    buyerName: "=HYPERLINK(\"x\")",
    buyerId: "9",
  }];
  const csv = salesToCsv(sales, { timeZone: TZ, groupName: () => "Grupo A", grossPrice: () => 100 });
  assert.ok(csv.startsWith(BOM));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 3); // cabeçalho + 1 linha + vazio final
  assert.equal(lines[0].split(";")[0], "Data (local)");
  assert.ok(lines[1].startsWith("17/10/2026 22:30:05;2026-10-18T01:30:05Z;Grupo A;111;"));
  assert.ok(lines[1].includes('"Camisa ""Top""; edição"'));
  assert.ok(lines[1].includes(";70;100;Pendente;"));
  assert.ok(lines[1].includes(`;"'=HYPERLINK(""x"")";`));
});

test("embeds de venda: individual e agrupado", () => {
  const ctx = { timeZone: TZ, groupName: () => "Grupo A" };
  const sale = parseSalesPage({ data: [rawSale(1, { amount: 1234, isPending: true })] }, "111").sales[0];
  const single = saleEmbed({ ...sale, createdAt: sale.createdAt }, ctx);
  assert.equal(single.title, "Nova venda · 1.234 Robux");
  assert.ok(single.fields.some(field => field.value.includes("https://www.roblox.com/users/1001/profile")));
  assert.ok(single.fields.some(field => field.value === "⏳ Pendente"));

  const many = parseSalesPage({ data: Array.from({ length: 30 }, (_, i) => rawSale(i)) }, "111").sales;
  const grouped = groupedSalesEmbed(many, ctx);
  assert.equal(grouped.title, "30 novas vendas · 210 Robux");
  assert.match(grouped.description, /e mais 10 venda/);
  assert.ok(grouped.description.length <= 4096);
});

test("gráfico: SVG válido com barras, média e rótulos pt-BR", () => {
  const svg = buildBarChartSvg(
    [{ label: "01/10", net: 1200, count: 10 }, { label: "02/10", net: 0, count: 0 }, { label: "03/10", net: 12480, count: 50 }],
    { title: "Vendas <teste>", subtitle: "sub" },
  );
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("12.480"));
  assert.ok(svg.includes("média"));
  assert.ok(svg.includes("Vendas &lt;teste&gt;"));
  assert.equal((svg.match(/<rect /g) || []).length, 1 + 2); // fundo + 2 barras com valor > 0
});
