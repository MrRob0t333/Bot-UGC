"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createLogger, registerSecret, clearSecrets, redact } = require("../src/logger");
const { validateGroups, loadConfig } = require("../src/config");
const { openDatabase } = require("../src/db/driver");
const { migrate, MIGRATIONS } = require("../src/db/migrations");
const { createRepository } = require("../src/db/repository");
const { createBackupService, pruneBackups } = require("../src/sync/backup");
const { acquireLock } = require("../src/lock");
const { createAlerts } = require("../src/sync/alerts");
const { OWNER_A, OWNER_B, memoryRepo } = require("./helpers");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sales-bot-test-"));

test("logger: redige cookie, tokens e cabeçalhos em qualquer formato", () => {
  clearSecrets();
  const cookie = "_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you|_SEGREDO123456";
  // Token FALSO montado em partes, para não disparar scanners de segredo do GitHub.
  const discordToken = ["A".repeat(26), "Fake01", "x".repeat(38)].join(".");
  registerSecret("meu-segredo-registrado-123");
  const lines = [];
  const logger = createLogger({ sink: (level, line) => lines.push(line), level: "debug" });
  logger.info(`cookie=${cookie}`);
  logger.warn("header", { Cookie: `.ROBLOSECURITY=${cookie}`, other: 1 });
  logger.error(new Error(`falhou com token ${discordToken} e meu-segredo-registrado-123`));
  logger.debug("Authorization: Bot abc.def.ghi");
  const all = lines.join("\n");
  assert.ok(!all.includes("SEGREDO123456"), all);
  assert.ok(!all.includes(discordToken));
  assert.ok(!all.includes("meu-segredo-registrado-123"));
  assert.ok(!all.includes("abc.def.ghi"));
  assert.ok(all.includes("[REDIGIDO]"));
  assert.equal(redact("sem segredos aqui"), "sem segredos aqui");
  clearSecrets();
});

test("logger: respeita o nível mínimo", () => {
  const lines = [];
  const logger = createLogger({ sink: (level, line) => lines.push(line), level: "warn" });
  logger.info("não aparece");
  logger.warn("aparece");
  assert.equal(lines.length, 1);
});

test("config: divisão precisa somar 100 e IDs válidos", () => {
  const owners = [OWNER_A, OWNER_B];
  const ok = validateGroups([{ id: 1, name: "A", split: { [OWNER_A]: 100, [OWNER_B]: 0 } }, { id: "2", name: "B" }], owners);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.groups[1].split, { [OWNER_A]: 50, [OWNER_B]: 50 });
  const bad = validateGroups([{ id: 1, name: "A", split: { [OWNER_A]: 60, [OWNER_B]: 50 } }], owners);
  assert.match(bad.errors[0], /soma 110%/);
  assert.ok(validateGroups([{ id: "abc" }], owners).errors.length);
  assert.ok(validateGroups([{ id: 1 }, { id: 1 }], owners).errors.some(error => /duplicado/.test(error)));
  assert.ok(validateGroups({}, owners).errors.length);
});

test("config: valida .env com mensagens claras e usa donos padrão", () => {
  const { config, errors } = loadConfig({ env: {}, groups: [{ id: 1, name: "A" }], requireDiscord: true, requireRoblox: true });
  assert.deepEqual(config.ownerIds, [OWNER_A, OWNER_B]);
  assert.ok(errors.some(error => error.startsWith("DISCORD_TOKEN vazio")));
  assert.ok(errors.some(error => error.startsWith("ROBLOX_COOKIE vazio")));
  const env = { POLL_INTERVAL_MINUTES: "abc", TIMEZONE: "Marte/Base", DAILY_SUMMARY_TIME: "25:00", WEEKLY_SUMMARY_TIME: "" };
  const second = loadConfig({ env, groups: [{ id: 1 }], requireDiscord: false, requireRoblox: false });
  assert.ok(second.errors.some(error => error.startsWith("POLL_INTERVAL_MINUTES")));
  assert.ok(second.errors.some(error => error.startsWith("TIMEZONE")));
  assert.ok(second.errors.some(error => error.startsWith("DAILY_SUMMARY_TIME")));
  assert.equal(second.config.schedules.weekly, null, "vazio desliga o resumo");
  const cookie = loadConfig({ env: { ROBLOX_COOKIE: ".ROBLOSECURITY=_|WARNING:-DO-NOT-SHARE-THIS.x" }, groups: [{ id: 1 }], requireDiscord: false });
  assert.equal(cookie.config.roblox.cookie, "_|WARNING:-DO-NOT-SHARE-THIS.x");
});

