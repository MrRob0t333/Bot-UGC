"use strict";

/**
 * Monta as peças (composição): banco, cliente Roblox, serviços.
 * Usado pelo processo principal e pelos scripts de linha de comando.
 */

const { openDatabase } = require("./db/driver");
const { migrate } = require("./db/migrations");
const { createRepository } = require("./db/repository");
const { createRobloxClient } = require("./roblox");
const { createSyncService } = require("./sync/syncService");
const { createAlerts } = require("./sync/alerts");
const { createBackupService } = require("./sync/backup");
const { registerSecret } = require("./logger");

function createCore(config, { logger, roblox, clock = () => new Date(), dbPath } = {}) {
  registerSecret(config.roblox.cookie);
  registerSecret(config.discord.token);

  const db = openDatabase(dbPath || config.dbPath);
  migrate(db, { logger });
  const repo = createRepository(db);
  repo.replaceItemPrices(config.itemPrices);

  const alerts = createAlerts({ repo, logger: logger?.child?.("alerta") || logger });
  const robloxClient = roblox || createRobloxClient(config, { logger: logger?.child?.("roblox") || logger });
  const sync = createSyncService({
    repo,
    roblox: robloxClient,
    config,
    logger: logger?.child?.("sync") || logger,
    alerts,
    clock,
  });
  const backup = createBackupService({ db, repo, config, logger: logger?.child?.("backup") || logger, clock });

  return { db, repo, alerts, roblox: robloxClient, sync, backup, clock, dbDriver: db.driverName };
}

module.exports = { createCore };
