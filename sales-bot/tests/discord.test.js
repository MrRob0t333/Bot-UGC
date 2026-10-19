"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandlers, EPHEMERAL } = require("../src/discord/handlers");
const { createPaginationStore, nextPage, parseCustomId, buttonsRow } = require("../src/discord/pagination");
const { createNotifier } = require("../src/discord/notifier");
const { createScheduler, lastOccurrence } = require("../src/discord/scheduler");
const { COMMANDS } = require("../src/discord/commands");
const { createSyncService } = require("../src/sync/syncService");
const { parseSalesPage } = require("../src/roblox/parser");
const { memoryRepo, rawSale, fakeRoblox, testConfig, fakeAlerts, OWNER_A, OWNER_B } = require("./helpers");

const NOW = new Date("2026-10-18T17:40:00Z");
const STRANGER = "123456789012345678";

function seed(repo, count, groupId = "111") {
  const raws = Array.from({ length: count }, (_, i) => rawSale(i, { created: new Date(NOW.getTime() - (i + 1) * 3600000).toISOString(), amount: 10 + i }));
  repo.upsertSales(parseSalesPage({ data: raws }, groupId).sales, { markNotified: true });
}

function makeApp({ repo = memoryRepo(), pagination = createPaginationStore() } = {}) {
  const config = testConfig();
  const roblox = fakeRoblox([[]]);
  const sync = createSyncService({ repo, roblox, config, alerts: fakeAlerts(), clock: () => NOW, sleep: async () => {} });
  const app = { config, repo, sync, roblox, pagination, clock: () => NOW, startedAt: Date.now() - 3723000, dbDriver: repo.db.driverName, notifier: null };
  return { app, handlers: createHandlers(app) };
}

/** Interação falsa que registra as chamadas. */
function fakeInteraction({ type = "command", commandName, options = {}, userId = OWNER_A, customId, focused } = {}) {
  const calls = [];
  const interaction = {
    calls,
    commandName,
    customId,
    user: { id: userId },
    deferred: false,
    replied: false,
    isAutocomplete: () => type === "autocomplete",
    isButton: () => type === "button",
    isChatInputCommand: () => type === "command",
    options: {
      getString: name => (options[name] === undefined ? null : options[name]),
      getBoolean: name => (options[name] === undefined ? null : options[name]),
      getFocused: () => focused,
    },
    async reply(payload) { interaction.replied = true; calls.push(["reply", payload]); },
    async deferReply(payload) { interaction.deferred = true; calls.push(["deferReply", payload]); },
    async editReply(payload) { calls.push(["editReply", payload]); },
    async update(payload) { calls.push(["update", payload]); },
    async deferUpdate() { calls.push(["deferUpdate"]); },
    async respond(choices) { calls.push(["respond", choices]); },
  };
  return interaction;
}

const lastPayload = (interaction, kind) => [...interaction.calls].reverse().find(([name]) => name === kind)?.[1];

test("comandos: todos definidos com nomes válidos e opção de período", () => {
  const names = COMMANDS.map(command => command.name);
  assert.deepEqual(names, ["resumo", "vendas", "exportar", "grafico", "saldo", "item", "status", "sincronizar"]);
  for (const command of COMMANDS) {
    assert.match(command.name, /^[a-z_]{1,32}$/);
    assert.ok(command.description.length <= 100, command.name);
    for (const option of command.options) assert.ok(option.description.length <= 100, `${command.name}.${option.name}`);
  }
  const resumo = COMMANDS.find(command => command.name === "resumo");
  assert.deepEqual(resumo.options[0].choices.map(choice => choice.value), ["hoje", "24h", "7d", "30d", "mes_atual", "mes_passado", "ano", "tudo", "personalizado"]);
});

test("permissão: quem não é dono recebe 'Sem permissão' efêmero", async () => {
  const { handlers } = makeApp();
  const interaction = fakeInteraction({ commandName: "resumo", options: { periodo: "hoje" }, userId: STRANGER });
  await handlers.handle(interaction);
  assert.deepEqual(interaction.calls, [["reply", { content: "Sem permissão.", flags: EPHEMERAL }]]);
});