test("banco: migrações são idempotentes e WAL fica ativo em arquivo", () => {
  const dir = tmp();
  const db = openDatabase(path.join(dir, "sales.db"));
  const first = migrate(db);
  const second = migrate(db);
  assert.equal(first.applied, MIGRATIONS.length);
  assert.equal(second.applied, 0);
  assert.equal(String(db.pragma("journal_mode")[0].journal_mode).toLowerCase(), "wal");
  db.close();
});

test("banco: transação faz rollback em erro", () => {
  const repo = memoryRepo();
  assert.throws(() => repo.db.transaction(() => {
    repo.setState("x", 1);
    throw new Error("boom");
  }));
  assert.equal(repo.getState("x"), null);
});

test("backup: cópia consistente e mantém só os últimos N", async () => {
  const dir = tmp();
  const db = openDatabase(path.join(dir, "sales.db"));
  migrate(db);
  const repo = createRepository(db);
  repo.setState("conteudo", "ok");
  let now = new Date("2026-10-18T12:00:00Z");
  const config = { backupDir: path.join(dir, "backups"), timezone: "America/Sao_Paulo", sync: { backupKeep: 2 } };
  const backup = createBackupService({ db, repo, config, clock: () => now });
  for (let i = 0; i < 3; i += 1) {
    await backup.runBackup();
    now = new Date(now.getTime() + 86400000);
  }
  const files = fs.readdirSync(config.backupDir).filter(name => name.endsWith(".db"));
  assert.equal(files.length, 2);
  const copy = openDatabase(path.join(config.backupDir, files[files.length - 1]));
  assert.equal(createRepository(copy).getState("conteudo"), "ok");
  copy.close();
  now = new Date(now.getTime() - 86400000 + 3600000); // 1h após o último backup
  assert.equal(await backup.maybeBackup(), null, "não repete antes de 24h");
  // arquivos alheios na pasta não são apagados
  fs.writeFileSync(path.join(config.backupDir, "meu-arquivo.db"), "x");
  pruneBackups(config.backupDir, 1);
  assert.ok(fs.existsSync(path.join(config.backupDir, "meu-arquivo.db")));
  db.close();
});

test("trava: impede segunda instância e recupera trava órfã", () => {
  const dir = tmp();
  const lockPath = path.join(dir, "bot.lock");
  const lock = acquireLock(lockPath);
  // Simula outra instância viva (PID do processo pai do teste).
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.ppid, label: "outro", startedAt: "x" }));
  assert.throws(() => acquireLock(lockPath), error => error.code === "ELOCKED");
  // Trava de processo morto é tomada.
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, label: "morto", startedAt: "x" }));
  const again = acquireLock(lockPath);
  again.release();
  assert.ok(!fs.existsSync(lockPath));
  lock.release();
});

test("alertas: avisa uma vez por problema e avisa a recuperação; enfileira até ter remetente", async () => {
  const repo = memoryRepo();
  const alerts = createAlerts({ repo });
  assert.equal(await alerts.raise("cookie_invalid", { title: "x", message: "y" }), true);
  assert.equal(await alerts.raise("cookie_invalid", { title: "x", message: "y" }), false);
  const sent = [];
  await alerts.setSender(async alert => sent.push(alert));
  assert.equal(sent.length, 1, "fila entregue ao conectar");
  assert.equal(await alerts.resolve("cookie_invalid", { title: "ok" }), true);
  assert.equal(sent[1].level, "ok");
  // estado persiste no banco
  await alerts.raise("forbidden:1", { title: "a", message: "b" });
  assert.deepEqual(createAlerts({ repo }).activeKeys(), ["forbidden:1"]);
});

test("alertas: se o envio falhar, o alerta volta a ser tentado depois", async () => {
  const repo = memoryRepo();
  const alerts = createAlerts({ repo });
  let fail = true;
  const sent = [];
  await alerts.setSender(async alert => {
    if (fail) throw new Error("Missing Access");
    sent.push(alert);
  });
  assert.equal(await alerts.raise("forbidden:1", { title: "a", message: "b" }), false);
  assert.equal(alerts.isActive("forbidden:1"), false);
  fail = false;
  assert.equal(await alerts.raise("forbidden:1", { title: "a", message: "b" }), true);
  assert.equal(sent.length, 1);
});
