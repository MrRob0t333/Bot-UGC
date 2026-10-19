"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyncService } = require("../src/sync/syncService");
const { RobloxAuthError, RobloxPermissionError } = require("../src/roblox/errors");
const { memoryRepo, rawSale, fakeRoblox, testConfig, fakeAlerts } = require("./helpers");

const NOW = new Date("2026-10-18T15:00:00Z");
const minutesAgo = m => new Date(NOW.getTime() - m * 60000).toISOString();

/** Gera N vendas a partir de `startIndex`, mais novas primeiro, espaçadas por `stepMin` minutos. */
function sales(count, { startIndex = 0, stepMin = 60, offsetMin = 0, pending = () => false } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const n = startIndex + i;
    return rawSale(n, { created: minutesAgo(offsetMin + i * stepMin), isPending: pending(n) });
  });
}

function paginate(list, size = 100) {
  const pages = [];
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size));
  return pages.length ? pages : [[]];
}

function service(repo, roblox, extra = {}) {
  const config = testConfig({ groups: [{ id: "111", name: "Grupo A", split: {} }], ...extra.config });
  return createSyncService({ repo, roblox, config, alerts: extra.alerts || fakeAlerts(), clock: () => extra.now || NOW, sleep: async () => {}, ...extra.deps });
}

test("backfill: importa todo o histórico sem gerar avisos", async () => {
  const repo = memoryRepo();
  const all = sales(250, { stepMin: 30 });
  const roblox = fakeRoblox(paginate(all));
  const alerts = fakeAlerts();
  const sync = service(repo, roblox, { alerts });
  const result = await sync.syncGroup({ id: "111", name: "Grupo A" });
  assert.equal(result.ok, true);
  assert.equal(result.backfill.done, true);
  assert.equal(repo.countSales({ groupId: "111" }), 250);
  assert.equal(repo.countUnnotified(), 0, "backfill não deve gerar avisos");
  assert.equal(repo.getSyncState("111").backfill_done, 1);
  assert.ok(alerts.sent.some(alert => /Histórico importado/.test(alert.title)));
});

test("backfill: é retomável pelo cursor salvo", async () => {
  const repo = memoryRepo();
  const all = sales(300, { stepMin: 10 });
  const roblox = fakeRoblox(paginate(all));
  const sync = service(repo, roblox, { deps: { backfillPagesPerCycle: 1 } });
  const first = await sync.runBackfillChunk({ id: "111", name: "Grupo A" });
  assert.equal(first.done, false);
  assert.equal(repo.getSyncState("111").backfill_cursor, "c1");
  assert.equal(repo.countSales(), 100);

  // "Reinício": novo serviço, mesmo banco → continua do cursor c1.
  const sync2 = service(repo, roblox, { deps: { backfillPagesPerCycle: 10 } });
  const second = await sync2.runBackfillChunk({ id: "111", name: "Grupo A" });
  assert.equal(second.done, true);
  assert.deepEqual(roblox.calls.pages, [null, "c1", "c2"]);
  assert.equal(repo.countSales(), 300);
});

test("idempotência: rodar o coletor 2x não duplica nada", async () => {
  const repo = memoryRepo();
  const roblox = fakeRoblox(paginate(sales(150)));
  const sync = service(repo, roblox);
  await sync.runCycle();
  const afterFirst = repo.countSales();
  await sync.runCycle({ force: true });
  await sync.runCycle({ force: true });
  assert.equal(afterFirst, 150);
  assert.equal(repo.countSales(), 150);
  const raw = repo.db.prepare("SELECT COUNT(*) AS c FROM sales").get().c;
  assert.equal(Number(raw), 150);
});

test("upsert direto: mesma venda 2x = 1 linha, e reporta o status correto", () => {
  const repo = memoryRepo();
  const { parseSalesPage } = require("../src/roblox/parser");
  const page = parseSalesPage({ data: [rawSale(1, { isPending: true }), rawSale(2)] }, "111").sales;
  const first = repo.upsertSales(page);
  assert.equal(first.inserted.length, 2);
  const second = repo.upsertSales(page);
  assert.equal(second.inserted.length, 0);
  assert.equal(second.unchanged, 2);
  assert.equal(repo.countSales(), 2);
});

