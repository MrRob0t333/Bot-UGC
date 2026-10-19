"use strict";

/**
 * Cliente HTTP resiliente (padrões do "Release It!"):
 *  - timeout por requisição (AbortController);
 *  - retry com backoff exponencial + jitter para falhas transitórias (rede, 5xx, 429);
 *  - respeita Retry-After em 429/503 (em 429 espera no mínimo ~5 s, dobrando);
 *  - limitador de requisições por minuto (janela deslizante), compartilhado e
 *    adaptativo: cada 429 corta o ritmo pela metade, que depois sobe aos poucos;
 *    se as tentativas de um 429 se esgotarem, todas as requisições pausam 1 min;
 *  - 401/403 NÃO são re-tentados aqui: viram erros tipados para a camada de cima
 *    decidir (marcar cookie inválido, avisar uma vez, espaçar tentativas).
 */

const { RobloxError, RobloxAuthError, RobloxPermissionError } = require("./errors");
const { redact } = require("../logger");

// Sem unref(): a espera precisa manter o processo vivo. Com unref(), um script
// (npm run check / sync:once) encerrava com código 0 no meio de um retry.
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const RATE_LIMIT_BASE_MS = 5000;
const RATE_LIMIT_PAUSE_MS = 60 * 1000;

// Depois de um 429, o limite volta a subir aos poucos: +10% a cada 5 min sem 429.
const RECOVERY_STEP_MS = 5 * 60 * 1000;
// Vários 429 em sequência (as tentativas de uma mesma requisição) contam como um só corte.
const PENALTY_WINDOW_MS = 30 * 1000;

class RateLimiter {
  constructor({ perMinute = 60, minPerMinute = 6, now = () => Date.now(), sleep = defaultSleep } = {}) {
    this.perMinute = perMinute;
    this.minPerMinute = Math.max(1, Math.min(perMinute, minPerMinute));
    this.limit = perMinute; // limite efetivo (cai com 429, sobe sozinho)
    this.now = now;
    this.sleep = sleep;
    this.timestamps = [];
    this.queue = Promise.resolve();
    this.pausedUntil = 0;
    this.lastChangeAt = 0;
  }