test("permissão: autocomplete para estranhos devolve lista vazia", async () => {
  const { handlers } = makeApp();
  const interaction = fakeInteraction({ type: "autocomplete", commandName: "vendas", userId: STRANGER, focused: { name: "grupo", value: "" } });
  await handlers.handle(interaction);
  assert.deepEqual(interaction.calls, [["respond", []]]);
});

test("/resumo: efêmero por padrão e público com publico:true", async () => {
  const repo = memoryRepo();
  seed(repo, 5);
  const { handlers } = makeApp({ repo });
  const privateCall = fakeInteraction({ commandName: "resumo", options: { periodo: "hoje" } });
  await handlers.handle(privateCall);
  assert.deepEqual(privateCall.calls[0], ["deferReply", { flags: EPHEMERAL }]);
  const embed = lastPayload(privateCall, "editReply").embeds[0];
  assert.match(embed.title, /^Resumo · Hoje/);
  const publicCall = fakeInteraction({ commandName: "resumo", options: { periodo: "7d", publico: true } });
  await handlers.handle(publicCall);
  assert.deepEqual(publicCall.calls[0], ["deferReply", {}]);
});

test("/resumo personalizado com data inválida mostra erro amigável", async () => {
  const { handlers } = makeApp();
  const interaction = fakeInteraction({ commandName: "resumo", options: { periodo: "personalizado", inicio: "32/01/2026", fim: "01/02/2026" } });
  await handlers.handle(interaction);
  assert.match(lastPayload(interaction, "editReply").content, /^⚠️ Data de início inválida/);
});

test("/vendas: paginação 10 por página, só o dono navega, expira", async () => {
  const repo = memoryRepo();
  seed(repo, 25);
  let now = 0;
  const pagination = createPaginationStore({ now: () => now });
  const { handlers } = makeApp({ repo, pagination });
  const open = fakeInteraction({ commandName: "vendas", options: { periodo: "30d" } });
  await handlers.handle(open);
  const first = lastPayload(open, "editReply");
  assert.match(first.embeds[0].footer.text, /^Página 1 de 3/);
  assert.equal(first.embeds[0].description.split("\n").filter(line => line.startsWith("`")).length, 10);
  const row = first.components[0];
  const nextId = row.components.find(button => button.label === "▶").custom_id;
  const lastId = row.components.find(button => button.label === "⏭").custom_id;
  assert.equal(row.components.find(button => button.label === "⏮").disabled, true);

  // Outro dono (sócio) não pode mexer na lista de quem abriu.
  const partner = fakeInteraction({ type: "button", customId: nextId, userId: OWNER_B });
  await handlers.handle(partner);
  assert.match(lastPayload(partner, "reply").content, /Só quem abriu/);

  // Estranho: sem permissão.
  const stranger = fakeInteraction({ type: "button", customId: nextId, userId: STRANGER });
  await handlers.handle(stranger);
  assert.equal(lastPayload(stranger, "reply").content, "Sem permissão.");

  const next = fakeInteraction({ type: "button", customId: nextId });
  await handlers.handle(next);
  assert.match(lastPayload(next, "update").embeds[0].footer.text, /^Página 2 de 3/);
  const last = fakeInteraction({ type: "button", customId: lastId });
  await handlers.handle(last);
  const lastPage = lastPayload(last, "update");
  assert.match(lastPage.embeds[0].footer.text, /^Página 3 de 3/);
  assert.equal(lastPage.embeds[0].description.split("\n").filter(line => line.startsWith("`")).length, 5);

  now += 11 * 60 * 1000;
  const expired = fakeInteraction({ type: "button", customId: nextId });
  await handlers.handle(expired);
  assert.match(lastPayload(expired, "reply").content, /expirou/);
});

test("/vendas: filtros de item (autocomplete) e comprador", async () => {
  const repo = memoryRepo();
  seed(repo, 9);
  const { handlers } = makeApp({ repo });
  const auto = fakeInteraction({ type: "autocomplete", commandName: "vendas", focused: { name: "item", value: "Item" } });
  await handlers.handle(auto);
  const choices = lastPayload(auto, "respond");
  assert.equal(choices.length, 3);
  assert.match(choices[0].value, /^id:50\d$/);
  const filtered = fakeInteraction({ commandName: "vendas", options: { periodo: "30d", item: choices[0].value, comprador: "comprador3" } });
  await handlers.handle(filtered);
  const embed = lastPayload(filtered, "editReply").embeds[0];
  assert.match(embed.description, /em \*\*1\*\* vendas/);
});

