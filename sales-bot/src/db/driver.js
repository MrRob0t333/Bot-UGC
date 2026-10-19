"use strict";

/**
 * Adaptador fino sobre o SQLite. Tenta `better-sqlite3` (preferido) e cai para o
 * `node:sqlite` embutido no Node (>= 22.5) quando o módulo nativo não está instalado.
 * O resto do código só conhece esta interface: exec, prepare().run/get/all,
 * transaction(fn), backupTo(path), close().
 */

const fs = require("fs");
const path = require("path");

function silenceSqliteExperimentalWarning() {
  const original = process.emitWarning;
  if (original.__salesBotPatched) return;
  const patched = function (warning, ...args) {
    const text = typeof warning === "string" ? warning : warning?.message;
    const type = typeof args[0] === "string" ? args[0] : args[0]?.type;
    if ((type === "ExperimentalWarning" || warning?.name === "ExperimentalWarning") && /SQLite/i.test(String(text))) return;
    return original.call(process, warning, ...args);
  };
  patched.__salesBotPatched = true;
  process.emitWarning = patched;
}

function loadBetterSqlite() {
  try {
    return require("better-sqlite3");
  } catch {
    return null;
  }
}

function loadNodeSqlite() {
  try {
    silenceSqliteExperimentalWarning();
    return require("node:sqlite");
  } catch {
    return null;
  }
}

class Database {
  constructor(file, { driver } = {}) {
    this.file = file;
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });

    const preferBetter = driver !== "node:sqlite";
    const Better = preferBetter ? loadBetterSqlite() : null;
    if (Better) {
      this.driverName = "better-sqlite3";
      this.raw = new Better(file);
    } else {
      const nodeSqlite = loadNodeSqlite();
      if (!nodeSqlite) {
        throw new Error("Nenhum driver SQLite disponível: instale better-sqlite3 (npm install) ou use Node >= 22.13.");
      }
      this.driverName = "node:sqlite";
      this.nodeSqlite = nodeSqlite;
      this.raw = new nodeSqlite.DatabaseSync(file);
    }
    this.transactionDepth = 0;
    this.statementCache = new Map();
  }

  exec(sql) {
    this.raw.exec(sql);
  }

  /** Statement com run/get/all usando parâmetros posicionais (?). */
  prepare(sql) {
    let statement = this.statementCache.get(sql);
    if (!statement) {
      statement = this.raw.prepare(sql);
      this.statementCache.set(sql, statement);
    }
    return {
      run: (...params) => {
        const result = statement.run(...params);
        return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
      },
      get: (...params) => normalizeRow(statement.get(...params)),
      all: (...params) => statement.all(...params).map(normalizeRow),
    };
  }

  /** Executa fn dentro de uma transação (aninhamento vira savepoint). */
  transaction(fn) {
    const depth = this.transactionDepth;
    const savepoint = `sp_${depth}`;
    this.exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
    this.transactionDepth += 1;
    try {
      const result = fn();
      this.transactionDepth -= 1;
      this.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      try {
        this.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      } catch {
        // ignora: o erro original é mais útil
      }
      throw error;
    }
  }

  pragma(statement) {
    return this.prepare(`PRAGMA ${statement}`).all();
  }

  /**
   * Cópia consistente do banco (API de backup do SQLite quando disponível;
   * senão VACUUM INTO, que também gera um snapshot transacional).
   */
  async backupTo(destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(destination)) throw new Error(`Destino de backup já existe: ${destination}`);
    if (this.driverName === "better-sqlite3" && typeof this.raw.backup === "function") {
      await this.raw.backup(destination);
      return "sqlite-backup-api";
    }
    if (this.nodeSqlite && typeof this.nodeSqlite.backup === "function") {
      await this.nodeSqlite.backup(this.raw, destination);
      return "sqlite-backup-api";
    }
    this.prepare("VACUUM INTO ?").run(destination);
    return "vacuum-into";
  }

  close() {
    this.statementCache.clear();
    try {
      this.raw.close();
    } catch {
      // já fechado
    }
  }
}

function normalizeRow(row) {
  if (!row) return row ?? undefined;
  // node:sqlite devolve objetos sem prototype; convertemos para objeto comum.
  return Object.getPrototypeOf(row) === null ? { ...row } : row;
}

function openDatabase(file, options = {}) {
  const db = new Database(file, options);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  return db;
}

module.exports = { openDatabase, Database };
