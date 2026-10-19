"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePeriod, PeriodError } = require("../src/reports/periods");
const time = require("../src/time");
const { bucketize } = require("../src/reports/timeline");

const TZ = "America/Sao_Paulo"; // UTC-3 (sem horário de verão desde 2019)
const iso = date => date.toISOString();

test("fuso: virada do dia em São Paulo acontece às 03:00 UTC", () => {
  // 18/10 01:30 UTC = 17/10 22:30 em SP
  const lateNight = new Date("2026-10-18T01:30:00Z");
  assert.equal(time.dayKey(lateNight, TZ), "2026-10-17");
  assert.equal(iso(time.startOfDay(lateNight, TZ)), "2026-10-17T03:00:00.000Z");
  assert.equal(time.formatDateTime(lateNight, TZ), "17/10/2026 22:30");
  // 18/10 03:00 UTC = 18/10 00:00 SP
  assert.equal(time.dayKey(new Date("2026-10-18T03:00:00Z"), TZ), "2026-10-18");
});

test("fuso: horário de verão histórico (2018) é respeitado", () => {
  // Em 04/11/2018 SP adiantou o relógio: meia-noite não existiu; o dia começou 01:00 local = 03:00 UTC.
  const start = time.startOfDay(new Date("2018-11-05T12:00:00Z"), TZ);
  assert.equal(iso(start), "2018-11-05T02:00:00.000Z"); // UTC-2 durante o horário de verão
});

test("período hoje: de 00:00 SP até agora; anterior = ontem até o mesmo horário", () => {
  const now = new Date("2026-10-18T17:40:00Z"); // 14:40 SP
  const period = resolvePeriod("hoje", { now, timeZone: TZ });
  assert.equal(iso(period.start), "2026-10-18T03:00:00.000Z");
  assert.equal(iso(period.end), iso(now));
  assert.equal(iso(period.previous.start), "2026-10-17T03:00:00.000Z");
  assert.equal(iso(period.previous.end), "2026-10-17T17:40:00.000Z");
  assert.equal(period.description, "18/10/2026 → 18/10/2026 14:40");
});

test("período hoje logo após a meia-noite local (ainda dia anterior em UTC)", () => {
  const now = new Date("2026-10-19T02:30:00Z"); // 18/10 23:30 SP
  const period = resolvePeriod("hoje", { now, timeZone: TZ });
  assert.equal(iso(period.start), "2026-10-18T03:00:00.000Z");
});

test("janelas móveis 24h/7d/30d comparam com a janela anterior de mesma duração", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const p7 = resolvePeriod("7d", { now, timeZone: TZ });
  assert.equal(iso(p7.start), "2026-10-11T12:00:00.000Z");
  assert.equal(iso(p7.previous.start), "2026-10-04T12:00:00.000Z");
  assert.equal(iso(p7.previous.end), iso(p7.start));
  const p24 = resolvePeriod("24h", { now, timeZone: TZ });
  assert.equal(p24.end - p24.start, 86400000);
});

test("mês atual e mês passado com virada de mês no fuso", () => {
  // 01/11 01:00 UTC = 31/10 22:00 SP → ainda outubro
  const now = new Date("2026-11-01T01:00:00Z");
  const current = resolvePeriod("mes_atual", { now, timeZone: TZ });
  assert.equal(iso(current.start), "2026-10-01T03:00:00.000Z");
  const last = resolvePeriod("mes_passado", { now, timeZone: TZ });
  assert.equal(iso(last.start), "2026-09-01T03:00:00.000Z");
  assert.equal(iso(last.end), "2026-10-01T03:00:00.000Z");
  assert.equal(iso(last.previous.start), "2026-08-01T03:00:00.000Z");
  assert.equal(last.description, "01/09/2026 → 30/09/2026");
});

test("mês atual compara com o mesmo trecho do mês anterior, sem passar do fim dele", () => {
  const now = new Date("2026-03-31T15:00:00Z"); // 31/03 12:00 SP
  const period = resolvePeriod("mes_atual", { now, timeZone: TZ });
  // fevereiro tem 28 dias: o trecho equivalente é limitado ao fim de fevereiro
  assert.equal(iso(period.previous.start), "2026-02-01T03:00:00.000Z");
  assert.equal(iso(period.previous.end), "2026-03-01T03:00:00.000Z");
});

test("ano atual e tudo", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const year = resolvePeriod("ano", { now, timeZone: TZ });
  assert.equal(iso(year.start), "2026-01-01T03:00:00.000Z");
  assert.equal(iso(year.previous.start), "2025-01-01T03:00:00.000Z");
  const all = resolvePeriod("tudo", { now, timeZone: TZ, earliest: "2025-05-01T10:00:00Z" });
  assert.equal(all.start, null);
  assert.equal(all.previous, null);
  assert.match(all.description, /^01\/05\/2025 07:00 → /);
});

test("personalizado: fim inclusivo e validação de datas", () => {
  const period = resolvePeriod("personalizado", { timeZone: TZ, start: "01/10/2026", end: "15/10/2026", now: new Date("2026-10-18T12:00:00Z") });
  assert.equal(iso(period.start), "2026-10-01T03:00:00.000Z");
  assert.equal(iso(period.end), "2026-10-16T03:00:00.000Z");
  assert.equal(iso(period.previous.end), iso(period.start));
  assert.equal(period.description, "01/10/2026 → 15/10/2026");
  assert.throws(() => resolvePeriod("personalizado", { timeZone: TZ, start: "31/02/2026", end: "01/03/2026" }), PeriodError);
  assert.throws(() => resolvePeriod("personalizado", { timeZone: TZ, start: "10/10/2026", end: "01/10/2026" }), PeriodError);
  assert.throws(() => resolvePeriod("personalizado", { timeZone: TZ }), PeriodError);
});

test("semana começa na segunda 00:00 SP", () => {
  const sunday = new Date("2026-10-19T02:05:00Z"); // domingo 18/10 23:05 SP
  const week = resolvePeriod("semana", { now: sunday, timeZone: TZ });
  assert.equal(iso(week.start), "2026-10-12T03:00:00.000Z");
});

test("timeline: agrupa por dia local e preenche dias sem vendas", () => {
  const start = new Date("2026-10-15T03:00:00Z");
  const end = new Date("2026-10-18T03:00:00Z");
  const rows = [
    { createdAt: "2026-10-15T10:00:00Z", amount: 7 },
    { createdAt: "2026-10-16T02:59:00Z", amount: 3 }, // ainda 15/10 em SP
    { createdAt: "2026-10-17T20:00:00Z", amount: 10 },
  ];
  const { granularity, buckets } = bucketize(rows, start, end, TZ);
  assert.equal(granularity, "day");
  assert.deepEqual(buckets.map(b => [b.label, b.net, b.count]), [["15/10", 10, 2], ["16/10", 0, 0], ["17/10", 10, 1]]);
});

test("timeline: períodos longos viram semanas/meses", () => {
  const { granularity } = bucketize([], new Date("2026-01-01T03:00:00Z"), new Date("2026-10-01T03:00:00Z"), TZ);
  assert.equal(granularity, "week");
  const months = bucketize([{ createdAt: "2025-03-10T12:00:00Z", amount: 5 }], new Date("2024-01-01T03:00:00Z"), new Date("2026-01-01T03:00:00Z"), TZ);
  assert.equal(months.granularity, "month");
  assert.equal(months.buckets.length, 24);
  assert.equal(months.buckets.find(b => b.label === "mar/25").net, 5);
});
