"use strict";

/**
 * npm run check — diagnóstico completo, sem nunca imprimir segredos:
 *  1. valida .env, config/groups.json e config/item_prices.json;
 *  2. testa o cookie Roblox (conta autenticada);
 *  3. para cada grupo: nome público, permissão nas transações, saldo e resumo;
 *  4. testa o token Discord e o acesso aos canais configurados;
 *  5. mostra qual driver SQLite será usado e se o PNG dos gráficos funciona.
 */

const { loadConfig, loadDotenv } = require("../config");
const { createLogger, registerSecret, redact } = require("../logger");
const { createRobloxClient, RobloxAuthError, RobloxPermissionError } = require("../roblox");
const { formatNumber } = require("../format");
const { formatDateTime } = require("../time");

loadDotenv();

const results = { ok: 0, warn: 0, fail: 0 };
const line = (symbol, text) => console.log(`${symbol} ${redact(text)}`);
const ok = text => { results.ok += 1; line("✔", text); };
const warn = text => { results.warn += 1; line("!", text); };
const fail = text => { results.fail += 1; line("✘", text); };

async function discordGet(token, path) {
  const response = await fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${token}` } });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function checkDiscord(config) {
  console.log("\n— Discord");
  const { token, clientId, guildId, salesChannelId, summaryChannelId, alertChannelId } = config.discord;
  if (!token) {
    fail("DISCORD_TOKEN vazio.");
    return;
  }
  try {
    const me = await discordGet(token, "/users/@me");
    if (me.status !== 200) {
      fail(`Token Discord recusado (HTTP ${me.status}). Gere um novo token em Developer Portal → Bot → Reset Token.`);
      return;
    }
    ok(`Token válido: bot ${me.body.username} (${me.body.id}).`);
    if (clientId && me.body.id !== clientId) warn(`DISCORD_CLIENT_ID (${clientId}) difere do ID do bot (${me.body.id}). Normalmente são iguais.`);
    const guild = await discordGet(token, `/guilds/${guildId}`);
    if (guild.status === 200) ok(`Bot está no servidor "${guild.body.name}".`);
    else fail(`Bot não acessa o servidor ${guildId} (HTTP ${guild.status}). Convide-o com o link OAuth2 (escopos bot + applications.commands).`);
    const channels = [["SALES_CHANNEL_ID", salesChannelId], ["SUMMARY_CHANNEL_ID", summaryChannelId], ["ALERT_CHANNEL_ID", alertChannelId]];
    const seen = new Set();
    for (const [key, id] of channels) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const channel = await discordGet(token, `/channels/${id}`);
      if (channel.status === 200) ok(`${key}: #${channel.body.name} acessível.`);
      else fail(`${key}: canal ${id} inacessível (HTTP ${channel.status}). Dê ao bot permissão de Ver canal, Enviar mensagens, Inserir links e Anexar arquivos.`);
    }
  } catch (error) {
    fail(`Não foi possível falar com o Discord: ${error.message}`);
  }
}

