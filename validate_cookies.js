/**
 * VALIDADOR DE COOKIES ROBLOX
 *
 * Testa cada cookie .ROBLOSECURITY configurado no .env contra a API oficial
 * do Roblox e reporta quais estão válidos, expirados ou inválidos.
 *
 * Uso:
 *   node validate_cookies.js
 *
 * Requisito: preencha ROBLOSECURITY, ROBLOSECURITY_2, ROBLOSECURITY_3
 * ou REFAZER_ROBLOSECURITY_POOL no arquivo .env antes de rodar.
 */
"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { loadRobloxCookieEntries, maskCookie } = require("./roblox_cookies");

function parseCookies() {
  return loadRobloxCookieEntries(process.env);
}

async function validateCookie(cookie) {
  try {
    const res = await fetch("https://users.roblox.com/v1/users/authenticated", {
      headers: {
        Cookie: `.ROBLOSECURITY=${cookie}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 200) {
      const json = await res.json();
      return {
        valid: true,
        status: res.status,
        username: json.username || "desconhecido",
        userId: json.id || "desconhecido",
        displayName: json.displayName || "",
      };
    }

    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: res.status, reason: "Cookie expirado ou inválido (401/403)" };
    }

    return { valid: false, status: res.status, reason: `Status inesperado ${res.status}` };
  } catch (err) {
    return { valid: false, status: 0, reason: err.message || "Erro de rede" };
  }
}

async function main() {
  const cookies = parseCookies();

  console.log("=".repeat(60));
  console.log("🍪 VALIDADOR DE COOKIES ROBLOX");
  console.log("=".repeat(60));

  if (cookies.length === 0) {
    console.log("\n⚠️  Nenhum cookie encontrado no .env.");
    console.log("   Preencha ROBLOSECURITY ou REFAZER_ROBLOSECURITY_POOL e rode novamente.\n");
    process.exit(0);
  }

  console.log(`\n🔎 Encontrados ${cookies.length} cookie(s). Validando...\n`);

  const results = [];
  for (let i = 0; i < cookies.length; i++) {
    const { cookie, source } = cookies[i];
    process.stdout.write(`   [${i + 1}/${cookies.length}] ${source} ${maskCookie(cookie)} ... `);
    const result = await validateCookie(cookie);
    results.push({ index: i + 1, source, cookie, ...result });

    if (result.valid) {
      console.log(`✅ VÁLIDO (user=${result.username}, id=${result.userId})`);
    } else {
      console.log(`❌ INVÁLIDO (${result.reason})`);
    }
  }

  const validos = results.filter(r => r.valid).length;
  const invalidos = results.length - validos;

  console.log("\n" + "=".repeat(60));
  console.log(`📊 RESULTADO: ${validos} válido(s) | ${invalidos} inválido(s) de ${results.length}`);
  console.log("=".repeat(60));

  if (validos === 0 && results.length > 0) {
    console.log("\n⚠️  Nenhum cookie válido. O bot não conseguirá acessar assets protegidos do Roblox.");
    console.log("   Pegue cookies novos seguindo o guia TURBO_INTEGRATION.md\n");
  } else if (invalidos > 0) {
    console.log("\n⚠️  Alguns cookies estão inválidos. Troque estas linhas do .env:");
    for (const r of results.filter(x => !x.valid)) console.log(`   - ${r.source}  (${r.reason})`);
    console.log("");
  } else {
    console.log("\n✅ Todos os cookies estão válidos. O bot pode iniciar com segurança.\n");
  }

  // Salva relatório
  const reportDir = path.join(__dirname, "data", "turbo");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "cookie_validation.json");
  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    valid: validos,
    invalid: invalidos,
    details: results.map(r => ({
      index: r.index,
      envVar: r.source,
      cookiePreview: maskCookie(r.cookie),
      valid: r.valid,
      status: r.status,
      username: r.username || null,
      userId: r.userId || null,
      reason: r.reason || null,
    })),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`💾 Relatório salvo em: ${reportPath}`);
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
