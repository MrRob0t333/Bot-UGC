/**
 * Leitura única dos cookies .ROBLOSECURITY do .env.
 *
 * Aceita o cookie colado de vários jeitos comuns e devolve só o valor:
 *   _|WARNING:...|_CAEaAh...
 *   .ROBLOSECURITY=_|WARNING:...
 *   "_|WARNING:..."            (com aspas)
 *   Cookie: .ROBLOSECURITY=...  (copiado do DevTools)
 * Espaços, quebras de linha do Windows (\r) e aspas são removidos.
 */
"use strict";

function normalizeCookie(value) {
  let v = String(value ?? "").replace(/[\r\n\t]/g, "").trim();
  v = v.replace(/^cookie\s*:\s*/i, "").trim();
  v = v.replace(/^["'`]+|["'`]+$/g, "").trim();
  v = v.replace(/^\.?ROBLOSECURITY\s*=\s*/i, "").trim();
  v = v.replace(/^["'`]+|["'`]+$/g, "").trim();
  // corta atributos extras copiados junto (ex.: "; path=/; secure")
  const semi = v.indexOf(";");
  if (semi !== -1) v = v.slice(0, semi).trim();
  return v;
}

// Lista separada por vírgula, ponto e vírgula ou linha. O valor do cookie
// (inclusive o aviso _|WARNING...|_) não contém esses caracteres.
function parseCookieList(value) {
  return String(value ?? "")
    .split(/[,;\n\r]+/)
    .map(normalizeCookie)
    .filter(Boolean);
}

// Lê ROBLOSECURITY, ROBLOSECURITY_2 ... ROBLOSECURITY_N (em ordem numérica,
// qualquer quantidade) e o REFAZER_ROBLOSECURITY_POOL. Devolve também de qual
// variável cada cookie veio, para saber qual linha do .env corrigir.
function loadRobloxCookieEntries(env = process.env, extra = []) {
  const entries = [];
  extra.forEach((c, i) => entries.push({ source: `extra#${i + 1}`, cookie: normalizeCookie(c) }));
  entries.push({ source: "ROBLOSECURITY", cookie: normalizeCookie(env.ROBLOSECURITY) });

  const numbered = new Map();
  for (const key of Object.keys(env)) {
    const m = /^(?:REFAZER_)?ROBLOSECURITY_(\d+)$/.exec(key);
    if (!m) continue;
    const n = Number(m[1]);
    const cookie = normalizeCookie(env[key]);
    // ROBLOSECURITY_N tem prioridade sobre REFAZER_ROBLOSECURITY_N
    if (cookie && (!numbered.has(n) || !key.startsWith("REFAZER_"))) numbered.set(n, { source: key, cookie });
  }
  [...numbered.keys()].sort((a, b) => a - b).forEach(n => entries.push(numbered.get(n)));

  parseCookieList(env.REFAZER_ROBLOSECURITY_POOL).forEach((cookie, i) =>
    entries.push({ source: `REFAZER_ROBLOSECURITY_POOL (item ${i + 1})`, cookie }));

  const seen = new Set();
  return entries.filter(e => {
    if (!e.cookie || seen.has(e.cookie)) return false;
    seen.add(e.cookie);
    return true;
  });
}

function loadRobloxCookies(env = process.env, extra = []) {
  return loadRobloxCookieEntries(env, extra).map(e => e.cookie);
}

function maskCookie(cookie) {
  const c = String(cookie || "");
  if (c.length <= 16) return c ? "***" : "";
  return c.slice(0, 6) + "..." + c.slice(-6);
}

module.exports = { normalizeCookie, parseCookieList, loadRobloxCookies, loadRobloxCookieEntries, maskCookie };
