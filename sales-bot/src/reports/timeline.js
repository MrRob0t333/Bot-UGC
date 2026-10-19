"use strict";

/**
 * Agrupa vendas em baldes de dia/semana/mês no fuso configurado,
 * preenchendo com zero os baldes sem vendas.
 */

const { startOfDay, startOfWeek, startOfMonth, addLocalDays, zonedParts, pad, DAY_MS } = require("../time");

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function chooseGranularity(start, end) {
  const days = (end - start) / DAY_MS;
  if (days <= 62) return "day";
  if (days <= 400) return "week";
  return "month";
}

function bucketStart(date, granularity, tz) {
  if (granularity === "month") return startOfMonth(date, tz);
  if (granularity === "week") return startOfWeek(date, tz);
  return startOfDay(date, tz);
}

function nextBucket(date, granularity, tz) {
  if (granularity === "month") return startOfMonth(date, tz, 1);
  return addLocalDays(date, granularity === "week" ? 7 : 1, tz);
}

function bucketLabel(date, granularity, tz) {
  const p = zonedParts(date, tz);
  if (granularity === "month") return `${MONTHS[p.month - 1]}/${String(p.year).slice(2)}`;
  return `${pad(p.day)}/${pad(p.month)}`;
}

/**
 * @param {{createdAt: string, amount: number}[]} rows
 * @param {Date} start
 * @param {Date} end exclusivo
 */
function bucketize(rows, start, end, tz, granularity = chooseGranularity(start, end)) {
  const buckets = [];
  const index = new Map();
  let cursor = bucketStart(start, granularity, tz);
  let guard = 0;
  while (cursor.getTime() < end.getTime() && guard < 5000) {
    const bucket = { start: cursor, label: bucketLabel(cursor, granularity, tz), net: 0, count: 0 };
    index.set(cursor.getTime(), bucket);
    buckets.push(bucket);
    cursor = nextBucket(cursor, granularity, tz);
    guard += 1;
  }
  for (const row of rows) {
    const key = bucketStart(new Date(row.createdAt), granularity, tz).getTime();
    const bucket = index.get(key);
    if (!bucket) continue;
    bucket.net += Number(row.amount) || 0;
    bucket.count += 1;
  }
  return { granularity, buckets };
}

module.exports = { bucketize, chooseGranularity, MONTHS };