test("incremental: vendas novas ficam pendentes de aviso; regra de parada evita ler páginas antigas", async () => {
  const repo = memoryRepo();
  let pages = paginate(sales(500, { offsetMin: 60 * 24 * 20, stepMin: 60 })); // tudo com > 20 dias, todas liberadas
  const roblox = fakeRoblox(() => pages);
  const sync = service(repo, roblox);
  await sync.runCycle(); // backfill + incremental
  assert.equal(repo.countUnnotified(), 0);

  // Chegam 3 vendas novas no topo.
  const fresh = sales(3, { startIndex: 10000, stepMin: 1, offsetMin: 1 });
  pages = paginate([...fresh, ...pages.flat()]);
  roblox.calls.pages.length = 0;
  const cycle = await sync.runCycle();
  assert.equal(cycle.groups[0].newSales, 3);
  assert.equal(repo.countUnnotified(), 3);
  // Página 0 tem as 3 novas (não é "toda conhecida") → lê a página 1, que é toda conhecida e antiga → para.
  assert.deepEqual(roblox.calls.pages, [null, "c1"]);
});

test("incremental: sem novidades e sem pendentes para na primeira página", async () => {
  const repo = memoryRepo();
  const roblox = fakeRoblox(paginate(sales(400, { stepMin: 5 })));
  const sync = service(repo, roblox);
  await sync.runCycle();
  roblox.calls.pages.length = 0;
  await sync.runCycle();
  assert.deepEqual(roblox.calls.pages, [null]);
});

test("incremental: re-lê páginas até a venda pendente mais antiga e atualiza pendente → liberado", async () => {
  const repo = memoryRepo();
  // 400 vendas, 1 por hora; a de índice 150 (~6,25 dias atrás) está pendente.
  const isPending = new Set([150]);
  let current = sales(400, { stepMin: 60, pending: n => isPending.has(n) });
  const roblox = fakeRoblox(() => paginate(current));
  const options = {};
  const sync = service(repo, roblox, options);
  await sync.runCycle();
  const pendingId = "111:hash-150";
  assert.equal(repo.listSales({ pending: true }).length, 1);

  // Roblox libera a venda 150.
  isPending.clear();
  current = sales(400, { stepMin: 60, pending: () => false });
  options.now = new Date(NOW.getTime() + 3 * 60000);
  roblox.calls.pages.length = 0;
  const cycle = await sync.runCycle();
  assert.equal(cycle.groups[0].released, 1);
  assert.equal(repo.listSales({ pending: true }).length, 0);
  // Precisou ler até a página que contém o índice 150 (página 1) e a próxima toda antiga (página 2).
  assert.deepEqual(roblox.calls.pages, [null, "c1", "c2"]);
  const sale = repo.listSales({}, { limit: 1000 }).find(item => item.id === pendingId);
  assert.equal(sale.isPending, false);
  assert.notEqual(sale.updatedAt, sale.firstSeenAt);

  // Sem pendentes agora: próximo ciclo para na 1ª página.
  roblox.calls.pages.length = 0;
  await sync.runCycle();
  assert.deepEqual(roblox.calls.pages, [null]);
});

test("incremental: pendente além de PENDING_RECHECK_DAYS não força varrer o histórico", async () => {
  const repo = memoryRepo();
  // 1 venda a cada 6h; a de índice 120 (30 dias atrás) está pendente "para sempre".
  const roblox = fakeRoblox(paginate(sales(400, { stepMin: 360, pending: n => n === 120 }), 20));
  const sync = service(repo, roblox);
  await sync.runCycle();
  roblox.calls.pages.length = 0;
  await sync.runCycle();
  // Corte = 10 dias = 40 vendas = 2 páginas de 20; lê 0,1 (recentes) e 2 (toda antiga e conhecida) → para.
  assert.deepEqual(roblox.calls.pages, [null, "c1", "c2"]);
});

