"use strict";

/**
 * Utilitários de data no fuso configurado, sem dependências externas.
 * Regra: tudo é armazenado em UTC; só a "visão" (limites de dia/semana/mês,
 * formatação) usa o fuso (padrão America/Sao_Paulo).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const formatterCache = new Map();

function partsFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    }));
  }
  return formatterCache.get(timeZone);
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Componentes de calendário de `date` no fuso. month é 1-12, weekday 0=domingo. */
function zonedParts(date, timeZone) {
  const result = {};
  for (const part of partsFormatter(timeZone).formatToParts(toDate(date))) {
    if (part.type === "weekday") result.weekday = WEEKDAYS[part.value];
    else if (part.type !== "literal") result[part.type] = Number(part.value);
  }
  if (result.hour === 24) result.hour = 0;
  return result;
}

/** Diferença (ms) entre o horário local do fuso e UTC naquele instante. */
function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const ms = toDate(date).getTime();
  return asUtc - (ms - (ms % 1000));
}

/** Converte um horário de parede no fuso para o instante UTC correspondente. */
function zonedTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let result = guess - offsetMs(new Date(guess), timeZone);
  // Segunda passada corrige casos perto de transições de horário de verão.
  const corrected = guess - offsetMs(new Date(result), timeZone);
  if (corrected !== result) result = corrected;
  return new Date(result);
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, 0, timeZone);
}

/** Soma dias de calendário (respeita o fuso, não 24h fixas). */
function addLocalDays(date, days, timeZone) {
  const p = zonedParts(date, timeZone);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), p.hour, p.minute, p.second, timeZone);
}

function startOfWeek(date, timeZone) {
  // Semana começa na segunda-feira.
  const p = zonedParts(date, timeZone);
  const diff = (p.weekday + 6) % 7;
  return startOfDay(addLocalDays(startOfDay(date, timeZone), -diff, timeZone), timeZone);
}

function startOfMonth(date, timeZone, monthOffset = 0) {
  const p = zonedParts(date, timeZone);
  const base = new Date(Date.UTC(p.year, p.month - 1 + monthOffset, 1));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, 1, 0, 0, 0, timeZone);
}

function startOfYear(date, timeZone, yearOffset = 0) {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year + yearOffset, 1, 1, 0, 0, 0, timeZone);
}

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

/** dd/mm/aaaa HH:mm */
function formatDateTime(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** dd/mm/aaaa */
function formatDate(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** dd/mm HH:mm (listas compactas) */
function formatShortDateTime(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${pad(p.day)}/${pad(p.month)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Chave AAAA-MM-DD do dia local. */
function dayKey(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Interpreta "dd/mm/aaaa" como o início desse dia no fuso. Retorna null se inválido. */
function parseLocalDate(text, timeZone) {
  const match = String(text || "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return null;
  const [day, month, year] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone);
}

/** Valida um identificador IANA de fuso. */
function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DAY_MS,
  zonedParts,
  zonedTimeToUtc,
  offsetMs,
  startOfDay,
  addLocalDays,
  startOfWeek,
  startOfMonth,
  startOfYear,
  formatDateTime,
  formatDate,
  formatShortDateTime,
  dayKey,
  parseLocalDate,
  isValidTimeZone,
  pad,
};