async function checkRoblox(config) {
  console.log("\n— Roblox");
  if (!config.roblox.cookie) {
    fail("ROBLOX_COOKIE vazio — nada a testar.");
    return;
  }
  const roblox = createRobloxClient(config, {});
  // Diagnóstico deve ser rápido: sem longas esperas de retry.
  try {
    const user = await roblox.getAuthenticatedUser();
    ok(`Cookie válido: conta ${user.name} (${user.id}).`);
  } catch (error) {
    if (error instanceof RobloxAuthError) {
      fail("Cookie recusado (401): expirado, deslogado ou invalidado. Gere um novo .ROBLOSECURITY na conta alternativa. Se ele for invalidado logo após usar na VPS, gere outro estando logado e teste com npm run check na própria VPS.");
    } else {
      fail(`Falha ao validar o cookie: ${error.message}`);
    }
    return;
  }

  for (const group of config.groups) {
    console.log(`\n  Grupo ${group.name} (${group.id}) — divisão ${Object.entries(group.split).map(([id, pct]) => `${id}: ${pct}%`).join(", ")}`);
    try {
      const info = await roblox.getGroupInfo(group.id);
      ok(`  Grupo existe: "${info.name}".`);
    } catch (error) {
      warn(`  Não consegui ler o grupo publicamente: ${error.message}`);
    }
    try {
      const page = await roblox.getSalesPage(group.id, null);
      ok(`  Permissão de ver transações OK — 1ª página: ${page.sales.length} venda(s) reconhecida(s), ${page.skipped.length} ignorada(s), ${page.nextCursor ? "há mais páginas" : "sem mais páginas"}.`);
      const first = page.raw?.data?.[0];
      if (first) {
        const keys = Object.keys(first).sort().join(", ");
        console.log(`    campos da venda: ${keys}`);
        const sale = page.sales[0];
        if (sale) {
          console.log(`    exemplo: ${formatDateTime(new Date(sale.createdAt), config.timezone)} · ${formatNumber(sale.amount)} Robux · ${sale.itemName} · comprador ${sale.buyerName} · ${sale.isPending ? "pendente" : "liberado"} · id ${sale.hasStableId ? "estável" : "HASH (sem ID na API)"}`);
          if (!sale.hasStableId) warn("  A API não devolveu ID da transação; usando hash determinístico (veja DECISIONS.md).");
          if (!sale.itemId) warn("  Venda sem ID de item — confira os campos acima.");
        }
      }
    } catch (error) {
      if (error instanceof RobloxPermissionError) fail("  Sem permissão (403): dê ao cargo da conta alternativa a permissão de ver as finanças/receita do grupo.");
      else fail(`  Transações: ${error.message}`);
    }
    try {
      const funds = await roblox.getFunds(group.id);
      ok(`  Saldo: ${formatNumber(funds.robux)} Robux.`);
    } catch (error) {
      fail(`  Saldo: ${error.message}`);
    }
    try {
      const summary = await roblox.getRevenueSummary(group.id, "Day");
      ok(`  Resumo de receita (dia): pendentes ${formatNumber(summary.pendingRobux)} Robux.`);
    } catch (error) {
      warn(`  Resumo de receita indisponível: ${error.message}`);
    }
  }
}

function checkLocal() {
  console.log("\n— Ambiente");
  ok(`Node ${process.version}.`);
  try {
    require("better-sqlite3");
    ok("SQLite: better-sqlite3 instalado.");
  } catch {
    try {
      const { Database } = require("../db/driver");
      new Database(":memory:", { driver: "node:sqlite" }).close();
      warn("better-sqlite3 indisponível; usando node:sqlite embutido do Node (funciona, ver DECISIONS.md).");
    } catch {
      fail("Nenhum driver SQLite: rode npm install (better-sqlite3) ou use Node >= 22.13.");
    }
  }
  try {
    const { svgToPng, buildBarChartSvg } = require("../charts/barChart");
    const png = svgToPng(buildBarChartSvg([{ label: "01/01", net: 10, count: 1 }], { title: "teste" }));
    if (png) ok("Gráficos PNG: @resvg/resvg-js OK.");
    else warn("@resvg/resvg-js não instalado: /grafico enviará SVG. Rode npm install.");
  } catch (error) {
    warn(`Gráficos PNG falharam: ${error.message}`);
  }
  try {
    require("discord.js");
    ok("discord.js instalado.");
  } catch {
    fail("discord.js não instalado: rode npm install.");
  }
}

async function main() {
  console.log("Diagnóstico do sales-bot (nenhum segredo é exibido)\n\n— Configuração");
  const { config, errors, warnings } = loadConfig({ requireDiscord: true, requireRoblox: true });
  registerSecret(config.roblox.cookie);
  registerSecret(config.discord.token);
  createLogger({ level: "warn" });
  if (errors.length) errors.forEach(fail);
  else ok(`.env e config/groups.json válidos (${config.groups.length} grupo(s), donos: ${config.ownerIds.join(", ")}, fuso ${config.timezone}).`);
  warnings.forEach(warn);
  if (config.itemPrices.length) ok(`${config.itemPrices.length} preço(s) de item cadastrado(s) para o bruto estimado.`);

  checkLocal();
  if (config.groups.length) await checkRoblox(config);
  await checkDiscord(config);

  console.log(`\nResultado: ${results.ok} ok, ${results.warn} aviso(s), ${results.fail} problema(s).`);
  process.exit(results.fail ? 1 : 0);
}

main().catch(error => {
  console.error(redact(`Falha inesperada no diagnóstico: ${error?.stack || error}`));
  process.exit(1);
});