  /** Aguarda até haver espaço na janela de 60s. Serializa chamadas concorrentes. */
  acquire() {
    const run = async () => {
      const pause = this.pausedUntil - this.now();
      if (pause > 0) await this.sleep(pause);
      this.recover();
      for (;;) {
        const current = this.now();
        while (this.timestamps.length && current - this.timestamps[0] >= 60000) this.timestamps.shift();
        if (this.timestamps.length < this.limit) {
          this.timestamps.push(current);
          return;
        }
        await this.sleep(Math.max(50, 60000 - (current - this.timestamps[this.timestamps.length - this.limit]) + 10));
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  /**
   * A Roblox respondeu 429: corta o limite pela metade (no máximo uma vez a cada 30 s)
   * e, se `pauseMs`, segura TODAS as próximas requisições por esse tempo.
   * Retorna true se o limite mudou.
   */
  penalize(pauseMs = 0) {
    const now = this.now();
    let changed = false;
    if (now - this.lastChangeAt >= PENALTY_WINDOW_MS || this.limit >= this.perMinute) {
      const next = Math.max(this.minPerMinute, Math.floor(this.limit / 2));
      changed = next !== this.limit;
      this.limit = next;
      this.lastChangeAt = now;
    }
    if (pauseMs > 0) this.pausedUntil = Math.max(this.pausedUntil, now + pauseMs);
    return changed;
  }

  recover() {
    if (this.limit >= this.perMinute) return;
    const now = this.now();
    if (now - this.lastChangeAt < RECOVERY_STEP_MS) return;
    this.limit = Math.min(this.perMinute, this.limit + Math.max(1, Math.round(this.perMinute / 10)));
    this.lastChangeAt = now;
  }
}

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function backoffDelay(attempt, { baseMs = 1000, maxMs = 60000, random = Math.random } = {}) {
  // "Full jitter": aleatório entre 0 e base*2^tentativa (limitado).
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

function stripQuery(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url).split("?")[0];
  }
}

function createHttpClient(options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = 15000,
    maxRetries = 4,
    baseDelayMs = 1000,
    maxDelayMs = 60000,
    requestsPerMinute = 60,
    sleep = defaultSleep,
    random = Math.random,
    logger = null,
    defaultHeaders = {},
  } = options;
  const limiter = options.limiter || new RateLimiter({ perMinute: requestsPerMinute, sleep });

  function onRateLimited(pauseMs) {
    if (limiter.penalize?.(pauseMs)) {
      logger?.warn(`Roblox pediu para ir mais devagar: ritmo reduzido para ${limiter.limit} req/min (volta a subir sozinho).`);
    }
  }

  async function requestOnce(url, init) {
    await limiter.acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: { ...defaultHeaders, ...(init.headers || {}) },
        signal: controller.signal,
      });
      const text = await response.text();
      return { response, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * GET que retorna JSON. Lança RobloxAuthError (401), RobloxPermissionError (403)
   * ou RobloxError (demais) depois de esgotar as tentativas.
   */
  async function getJson(url, init = {}) {
    const safeUrl = stripQuery(url);
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let response;
      let text;
      try {
        ({ response, text } = await requestOnce(url, { method: "GET", ...init }));
      } catch (error) {
        const timedOut = error?.name === "AbortError";
        lastError = new RobloxError(
          timedOut ? `Tempo esgotado (${timeoutMs} ms) em ${safeUrl}` : `Falha de rede em ${safeUrl}: ${redact(error?.message || error)}`,
          { kind: timedOut ? "timeout" : "network", retryable: true, url: safeUrl },
        );
        if (attempt < maxRetries) {
          const delay = backoffDelay(attempt, { baseMs: baseDelayMs, maxMs: maxDelayMs, random });
          logger?.warn(`${lastError.message} — nova tentativa em ${delay} ms (${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
        throw lastError;
      }

      const status = response.status;
      if (status >= 200 && status < 300) {
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          throw new RobloxError(`Resposta não-JSON de ${safeUrl}`, { status, kind: "parse", url: safeUrl });
        }
      }

      const detail = extractErrorDetail(text);
      if (status === 401) {
        throw new RobloxAuthError(`Roblox recusou o cookie (401) em ${safeUrl}${detail ? `: ${detail}` : ""}`, { status, url: safeUrl });
      }
      if (status === 403) {
        throw new RobloxPermissionError(`Sem permissão (403) em ${safeUrl}${detail ? `: ${detail}` : ""}`, { status, url: safeUrl });
      }

      const retryable = status === 429 || status >= 500 || status === 408;
      lastError = new RobloxError(`Roblox respondeu ${status} em ${safeUrl}${detail ? `: ${detail}` : ""}`, {
        status,
        retryable,
        url: safeUrl,
      });
      if (status === 429) onRateLimited(attempt >= maxRetries ? RATE_LIMIT_PAUSE_MS : 0);
      if (!retryable || attempt >= maxRetries) throw lastError;

      const retryAfter = parseRetryAfter(response.headers?.get?.("retry-after"));
      // Em 429 a Roblox costuma mandar Retry-After curto demais (5 s) e responder 429 de novo:
      // usa o maior entre o Retry-After e um backoff que começa em ~5 s e dobra.
      const backoff = backoffDelay(attempt, {
        baseMs: status === 429 ? Math.max(baseDelayMs, RATE_LIMIT_BASE_MS) : baseDelayMs,
        maxMs: maxDelayMs,
        random,
      });
      const delay = retryAfter !== null
        ? Math.min(Math.max(retryAfter, status === 429 ? backoff : 250), 5 * 60000)
        : backoff;
      logger?.warn(`${lastError.message} — nova tentativa em ${delay} ms (${attempt + 1}/${maxRetries})`);
      await sleep(delay);
    }
    throw lastError;
  }

  return { getJson, limiter };
}

function extractErrorDetail(text) {
  if (!text) return "";
  try {
    const json = JSON.parse(text);
    const message = json?.errors?.[0]?.message || json?.message || json?.error;
    return message ? redact(String(message)).slice(0, 200) : "";
  } catch {
    return redact(String(text)).replace(/\s+/g, " ").slice(0, 160);
  }
}

module.exports = { createHttpClient, RateLimiter, parseRetryAfter, backoffDelay, stripQuery };
