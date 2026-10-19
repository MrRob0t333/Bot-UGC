"use strict";

/**
 * Migrações versionadas. Nunca edite uma migração já publicada:
 * crie uma nova versão no fim da lista.
 */

const MIGRATIONS = [
  {
    version: 1,
    name: "esquema inicial",
    sql: `
      CREATE TABLE sales (
        id             TEXT PRIMARY KEY,          -- "<groupId>:<idTransação>" ou "<groupId>:h:<hash>"
        group_id       TEXT    NOT NULL,
        created_at     TEXT    NOT NULL,          -- ISO 8601 UTC
        amount         INTEGER NOT NULL,          -- Robux LÍQUIDOS (após taxa)
        currency_type  TEXT,
        is_pending     INTEGER NOT NULL DEFAULT 0,
        item_id        TEXT,
        item_name      TEXT,
        item_type      TEXT,
        place_id       TEXT,
        place_name     TEXT,
        buyer_id       TEXT,
        buyer_name     TEXT,
        raw_json       TEXT    NOT NULL,
        first_seen_at  TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL,
        notified_at    TEXT
      );
      CREATE INDEX idx_sales_group_created ON sales (group_id, created_at DESC);
      CREATE INDEX idx_sales_created ON sales (created_at DESC);
      CREATE INDEX idx_sales_item ON sales (item_id);
      CREATE INDEX idx_sales_buyer ON sales (buyer_id);
      CREATE INDEX idx_sales_pending ON sales (group_id, is_pending) WHERE is_pending = 1;
      CREATE INDEX idx_sales_unnotified ON sales (created_at) WHERE notified_at IS NULL;

      CREATE TABLE sync_state (
        group_id              TEXT PRIMARY KEY,
        last_success_at       TEXT,
        last_attempt_at       TEXT,
        last_error_at         TEXT,
        last_error            TEXT,
        consecutive_failures  INTEGER NOT NULL DEFAULT 0,
        backfill_done         INTEGER NOT NULL DEFAULT 0,
        backfill_cursor       TEXT,
        backfill_pages        INTEGER NOT NULL DEFAULT 0,
        backfill_started_at   TEXT,
        backfill_completed_at TEXT,
        last_new_sales        INTEGER NOT NULL DEFAULT 0,
        last_pages            INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE sync_errors (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id   TEXT,
        occurred_at TEXT NOT NULL,
        kind       TEXT,
        message    TEXT
      );

      CREATE TABLE funds_snapshots (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id      TEXT    NOT NULL,
        taken_at      TEXT    NOT NULL,
        robux         INTEGER,
        pending_robux INTEGER,
        raw_json      TEXT
      );
      CREATE INDEX idx_funds_group_taken ON funds_snapshots (group_id, taken_at DESC);

      CREATE TABLE item_prices (
        item_id     TEXT PRIMARY KEY,
        gross_price INTEGER NOT NULL,
        name        TEXT,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE app_state (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

function migrate(db, { logger } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    name       TEXT,
    applied_at TEXT NOT NULL
  )`);
  const current = db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version").get().v;
  const pending = MIGRATIONS.filter(migration => migration.version > current);
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, new Date().toISOString());
    });
    logger?.info(`Migração ${migration.version} aplicada: ${migration.name}`);
  }
  return { from: current, to: MIGRATIONS[MIGRATIONS.length - 1].version, applied: pending.length };
}

module.exports = { migrate, MIGRATIONS };
