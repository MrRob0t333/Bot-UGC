"use strict";

/**
 * Logger com redação de segredos.
 *
 * Tudo o que passa por aqui (mensagens, objetos, stacks de erro) é redigido:
 *  - valores registrados explicitamente (cookie, tokens) via registerSecret();
 *  - padrões conhecidos (.ROBLOSECURITY=..., aviso "_|WARNING:-DO-NOT-SHARE",
 *    tokens de bot Discord, cabeçalhos Cookie/Authorization/x-api-key).
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACTED = "[REDIGIDO]";

const secrets = new Set();

const PATTERNS = [
  // .ROBLOSECURITY=<valor> (cabeçalho ou texto solto)
  [/(\.ROBLOSECURITY\s*[=:]\s*)[^;\s"',}]+/gi, `$1${REDACTED}`],
  // valor do cookie Roblox começa com este aviso
  [/_\|WARNING:-DO-NOT-SHARE-THIS[^\s"',;}]*/g, REDACTED],
  // cabeçalhos sensíveis em JSON ou texto
  [/("?(?:cookie|authorization|x-api-key|x-csrf-token)"?\s*[:=]\s*"?)[^"\n,}]+/gi, `$1${REDACTED}`],
  // token de bot Discord (três partes base64url separadas por ponto)
  [/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/g, REDACTED],
];

function registerSecret(value) {
  const text = String(value || "").trim();
  // Valores curtos demais gerariam falsos positivos (ex.: "1").
  if (text.length >= 8) secrets.add(text);
}

function clearSecrets() {
  secrets.clear();
}

function redact(input) {
  if (input === null || input === undefined) return input;
  let text = typeof input === "string" ? input : safeStringify(input);
  for (const secret of secrets) {
    if (text.includes(secret)) text = text.split(secret).join(REDACTED);
  }
  for (const [pattern, replacement] of PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function safeStringify(value) {
  if (value instanceof Error) {
    const extra = value.status ? ` (status ${value.status})` : "";
    return `${value.name}: ${value.message}${extra}${value.stack ? `\n${value.stack.split("\n").slice(1).join("\n")}` : ""}`;
  }
  if (typeof value !== "object") return String(value);
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
      if (typeof val === "bigint") return val.toString();
      if (val instanceof Error) return safeStringify(val);
      if (val && typeof val === "object") {
        if (seen.has(val)) return "[circular]";
        seen.add(val);
      }
      return val;
    });
  } catch {
    return String(value);
  }
}

function createLogger(options = {}) {
  const levelName = String(options.level || process.env.LOG_LEVEL || "info").toLowerCase();
  const minLevel = LEVELS[levelName] ?? LEVELS.info;
  const sink = options.sink || ((level, line) => {
    if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  });
  const scope = options.scope ? `[${options.scope}] ` : "";

  function log(level, message, ...details) {
    if (LEVELS[level] < minLevel) return;
    const parts = [message, ...details].map(part => (typeof part === "string" ? part : safeStringify(part)));
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${scope}${parts.join(" ")}`;
    sink(level, redact(line));
  }

  return {
    debug: (...args) => log("debug", ...args),
    info: (...args) => log("info", ...args),
    warn: (...args) => log("warn", ...args),
    error: (...args) => log("error", ...args),
    child: childScope => createLogger({ ...options, scope: options.scope ? `${options.scope}:${childScope}` : childScope }),
  };
}

module.exports = { createLogger, registerSecret, clearSecrets, redact, REDACTED };
