"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHttpClient, RateLimiter, parseRetryAfter } = require("../src/roblox/http");
const { createCookieClient } = require("../src/roblox/cookieClient");
const { RobloxAuthError, RobloxPermissionError, RobloxError } = require("../src/roblox/errors");
const { clearSecrets } = require("../src/logger");

function response(status, body, headers = {}) {
  return {
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function scripted(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

const noSleep = { sleeps: [], fn: null };

function client(responses, extra = {}) {
  const { fetchImpl, calls } = scripted(responses);
  const sleeps = [];
  const http = createHttpClient({ fetchImpl, sleep: async ms => { sleeps.push(ms); }, random: () => 0.5, requestsPerMinute: 1000, ...extra });
  return { http, calls, sleeps };
}

test("http: retorna JSON em 200", async () => {
  const { http } = client([response(200, { ok: 1 })]);
  assert.deepEqual(await http.getJson("https://x.test/a"), { ok: 1 });
});

test("http: re-tenta 5xx com backoff exponencial e depois funciona", async () => {
  const { http, calls, sleeps } = client([response(503, "fora"), response(500, "erro"), response(200, { ok: 2 })]);
  assert.deepEqual(await http.getJson("https://x.test/a"), { ok: 2 });
  assert.equal(calls.length, 3);
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps[1] > sleeps[0], "backoff deve crescer");
});

test("http: 429 respeita Retry-After", async () => {
  const { http, sleeps } = client([response(429, "lento", { "retry-after": "7" }), response(200, { ok: 3 })]);
  await http.getJson("https://x.test/a");
  assert.deepEqual(sleeps, [7000]);
});

test("http: 401 vira RobloxAuthError sem re-tentar", async () => {
  const { http, calls } = client([response(401, { errors: [{ message: "Authorization has been denied" }] })]);
  await assert.rejects(http.getJson("https://x.test/a?cursor=abc"), error => {
    assert.ok(error instanceof RobloxAuthError);
    assert.equal(error.status, 401);
    assert.equal(error.url, "https://x.test/a");
    return true;
  });
  assert.equal(calls.length, 1);
});

test("http: 403 vira RobloxPermissionError", async () => {
  const { http } = client([response(403, { errors: [{ message: "Insufficient permissions" }] })]);
  await assert.rejects(http.getJson("https://x.test/a"), RobloxPermissionError);
});

test("http: 400 não é re-tentado", async () => {
  const { http, calls } = client([response(400, "cursor inválido")]);
  await assert.rejects(http.getJson("https://x.test/a"), error => error instanceof RobloxError && error.status === 400);
  assert.equal(calls.length, 1);
});

test("http: falha de rede re-tenta e esgota", async () => {
  const { http, calls } = client([new Error("ECONNRESET"), new Error("ECONNRESET"), new Error("ECONNRESET")], { maxRetries: 2 });
  await assert.rejects(http.getJson("https://x.test/a"), error => error.kind === "network");
  assert.equal(calls.length, 3);
});

test("http: timeout aborta a requisição", async () => {
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const http = createHttpClient({ fetchImpl, timeoutMs: 20, maxRetries: 0, sleep: async () => {} });
  await assert.rejects(http.getJson("https://x.test/a"), error => error.kind === "timeout");
});

test("http: limitador por minuto espera quando a janela enche", async () => {
  let now = 0;
  const waits = [];
  const limiter = new RateLimiter({ perMinute: 2, now: () => now, sleep: async ms => { waits.push(ms); now += ms; } });
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  assert.equal(waits.length, 1);
  assert.ok(waits[0] >= 60000);
});

test("http: espera do retry mantém o processo vivo (script não encerra no meio)", async () => {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const script = `
    const { createHttpClient } = require(${JSON.stringify(path.join(__dirname, "..", "src", "roblox", "http.js"))});
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      const status = calls === 1 ? 503 : 200;
      return { status, headers: { get: () => null }, text: async () => (status === 200 ? '{"ok":true}' : "fora") };
    };
    createHttpClient({ fetchImpl, baseDelayMs: 200, maxDelayMs: 400 })
      .getJson("https://x.test/a")
      .then(json => { console.log("TERMINOU", JSON.stringify(json)); process.exitCode = 7; });
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10000 });
  assert.match(result.stdout, /TERMINOU \{"ok":true\}/);
  assert.equal(result.status, 7, "o processo só pode sair depois do retry terminar");
});

test("http: Retry-After em data HTTP", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  assert.equal(parseRetryAfter("Sun, 18 Oct 2026 12:00:05 GMT", now), 5000);
  assert.equal(parseRetryAfter(null), null);
});

test("cookieClient: envia o cookie no cabeçalho e nunca o expõe em erros", async () => {
  clearSecrets();
  const cookie = "_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you|_ABCDEF1234567890SEGREDO";
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(init.headers.Cookie);
    return response(401, `{"errors":[{"message":"bad cookie ${cookie}"}]}`);
  };
  const roblox = createCookieClient({ cookie, fetchImpl, sleep: async () => {}, requestsPerMinute: 1000 });
  await assert.rejects(roblox.getSalesPage("111", null), error => {
    assert.ok(error instanceof RobloxAuthError);
    assert.ok(!error.message.includes("SEGREDO"), error.message);
    return true;
  });
  assert.equal(seen[0], `.ROBLOSECURITY=${cookie}`);
});

test("cookieClient: monta a URL de transações com cursor", async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    return response(200, { data: [], nextPageCursor: null });
  };
  const roblox = createCookieClient({ cookie: "_|WARNING:-DO-NOT-SHARE-THIS.x", fetchImpl, sleep: async () => {}, requestsPerMinute: 1000 });
  await roblox.getSalesPage("123", "cur/1");
  const url = new URL(urls[0]);
  assert.equal(url.pathname, "/v2/groups/123/transactions");
  assert.equal(url.searchParams.get("transactionType"), "Sale");
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(url.searchParams.get("cursor"), "cur/1");
});
