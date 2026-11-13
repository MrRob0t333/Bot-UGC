/**
 * TURBO WATCHDOG - Nunca deixa o bot morrer.
 *
 * Monitora um heartbeat (timestamp atualizado pelo bot principal). Se o bot
 * travar por mais de REFAZER_WATCHDOG_MAX_STALL_MS, o watchdog encerra o
 * processo para que o PM2/systemd o reinicie automaticamente.
 *
 * Uso no início do refazer_bot.js:
 *   const watchdog = require('./turbo_watchdog');
 *   watchdog.start();           // inicia a監agem
 *   watchdog.heartbeat();       // chame periodicamente (ex: a cada evento/tarefa)
 *
 * Variáveis de ambiente:
 *   REFAZER_WATCHDOG_ENABLED=true
 *   REFAZER_WATCHDOG_CHECK_INTERVAL_MS=30000
 *   REFAZER_WATCHDOG_MAX_STALL_MS=120000
 */
"use strict";

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "data", "turbo", "watchdog_heartbeat.json");
let enabled = process.env.REFAZER_WATCHDOG_ENABLED === "true";
let checkIntervalMs = Number(process.env.REFAZER_WATCHDOG_CHECK_INTERVAL_MS || 30000);
let maxStallMs = Number(process.env.REFAZER_WATCHDOG_MAX_STALL_MS || 120000);
let lastHeartbeat = Date.now();
let timer = null;
let started = false;

function ensureDir() {
  try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); } catch {}
}

function writeHeartbeat() {
  ensureDir();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ts: lastHeartbeat, pid: process.pid, at: new Date().toISOString() }));
  } catch {}
}

function readHeartbeat() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return data.ts || 0;
  } catch {
    return 0;
  }
}

function heartbeat() {
  lastHeartbeat = Date.now();
  writeHeartbeat();
}

function start() {
  if (started) return;
  started = true;
  if (!enabled) {
    console.log("[watchdog] desabilitado (REFAZER_WATCHDOG_ENABLED!=true)");
    return;
  }
  heartbeat();
  console.log(`[watchdog] ativo: check=${checkIntervalMs}ms maxStall=${maxStallMs}ms`);
  timer = setInterval(() => {
    const now = Date.now();
    const last = Math.max(lastHeartbeat, readHeartbeat());
    const stall = now - last;
    if (stall > maxStallMs) {
      console.error(`[watchdog] TRAVADO detectado: sem heartbeat por ${Math.round(stall / 1000)}s. Encerrando processo para reinício automático.`);
      try { process.exitCode = 1; } catch {}
      process.exit(1);
    } else {
      console.log(`[watchdog] ok: heartbeat há ${Math.round(stall / 1000)}s`);
    }
  }, checkIntervalMs);
  timer.unref ? timer.unref() : null;
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  started = false;
}

module.exports = { start, stop, heartbeat, enabled };
