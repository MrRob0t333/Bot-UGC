"use strict";

/**
 * Trava de instância única baseada em arquivo com PID.
 * Se o arquivo existir mas o processo dono não estiver vivo, a trava é tomada.
 */

const fs = require("fs");
const path = require("path");

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function acquireLock(lockPath, { label = "sales-bot" } = {}) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload = JSON.stringify({ pid: process.pid, label, startedAt: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, payload, { flag: "wx" });
      let released = false;
      return {
        path: lockPath,
        release() {
          if (released) return;
          released = true;
          try {
            const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
            if (current.pid === process.pid) fs.unlinkSync(lockPath);
          } catch {
            // arquivo já removido
          }
        },
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let holder = null;
      try {
        holder = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      } catch {
        holder = null;
      }
      if (holder && holder.pid !== process.pid && processAlive(holder.pid)) {
        const err = new Error(`Outra instância (${holder.label || "sales-bot"}, PID ${holder.pid}) já está rodando desde ${holder.startedAt}. Pare-a antes (pm2 stop sales-bot).`);
        err.code = "ELOCKED";
        throw err;
      }
      // Trava órfã (processo morto): remove e tenta de novo.
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // outro processo pode ter removido
      }
    }
  }
  throw new Error(`Não foi possível obter a trava ${lockPath}.`);
}

module.exports = { acquireLock, processAlive };
