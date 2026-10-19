"use strict";

/**
 * Processo principal do sales-bot (pm2: "sales-bot").
 * Boot → trava de instância única → banco → Discord → laços de coleta/saldo/backup/resumos.
 * Encerramento gracioso em SIGINT/SIGTERM (espera o ciclo em andamento terminar).
 */

const { loadConfig, loadDotenv } = require("./config");
const { createLogger } = require("./logger");
const { acquireLock } = require("./lock");
const { createCore } = require("./app");
const { createHandlers } = require("./discord/handlers");
const { createPaginationStore } = require("./discord/pagination");
const { createNotifier } = require("./discord/notifier");
const { createScheduler } = require("./discord/scheduler");
const { groupName } = require("./reports/summary");

loadDotenv();
const { config, errors, warnings } = loadConfig();
const logger = createLogger({ level: config.logLevel });

if (errors.length) {
  logger.error(`Configuração inválida:\n - ${errors.join("\n - ")}\nCorrija o .env / config/groups.json e rode "npm run check".`);
  process.exit(1);
}
for (const warning of warnings) logger.warn(warning);

/** Liberado pelo main() assim que trava e banco existem (usado se o boot falhar). */
let cleanupOnFailure = () => {};

/** Executa fn a cada `ms`, sempre depois que a execução anterior terminar. */
function every(name, ms, fn, { immediate = true } = {}) {
  let timer = null;
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      await fn();
    } catch (error) {
      logger.error(`Falha no laço "${name}":`, error);
    }
    if (!stopped) {
      timer = setTimeout(run, ms);
    }
  };
  timer = setTimeout(run, immediate ? 0 : ms);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

async function main() {
  const lock = acquireLock(config.lockPath, { label: "sales-bot" });
  const core = createCore(config, { logger });
  cleanupOnFailure = () => {
    core.db.close();
    lock.release();
  };
  logger.info(`Banco aberto (${core.dbDriver}) em ${config.dbPath}. ${config.groups.length} grupo(s) configurado(s).`);

  // discord.js só é carregado aqui (os scripts de sync/check não precisam dele).
  const { createDiscordBot } = require("./discord/bot");
  const app = {
    config,
    repo: core.repo,
    sync: core.sync,
    roblox: core.roblox,
    logger: logger.child("discord"),
    clock: core.clock,
    startedAt: Date.now(),
    dbDriver: core.dbDriver,
    pagination: createPaginationStore(),
    notifier: null,
  };
  const handlers = createHandlers(app);
  const bot = createDiscordBot({ config, logger: logger.child("discord"), handlers });
  const ctx = { timeZone: config.timezone, groupName: id => groupName(config.groups, id) };
  app.notifier = createNotifier({
    repo: core.repo,
    send: bot.send,
    ctx,
    logger: logger.child("avisos"),
    alerts: core.alerts,
    channelId: config.discord.salesChannelId,
  });
  const scheduler = createScheduler({ repo: core.repo, config, send: bot.send, ctx, logger: logger.child("resumos") });

  const stops = [];
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Recebido ${signal}; encerrando com calma...`);
    stops.forEach(stop => stop());
    core.sync.stop();
    const timeout = new Promise(resolve => setTimeout(resolve, 15000).unref());
    await Promise.race([core.sync.waitIdle().catch(() => {}), timeout]);
    try {
      await bot.stop();
    } catch {
      // ignora
    }
    core.db.close();
    lock.release();
    logger.info("Encerrado.");
    process.exit(0);
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", error => logger.error("Promise rejeitada sem tratamento:", error));
  process.on("uncaughtException", error => {
    // Estado desconhecido: sai e deixa o pm2 reiniciar limpo.
    logger.error("Exceção não capturada (o pm2 vai reiniciar o processo):", error);
    try {
      core.db.close();
    } finally {
      lock.release();
      process.exit(1);
    }
  });

  await bot.start();
  await core.alerts.setSender(bot.sendAlert);

  const pollMs = config.sync.pollIntervalMinutes * 60 * 1000;
  stops.push(every("coleta", pollMs, async () => {
    // Avisos saem logo depois das vendas novas, antes do backfill/revisão de pendentes.
    const result = await core.sync.runCycle({ afterNew: () => app.notifier.flush() });
    if (result.skipped) logger.debug(`Ciclo pulado: ${result.skipped}`);
    await app.notifier.flush();
  }));
  stops.push(every("saldo", config.sync.fundsSnapshotMinutes * 60 * 1000, () => core.sync.snapshotFunds()));
  stops.push(every("backup", 60 * 60 * 1000, () => core.backup.maybeBackup()));
  stops.push(every("resumos", 30 * 1000, () => scheduler.tick()));
  logger.info(`Coleta a cada ${config.sync.pollIntervalMinutes} min; saldo a cada ${config.sync.fundsSnapshotMinutes} min.`);
}

main().catch(error => {
  logger.error("Falha ao iniciar:", error);
  try {
    cleanupOnFailure();
  } finally {
    process.exit(1);
  }
});