test("/exportar: anexa CSV com BOM", async () => {
  const repo = memoryRepo();
  seed(repo, 3);
  const { handlers } = makeApp({ repo });
  const interaction = fakeInteraction({ commandName: "exportar", options: { periodo: "30d" } });
  await handlers.handle(interaction);
  const payload = lastPayload(interaction, "editReply");
  assert.equal(payload.files.length, 1);
  assert.match(payload.files[0].name, /^vendas_30d_.*\.csv$/);
  const text = payload.files[0].attachment.toString("utf8");
  assert.ok(text.startsWith("﻿Data (local);"));
  assert.equal(text.trim().split("\r\n").length, 4);
});

test("/grafico: gera imagem (PNG se resvg instalado, senão SVG)", async () => {
  const repo = memoryRepo();
  seed(repo, 20);
  const { handlers } = makeApp({ repo });
  const interaction = fakeInteraction({ commandName: "grafico", options: { periodo: "7d" } });
  await handlers.handle(interaction);
  const payload = lastPayload(interaction, "editReply");
  assert.equal(payload.files.length, 1);
  assert.match(payload.files[0].name, /\.(png|svg)$/);
  assert.match(payload.embeds[0].title, /^Vendas por dia/);
});

test("/saldo, /item, /status e /sincronizar respondem", async () => {
  const repo = memoryRepo();
  seed(repo, 12);
  const { handlers } = makeApp({ repo });
  const saldo = fakeInteraction({ commandName: "saldo" });
  await handlers.handle(saldo);
  assert.match(lastPayload(saldo, "editReply").embeds[0].description, /^## 24.960 Robux/);

  const item = fakeInteraction({ commandName: "item", options: { nome: "id:501" } });
  await handlers.handle(item);
  const itemEmbed = lastPayload(item, "editReply").embeds[0];
  assert.equal(itemEmbed.title, "Item 1");

  const status = fakeInteraction({ commandName: "status" });
  await handlers.handle(status);
  const statusEmbed = lastPayload(status, "editReply").embeds[0];
  assert.equal(statusEmbed.title, "Status do sales-bot");
  assert.ok(statusEmbed.fields.some(field => field.value.includes("Uptime: 1h 2min")));

  const syncNow = fakeInteraction({ commandName: "sincronizar" });
  await handlers.handle(syncNow);
  assert.match(lastPayload(syncNow, "editReply").content, /^Sincronização concluída/);
});

test("erro inesperado vira mensagem sem vazar segredos", async () => {
  const { handlers, app } = makeApp();
  require("../src/logger").registerSecret("SEGREDO-DO-COOKIE-123");
  app.repo.totals = () => { throw new Error("falhou SEGREDO-DO-COOKIE-123"); };
  app.logger = null;
  const interaction = fakeInteraction({ commandName: "resumo", options: { periodo: "hoje" } });
  await handlers.handle(interaction);
  const content = lastPayload(interaction, "editReply").content;
  assert.match(content, /^❌ Erro inesperado/);
  assert.ok(!content.includes("SEGREDO-DO-COOKIE-123"));
});

test("paginação: utilitários", () => {
  assert.equal(nextPage("next", 3, 3), 3);
  assert.equal(nextPage("prev", 1, 3), 1);
  assert.equal(nextPage("first", 2, 3), 1);
  assert.equal(nextPage("last", 1, 7), 7);
  assert.deepEqual(parseCustomId("vendas:abc:next"), { sessionId: "abc", action: "next" });
  assert.equal(parseCustomId("outro:abc:next"), null);
  const row = buttonsRow("abc", 1, 1, { disabled: true });
  assert.ok(row.components.every(button => button.disabled));
});

test("notificador: até 10 vendas → um embed por venda; mais de 10 → agrupado; falha não marca", async () => {
  const repo = memoryRepo();
  const sent = [];
  let fail = false;
  const send = async (channelId, payload) => {
    if (fail) throw new Error("Missing Access");
    sent.push({ channelId, payload });
  };
  const ctx = { timeZone: "America/Sao_Paulo", groupName: () => "Grupo A" };
  const alerts = fakeAlerts();
  const notifier = createNotifier({ repo, send, ctx, alerts, channelId: "998" });

  repo.upsertSales(parseSalesPage({ data: Array.from({ length: 3 }, (_, i) => rawSale(i)) }, "111").sales);
  assert.equal((await notifier.flush()).mode, "single");
  assert.equal(sent[0].payload.embeds.length, 3);
  assert.equal(repo.countUnnotified(), 0);

  repo.upsertSales(parseSalesPage({ data: Array.from({ length: 12 }, (_, i) => rawSale(100 + i)) }, "111").sales);
  fail = true;
  assert.equal((await notifier.flush()).mode, "error");
  assert.equal(repo.countUnnotified(), 12, "continua na fila");
  assert.ok(alerts.sent.some(alert => alert.key === "discord_send"));
  fail = false;
  assert.equal((await notifier.flush()).mode, "grouped");
  assert.equal(sent[1].payload.embeds.length, 1);
  assert.match(sent[1].payload.embeds[0].title, /^12 novas vendas/);
  assert.equal(repo.countUnnotified(), 0);
  assert.equal((await notifier.flush()).mode, "none");
});

test("agenda: ocorrências diária 23:00, semanal domingo 23:05 e mensal dia 1 09:00 (SP)", () => {
  const schedules = testConfig().schedules;
  const tz = "America/Sao_Paulo";
  // domingo 18/10/2026 14:40 SP
  const now = new Date("2026-10-18T17:40:00Z");
  assert.equal(lastOccurrence("daily", schedules, now, tz).toISOString(), "2026-10-18T02:00:00.000Z"); // 17/10 23:00 SP
  assert.equal(lastOccurrence("weekly", schedules, now, tz).toISOString(), "2026-10-12T02:05:00.000Z"); // dom 11/10 23:05 SP
  assert.equal(lastOccurrence("monthly", schedules, now, tz).toISOString(), "2026-10-01T12:00:00.000Z");
  const after = new Date("2026-10-19T02:06:00Z"); // dom 18/10 23:06 SP
  assert.equal(lastOccurrence("daily", schedules, after, tz).toISOString(), "2026-10-19T02:00:00.000Z");
  assert.equal(lastOccurrence("weekly", schedules, after, tz).toISOString(), "2026-10-19T02:05:00.000Z");
  const beforeMonthly = new Date("2026-11-01T11:00:00Z"); // 01/11 08:00 SP
  assert.equal(lastOccurrence("monthly", schedules, beforeMonthly, tz).toISOString(), "2026-10-01T12:00:00.000Z");
});

test("agenda: dispara uma vez por ocorrência e não repete após reinício", async () => {
  const repo = memoryRepo();
  seed(repo, 5);
  const config = testConfig();
  const sent = [];
  let now = new Date("2026-10-19T02:06:00Z"); // dom 23:06 SP: diário e semanal devidos
  const scheduler = createScheduler({ repo, config, send: async (channel, payload) => sent.push(payload), ctx: { timeZone: config.timezone, groupName: id => id }, clock: () => now });
  const fired = await scheduler.tick();
  assert.deepEqual(fired.sort(), ["daily", "weekly"]);
  assert.match(sent.find(payload => /diário/.test(payload.embeds[0].title)).embeds[0].title, /Resumo diário · 18\/10\/2026/);
  assert.match(sent.find(payload => /semanal/.test(payload.embeds[0].title)).embeds[0].title, /12\/10\/2026 → 18\/10\/2026/);
  assert.deepEqual(await scheduler.tick(), []);
  const restarted = createScheduler({ repo, config, send: async () => assert.fail("não deveria reenviar"), ctx: { timeZone: config.timezone, groupName: id => id }, clock: () => now });
  assert.deepEqual(await restarted.tick(), []);
  // Mensal: 01/11 09:00 SP
  now = new Date("2026-11-01T12:01:00Z");
  const monthly = await scheduler.tick();
  assert.ok(monthly.includes("monthly"));
  assert.match(sent[sent.length - 1].embeds[0].title, /Resumo mensal · outubro\/2026/);
});
