"use strict";

/**
 * npm run sync:once — roda uma coleta completa sem Discord:
 * backfill (até terminar, retomável), incremental e snapshot de saldo.
 * Opções: --no-backfill  --max-backfill-pages=N  --dump (salva a 1ª página bruta em data/debug/)
 * As vendas novas encontradas aqui (fora do backfill) serão avisadas quando o bot subir.
 */

const fs = require("fs");
const path = require("path");
const { loadConfig, loadDotenv } = require("../config");
const { createLogger } = require("../logger");
const { acquireLock } = require("../lock");
const { createCore } = require("../app");
const { formatNumber } = require("../format");

loadDotenv();

async function main() {
  const args = process.argv.slice(2);
  const noBackfill = args.includes("--no-backfill");
  const dump = args.includes("--dump");
  const maxPagesArg = args.find(arg => arg.startsWith("--max-backfill-pages="));
  const maxBackfillPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : Infinity;

  const { config, errors, warnings } = loadConfig({ requireDiscord: false });
  const logger = createLogger({ level: config.logLevel, scope: "sync-once" });
  if (errors.length) {
    logger.error(`Configuração inválida:\n - ${errors.join("\n - ")}`);
    process.exit(1);
  }
  warnings.forEach(warning => logger.warn(warning));

  let lock;
  try {
    lock = acquireLock(config.lockPath, { label: "sync-once" });
  } catch (error) {
    logger.error(error.message);
    process.exit(1);
  }

  const core = createCore(config, { logger });
  let exitCode = 0;
  try {
    if (dump) {
      const group = config.groups[0];
      const page = await core.roblox.getSalesPage(group.id, null);
      const dir = path.join(config.dataDir, "debug");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `transactions_${group.id}.json`);
      fs.writeFileSync(file, JSON.stringify(page.raw, null, 2));
      console.log(`Página bruta salva em ${file} (${page.sales.length} vendas reconhecidas, ${page.skipped.length} ignoradas).`);
    }

    for (const group of config.groups) {
      const state = core.repo.getSyncState(group.id);
      if (!noBackfill && !state.backfill_done) {
        let pages = 0;
        for (;;) {
          const remaining = maxBackfillPages - pages;
          if (remaining <= 0) break;
          const chunk = await core.sync.runBackfillChunk(group, { maxPages: Math.min(50, remaining) });
          pages += chunk.pages;
          console.log(`[${group.name}] backfill: +${chunk.pages} pág. (${formatNumber(core.repo.countSales({ groupId: group.id }))} vendas no banco)${chunk.done ? " — concluído" : ""}`);
          if (chunk.done || chunk.pages === 0) break;
        }
      }
    }

    const cycle = await core.sync.runCycle({ force: true });
    for (const result of cycle.groups) {
      if (result.ok) {
        console.log(`✔ ${result.groupName}: ${result.newSales} nova(s), ${result.released} liberada(s), ${result.pages} página(s) lida(s).`);
      } else {
        exitCode = 1;
        console.log(`✘ ${result.groupName}: ${result.error?.message || result.skipped}`);
      }
    }

    const funds = await core.sync.snapshotFunds();
    for (const entry of funds) {
      if (entry.ok) console.log(`  saldo ${entry.groupName}: ${formatNumber(entry.robux)} Robux · pendentes ${formatNumber(entry.pendingRobux)}`);
      else console.log(`  saldo ${entry.groupName}: erro — ${entry.error?.message}`);
    }
    console.log(`Total no banco: ${formatNumber(core.repo.totalSalesCount())} vendas · aguardando aviso: ${formatNumber(core.repo.countUnnotified())}`);
  } catch (error) {
    exitCode = 1;
    logger.error("Falha na coleta:", error);
  } finally {
    core.db.close();
    lock.release();
  }
  process.exit(exitCode);
}

main();
