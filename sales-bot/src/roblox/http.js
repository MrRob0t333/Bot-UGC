"use strict";

/**
 * Cliente HTTP resiliente (padrões do "Release It!"):
 *  - timeout por requisição (AbortController);
 *  - retry com backoff exponencial + jitter para falhas transitórias (rede, 5xx, 429);
 *  - respeita Retry-After em 429/503;
 *  - limitador de requisições por minuto (janela deslizante), compartilhado;
 *  - 401/403 NÃO são re-tentados aqui: viram erros tipados para a camada de cima
 *    decidir (marcar cookie inválido, avisar uma vez, espaçar tentativas).
 */

const { RobloxError, RobloxAuthError, RobloxPermissionError } = require("./errors");
const { redact } = require("../logger");

const defaultSleep = ms => new Promise(resolve => {
  const timer = setTimeout(resolve, ms);
  timer.unref?.();
});

class RateLimiter {
  constructor({ perMinute = 60, now = () => Date.now(), sleep = defaultSleep } = {}) {
    this.perMinute = perMinute;
    this.now = now;
    this.sleep = sleep;
    this.timestamps = [];
    this.queue = Promise.resolve();
  }

  /** Aguarda até haver espaço na janela de 60s. Serializa chamadas concorrentes. */
  acquire() {
    const run = async () => {
      for (;;) {
        const current = this.now();
        while (this.timestamps.length && current - this.timestamps[0] >= 60000) this.timestamps.shift();
        if (this.timestamps.length < this.perMinute) {
          this.timestamps.push(current);
          return;
        }
        await this.sleep(Math.max(50, 60000 - (current - this.timestamps[0]) + 10));
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
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
      if (!retryable || attempt >= maxRetries) throw lastError;

      const retryAfter = parseRetryAfter(response.headers?.get?.("retry-after"));
      const delay = retryAfter !== null
        ? Math.min(Math.max(retryAfter, 250), 5 * 60000)
        : backoffDelay(attempt, { baseMs: baseDelayMs, maxMs: maxDelayMs, random });
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
