"use strict";

/**
 * Backup diário consistente do SQLite em data/backups/, mantendo os últimos N.
 * Só apaga arquivos que ele mesmo criou (prefixo sales-AAAAMMDD-HHMM.db).
 */

const fs = require("fs");
const path = require("path");
const { zonedParts, pad } = require("../time");

const BACKUP_PATTERN = /^sales-\d{8}-\d{4,6}\.db$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function backupName(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `sales-${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}${pad(p.second)}.db`;
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => BACKUP_PATTERN.test(name)).sort();
}

function pruneBackups(dir, keep) {
  const files = listBackups(dir);
  const removed = [];
  for (const name of files.slice(0, Math.max(0, files.length - keep))) {
    fs.unlinkSync(path.join(dir, name));
    removed.push(name);
  }
  return removed;
}

function createBackupService({ db, repo, config, logger, clock = () => new Date() }) {
  return {
    async runBackup() {
      const now = clock();
      const target = path.join(config.backupDir, backupName(now, config.timezone));
      const method = await db.backupTo(target);
      const removed = pruneBackups(config.backupDir, config.sync.backupKeep);
      repo.setState("backup:last", { at: now.toISOString(), file: path.basename(target), method });
      logger?.info(`Backup criado: ${path.basename(target)} (${method}); ${removed.length} antigo(s) removido(s).`);
      return { file: target, method, removed };
    },

    /** Faz backup se o último tiver mais de 24h (ou nunca). */
    async maybeBackup() {
      const last = repo.getState("backup:last");
      if (last?.at && clock().getTime() - Date.parse(last.at) < DAY_MS) return null;
      return this.runBackup();
    },
  };
}

module.exports = { createBackupService, pruneBackups, listBackups, backupName };
