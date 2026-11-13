/**
 * TURBO ENGINE - Motor de potência máxima para UGC sem parar.
 * Pool de cookies com saúde individual, rate limit adaptativo, workers concorrentes,
 * proxies, fila persistente e auto-recuperação.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadRobloxCookies } = require("./roblox_cookies");
let ProxyAgent;
function getProxyAgent() {
  if (!ProxyAgent) {
    try { ProxyAgent = require("undici").ProxyAgent; } catch { ProxyAgent = null; }
  }
  return ProxyAgent;
}

const DATA_DIR = path.join(__dirname, "data", "turbo");
const COOKIE_HEALTH_PATH = path.join(DATA_DIR, "cookie_health.json");
const QUEUE_PATH = path.join(DATA_DIR, "turbo_queue.json");

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function readJsonFile(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJsonFile(file, data) { ensureDir(); const tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, file); }

function newCookieState(baseIntervalMs) { return { fails: 0, consecutiveFails: 0, lastFailAt: null, lastSuccessAt: null, sidelineUntil: 0, intervalMs: baseIntervalMs, totalRequests: 0, totalSuccess: 0, lastUsedAt: 0 }; }
function newProxyState() { return { fails: 0, lastFailAt: null, sidelineUntil: 0, totalRequests: 0, totalSuccess: 0 }; }

function createTurboEngine(opts = {}) {
  const env = process.env;
  const cookies = loadRobloxCookies(env, Array.isArray(opts.cookies) ? opts.cookies : []);

  const baseIntervalMs = Number(env.REFAZER_TURBO_BASE_INTERVAL_MS || 400);
  const minIntervalMs = Number(env.REFAZER_TURBO_MIN_INTERVAL_MS || 200);
  const maxIntervalMs = Number(env.REFAZER_TURBO_MAX_INTERVAL_MS || 5000);
  const backoffMultiplier = Number(env.REFAZER_TURBO_BACKOFF_MULT || 2);
  const successDecayMs = Number(env.REFAZER_TURBO_SUCCESS_DECAY_MS || 50);
  const maxAttempts = Number(env.REFAZER_TURBO_MAX_ATTEMPTS || 8);
  const initialRetryMs = Number(env.REFAZER_TURBO_INITIAL_RETRY_MS || 1000);
  const maxConcurrentTotal = Number(env.REFAZER_TURBO_CONCURRENCY_TOTAL || 12);
  const rawProxies = String(env.REFAZER_TURBO_PROXY_POOL || env.REFAZER_ROBLOX_PUBLIC_PROXY_URL || "").split(/[,\n;]+/).map(p => p.trim()).filter(Boolean);
  const proxies = rawProxies;
  const authPauseMs = Number(env.REFAZER_ROBLOX_AUTH_PAUSE_MS || 10 * 60 * 1000);
  const rateLimitPauseMs = Number(env.REFAZER_ROBLOX_RATE_LIMIT_PAUSE_MS || 60000);
  const cookieSidelineMs = Number(env.REFAZER_TURBO_COOKIE_SIDELINE_MS || 15 * 60 * 1000);
  const publicMirrorEnabled = String(env.REFAZER_ROBLOX_PUBLIC_MIRROR_ENABLED || "true") !== "false";

  const cookieHealth = new Map();
  const proxyHealth = new Map();
  for (const c of cookies) cookieHealth.set(c, newCookieState(baseIntervalMs));
  for (const p of proxies) proxyHealth.set(p, newProxyState());
  const persisted = readJsonFile(COOKIE_HEALTH_PATH, {});
  for (const [cookie, state] of Object.entries(persisted)) { if (cookieHealth.has(cookie)) { const cur = cookieHealth.get(cookie); Object.assign(cur, state); } }

  let globalIntervalMs = baseIntervalMs;
  let globalPausedUntil = 0;
  let rateLimitedUntil = 0;
  let lastGlobalError = "";
  let lastGlobalStatus = 0;
  const requestQueue = readJsonFile(QUEUE_PATH, { pending: [], processing: [], done: [] });
  let activeCount = 0;
  function saveHealth() { try { const obj = {}; for (const [k, v] of cookieHealth) obj[k] = v; writeJsonFile(COOKIE_HEALTH_PATH, obj); } catch (e) { console.warn("[turbo] salvar saúde:", e.message); } }
  function saveQueue() { try { writeJsonFile(QUEUE_PATH, requestQueue); } catch (e) { console.warn("[turbo] salvar fila:", e.message); } }

  function pickBestCookie() {
    const now = Date.now(); let best = null; let bestScore = -1;
    for (const [cookie, state] of cookieHealth) {
      if (state.sidelineUntil > now) continue;
      const successRate = state.totalRequests ? state.totalSuccess / state.totalRequests : 1;
      const recencyPenalty = now - state.lastUsedAt;
      const score = successRate * 1000 - state.consecutiveFails * 500 - state.intervalMs / 100 + recencyPenalty / 10000;
      if (score > bestScore) { bestScore = score; best = { cookie, state }; }
    }
    return best;
  }
  function pickBestProxy() {
    const now = Date.now(); let best = null; let bestScore = -1;
    for (const [proxy, state] of proxyHealth) {
      if (state.sidelineUntil > now) continue;
      const successRate = state.totalRequests ? state.totalSuccess / state.totalRequests : 1;
      const score = successRate * 1000 - state.fails * 100;
      if (score > bestScore) { bestScore = score; best = { proxy, state }; }
    }
    return best;
  }
  function recordSuccess(cookie, proxy) {
    const now = Date.now();
    if (cookie && cookieHealth.has(cookie)) { const s = cookieHealth.get(cookie); s.consecutiveFails = 0; s.totalSuccess += 1; s.totalRequests += 1; s.lastSuccessAt = now; s.lastUsedAt = now; s.intervalMs = Math.max(minIntervalMs, s.intervalMs - successDecayMs); }
    if (proxy && proxyHealth.has(proxy)) { const s = proxyHealth.get(proxy); s.totalSuccess += 1; s.totalRequests += 1; }
    globalIntervalMs = Math.max(minIntervalMs, globalIntervalMs - successDecayMs / 2);
  }
  function recordFailure(cookie, proxy, status, isAuth = false) {
    const now = Date.now();
    if (cookie && cookieHealth.has(cookie)) { const s = cookieHealth.get(cookie); s.fails += 1; s.consecutiveFails += 1; s.totalRequests += 1; s.lastFailAt = now; s.intervalMs = Math.min(maxIntervalMs, s.intervalMs * backoffMultiplier); if (isAuth || status === 401 || status === 403) { s.sidelineUntil = now + cookieSidelineMs; globalPausedUntil = now + authPauseMs; } else if (status === 429) { s.sidelineUntil = now + rateLimitPauseMs; } }
    if (proxy && proxyHealth.has(proxy)) { const s = proxyHealth.get(proxy); s.fails += 1; s.lastFailAt = now; s.sidelineUntil = now + rateLimitPauseMs; }
    globalIntervalMs = Math.min(maxIntervalMs, globalIntervalMs * backoffMultiplier);
    lastGlobalError = `Roblox ${status}`; lastGlobalStatus = status;
  }
  function turboHeaders(extra = {}, cookie = null) {
    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Accept": "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9", ...extra };
    if (cookie) headers.Cookie = `.ROBLOSECURITY=${cookie}`;
    return headers;
  }
  const globalLock = { waiting: [] };
  async function waitForTurboSlot(maxWaitMs = null) {
    const now = Date.now(); const waitUntil = Math.max(globalPausedUntil, rateLimitedUntil);
    if (waitUntil > now) { const delay = waitUntil - now; if (Number.isFinite(maxWaitMs) && delay > maxWaitMs) throw new Error(`Turbo pausado ${Math.ceil(delay / 1000)}s`); await new Promise(r => setTimeout(r, delay)); }
    while (activeCount >= maxConcurrentTotal) { await new Promise(r => globalLock.waiting.push(r)); }
    activeCount += 1;
    return { release: () => { activeCount = Math.max(0, activeCount - 1); if (globalLock.waiting.length) globalLock.waiting.shift()(); } };
  }

  async function turboFetch(url, options = {}, { maxAttempts: overrideAttempts } = {}) {
    const attempts = overrideAttempts || maxAttempts;
    const headers = { ...(options.headers || {}) };
    const method = options.method || "GET";
    const body = options.body;
    let lastText = "";
    let lastStatus = 0;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const slot = await waitForTurboSlot();
      try {
        const chosen = pickBestCookie();
        const cookie = chosen ? chosen.cookie : null;
        const proxyChoice = pickBestProxy();
        const proxy = proxyChoice ? proxyChoice.proxy : null;

        const reqHeaders = turboHeaders(headers, cookie);
        const fetchOpts = { method, headers: reqHeaders };
        if (body) fetchOpts.body = body;
        if (proxy) { const PA = getProxyAgent(); if (PA) { const agent = new PA(proxy); fetchOpts.dispatcher = agent; } }

        const res = await fetch(url, fetchOpts);
        lastText = await res.text().catch(() => "");
        lastStatus = res.status;

        if (res.ok || res.status < 400) { recordSuccess(cookie, proxy); slot.release(); return res; }

        if ((res.status === 401 || res.status === 403) && chosen) {
          recordFailure(cookie, proxy, res.status, true); slot.release();
          await new Promise(r => setTimeout(r, 300)); continue;
        }

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") || 0);
          const retryDelay = Math.min(retryAfter > 0 ? retryAfter * 1000 : initialRetryMs * (2 ** attempt), 60000);
          rateLimitedUntil = Date.now() + retryDelay;
          recordFailure(cookie, proxy, 429); slot.release();
          if (attempt < attempts - 1) { await new Promise(r => setTimeout(r, retryDelay)); continue; }
          throw new Error(`Roblox rate limit (429). Aguarde ${Math.ceil(retryDelay / 1000)}s. Último: ${lastText.slice(0, 200)}`);
        }

        recordFailure(cookie, proxy, res.status); slot.release();
        if (chosen && attempt < attempts - 1) { await new Promise(r => setTimeout(r, 500)); continue; }
        throw new Error(`Roblox request failed (${res.status}): ${lastText.slice(0, 300)}`);
      } catch (err) {
        slot.release();
        if (err && err.message && (err.message.includes("fetch") || err.message.includes("ECONN") || err.message.includes("timeout"))) {
          await new Promise(r => setTimeout(r, 800));
          if (attempt < attempts - 1) continue;
        }
        throw err;
      }
    }
    throw new Error(`Turbo esgotou ${attempts} tentativas. Último status ${lastStatus}: ${lastText.slice(0, 300)}`);
  }
  async function turboFetchJson(url, options = {}, opts2 = {}) {
    const res = await turboFetch(url, options, opts2);
    const text = await res.text();
    if (!res.ok) throw new Error(`Turbo JSON falhou (${res.status}): ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
  async function turboFetchBuffer(url, options = {}, opts2 = {}) {
    const res = await turboFetch(url, options, opts2);
    if (!res.ok) throw new Error(`Turbo buffer falhou (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  function enqueueTurboJob(job) {
    ensureDir();
    const id = crypto.randomBytes(8).toString("hex");
    const entry = { id, createdAt: Date.now(), status: "pending", tries: 0, ...job };
    requestQueue.pending.push(entry);
    saveQueue();
    return id;
  }
  function getTurboQueue() {
    return { pending: requestQueue.pending.length, processing: requestQueue.processing.length, done: requestQueue.done.length };
  }
  async function processTurboQueue(handler, { concurrency = maxConcurrentTotal } = {}) {
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (true) {
          let job = null;
          for (let i = 0; i < requestQueue.pending.length; i++) {
            const cand = requestQueue.pending[i];
            if (cand.status === "pending") {
              cand.status = "processing"; cand.tries += 1; cand.startedAt = Date.now();
              job = cand; requestQueue.processing.push(job); requestQueue.pending.splice(i, 1); saveQueue(); break;
            }
          }
          if (!job) { await new Promise(r => setTimeout(r, 2000)); continue; }
          try { await handler(job); job.status = "done"; job.finishedAt = Date.now(); requestQueue.done.push(job); if (requestQueue.done.length > 1000) requestQueue.done.shift(); } catch (err) { job.status = "failed"; job.error = err.message; job.failedAt = Date.now(); requestQueue.done.push(job); console.error(`[turbo] job ${job.id} falhou:`, err.message); }
          requestQueue.processing = requestQueue.processing.filter(j => j.id !== job.id); saveQueue();
        }
      })());
    }
    return workers;
  }
  function turboStatus() {
    const now = Date.now();
    const cookiesStats = [];
    for (const [cookie, state] of cookieHealth) {
      cookiesStats.push({ cookie: cookie.slice(0, 12) + "...", fails: state.fails, consecutiveFails: state.consecutiveFails, sideline: state.sidelineUntil > now ? Math.ceil((state.sidelineUntil - now) / 1000) + "s" : 0, intervalMs: state.intervalMs, successRate: state.totalRequests ? ((state.totalSuccess / state.totalRequests) * 100).toFixed(1) + "%" : "n/a", totalRequests: state.totalRequests, totalSuccess: state.totalSuccess });
    }
    const proxiesStats = [];
    for (const [proxy, state] of proxyHealth) { proxiesStats.push({ proxy, fails: state.fails, sideline: state.sidelineUntil > now ? Math.ceil((state.sidelineUntil - now) / 1000) + "s" : 0, successRate: state.totalRequests ? ((state.totalSuccess / state.totalRequests) * 100).toFixed(1) + "%" : "n/a" }); }
    return { cookiesConfigured: cookies.length, cookiesHealthy: cookiesStats.filter(c => !c.sideline).length, proxiesConfigured: proxies.length, globalIntervalMs, globalPaused: globalPausedUntil > now ? Math.ceil((globalPausedUntil - now) / 1000) + "s" : 0, rateLimited: rateLimitedUntil > now ? Math.ceil((rateLimitedUntil - now) / 1000) + "s" : 0, activeConcurrent: activeCount, maxConcurrent: maxConcurrentTotal, lastError: lastGlobalError, lastStatus: lastGlobalStatus, queue: getTurboQueue(), cookies: cookiesStats, proxies: proxiesStats };
  }
  function resetTurboPause() {
    globalPausedUntil = 0; rateLimitedUntil = 0; lastGlobalError = ""; lastGlobalStatus = 0;
    for (const [cookie, state] of cookieHealth) { state.sidelineUntil = 0; state.consecutiveFails = 0; state.intervalMs = baseIntervalMs; }
    saveHealth();
  }

  setInterval(() => { try { saveHealth(); } catch {} }, 60000).unref();

  return { cookies, proxies, turboHeaders, waitForTurboSlot, turboFetch, turboFetchJson, turboFetchBuffer, enqueueTurboJob, getTurboQueue, processTurboQueue, turboStatus, resetTurboPause, recordSuccess, recordFailure, pickBestCookie, baseIntervalMs, minIntervalMs, maxIntervalMs };
}

module.exports = { createTurboEngine, DATA_DIR };