test("cookie inválido: alerta uma vez, espaça tentativas e avisa a recuperação", async () => {
  const repo = memoryRepo();
  const alerts = fakeAlerts();
  let now = NOW;
  const failing = fakeRoblox([[]], { failWith: new RobloxAuthError("401", { status: 401 }) });
  const config = testConfig({ groups: [{ id: "111", name: "A", split: {} }, { id: "222", name: "B", split: {} }] });
  const sync = createSyncService({ repo, roblox: failing, config, alerts, clock: () => now, sleep: async () => {} });

  const first = await sync.runCycle();
  assert.equal(first.groups.length, 1, "não insiste nos outros grupos com cookie inválido");
  assert.equal(sync.cookieState().status, "invalid");
  await sync.runCycle({ force: true });
  assert.equal(alerts.sent.filter(alert => alert.key === "cookie_invalid").length, 1, "avisa só uma vez");

  now = new Date(NOW.getTime() + 60000);
  const skipped = await sync.runCycle();
  assert.equal(skipped.skipped, "cookie_invalid");

  // Depois de 15 min tenta de novo; agora funciona.
  now = new Date(NOW.getTime() + 16 * 60000);
  const working = fakeRoblox([[]]);
  const sync2 = createSyncService({ repo, roblox: working, config, alerts, clock: () => now, sleep: async () => {} });
  const ok = await sync2.runCycle();
  assert.ok(ok.groups.every(group => group.ok));
  assert.equal(sync2.cookieState().status, "ok");
  assert.ok(alerts.sent.some(alert => alert.key === "cookie_invalid" && alert.resolved));
});

test("sem permissão (403): alerta por grupo e não derruba os outros", async () => {
  const repo = memoryRepo();
  const alerts = fakeAlerts();
  const config = testConfig({ groups: [{ id: "111", name: "A", split: {} }, { id: "222", name: "B", split: {} }] });
  const ok = fakeRoblox([[rawSale(1)]]);
  const roblox = {
    ...ok,
    async getSalesPage(groupId, cursor) {
      if (groupId === "111") throw new RobloxPermissionError("403", { status: 403 });
      return ok.getSalesPage(groupId, cursor);
    },
  };
  const sync = createSyncService({ repo, roblox, config, alerts, clock: () => NOW, sleep: async () => {} });
  const result = await sync.runCycle();
  assert.equal(result.groups[0].ok, false);
  assert.equal(result.groups[1].ok, true);
  assert.ok(alerts.sent.some(alert => alert.key === "forbidden:111"));
  assert.equal(repo.getSyncState("111").consecutive_failures, 1);
});

test("falhas seguidas: alerta após 5 falhas transitórias", async () => {
  const repo = memoryRepo();
  const alerts = fakeAlerts();
  const { RobloxError } = require("../src/roblox/errors");
  const roblox = fakeRoblox([[]], { failWith: new RobloxError("503", { status: 503 }) });
  const sync = service(repo, roblox, { alerts });
  for (let i = 0; i < 5; i += 1) await sync.runCycle();
  assert.equal(alerts.sent.filter(alert => alert.key === "failures:111").length, 1);
  assert.equal(repo.recentErrors(10).length, 5);
});

test("saldo: snapshot é salvo com pendentes", async () => {
  const repo = memoryRepo();
  const sync = service(repo, fakeRoblox([[]]));
  const results = await sync.snapshotFunds();
  assert.equal(results[0].robux, 12480);
  const last = repo.latestFunds("111");
  assert.equal(last.robux, 12480);
  assert.equal(last.pendingRobux, 3200);
});

test("runCycle é single-flight", async () => {
  const repo = memoryRepo();
  const sync = service(repo, fakeRoblox([[rawSale(1)]]));
  const [a, b] = await Promise.all([sync.runCycle(), sync.runCycle()]);
  assert.equal(a, b);
});

test("vendas com mais de 10 dias inseridas pelo incremental (bot parado) também são avisadas", async () => {
  const repo = memoryRepo();
  let pages = paginate(sales(50, { offsetMin: 60 * 24 * 30 }));
  const roblox = fakeRoblox(() => pages);
  const sync = service(repo, roblox);
  await sync.runCycle();
  const missed = sales(15, { startIndex: 5000, offsetMin: 60 * 24 * 12, stepMin: 10 });
  pages = paginate([...missed, ...pages.flat()]);
  await sync.runCycle();
  assert.equal(repo.countUnnotified(), 15);
});
