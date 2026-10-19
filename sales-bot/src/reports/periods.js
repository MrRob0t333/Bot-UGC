"use strict";

/**
 * Resolve períodos nomeados em intervalos [start, end) UTC, calculados no fuso
 * configurado, junto com o "período anterior equivalente" para comparação.
 *
 *  - períodos "até agora" (hoje, mes_atual, ano): comparam com o mesmo trecho
 *    decorrido do período anterior (ex.: hoje até 14:40 vs ontem até 14:40);
 *  - janelas móveis (24h, 7d, 30d) e personalizado: a janela de mesma duração
 *    imediatamente anterior;
 *  - mes_passado: o mês anterior a ele, inteiro;
 *  - tudo: sem comparação.
 */

const {
  startOfDay,
  addLocalDays,
  startOfMonth,
  startOfYear,
  startOfWeek,
  parseLocalDate,
  formatDate,
  formatDateTime,
  DAY_MS,
} = require("../time");

const PERIOD_CHOICES = [
  { name: "Hoje", value: "hoje" },
  { name: "Últimas 24 horas", value: "24h" },
  { name: "Últimos 7 dias", value: "7d" },
  { name: "Últimos 30 dias", value: "30d" },
  { name: "Mês atual", value: "mes_atual" },
  { name: "Mês passado", value: "mes_passado" },
  { name: "Ano atual", value: "ano" },
  { name: "Tudo", value: "tudo" },
  { name: "Personalizado (início/fim)", value: "personalizado" },
];

const LABELS = Object.fromEntries(PERIOD_CHOICES.map(choice => [choice.value, choice.name]));
LABELS.semana = "Semana atual";
LABELS.personalizado = "Personalizado";

class PeriodError extends Error {}

function clampEnd(date, limit) {
  return date.getTime() > limit.getTime() ? limit : date;
}

/**
 * @param {string} key
 * @param {object} options { now, timeZone, start: "dd/mm/aaaa", end: "dd/mm/aaaa", earliest: Date }
 * @returns {{ key, label, start: Date|null, end: Date, previous: {start: Date, end: Date}|null, description: string }}
 */
function resolvePeriod(key, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const tz = options.timeZone || "America/Sao_Paulo";
  let start;
  let end = now;
  let previous = null;

  switch (key) {
    case "hoje": {
      start = startOfDay(now, tz);
      const prevStart = addLocalDays(start, -1, tz);
      previous = { start: prevStart, end: new Date(prevStart.getTime() + (now - start)) };
      previous.end = clampEnd(previous.end, start);
      break;
    }
    case "24h":
    case "7d":
    case "30d": {
      const hours = key === "24h" ? 24 : key === "7d" ? 7 * 24 : 30 * 24;
      start = new Date(now.getTime() - hours * 3600 * 1000);
      previous = { start: new Date(start.getTime() - hours * 3600 * 1000), end: start };
      break;
    }
    case "semana": {
      start = startOfWeek(now, tz);
      const prevStart = addLocalDays(start, -7, tz);
      previous = { start: prevStart, end: clampEnd(new Date(prevStart.getTime() + (now - start)), start) };
      break;
    }
    case "mes_atual": {
      start = startOfMonth(now, tz);
      const prevStart = startOfMonth(now, tz, -1);
      previous = { start: prevStart, end: clampEnd(new Date(prevStart.getTime() + (now - start)), start) };
      break;
    }
    case "mes_passado": {
      start = startOfMonth(now, tz, -1);
      end = startOfMonth(now, tz);
      previous = { start: startOfMonth(now, tz, -2), end: start };
      break;
    }
    case "ano": {
      start = startOfYear(now, tz);
      const prevStart = startOfYear(now, tz, -1);
      previous = { start: prevStart, end: clampEnd(new Date(prevStart.getTime() + (now - start)), start) };
      break;
    }
    case "tudo": {
      start = null;
      previous = null;
      break;
    }
    case "personalizado": {
      const startDate = parseLocalDate(options.start, tz);
      const endDate = parseLocalDate(options.end, tz);
      if (!options.start || !options.end) throw new PeriodError("Para o período personalizado, informe `inicio` e `fim` no formato dd/mm/aaaa.");
      if (!startDate) throw new PeriodError(`Data de início inválida: "${options.start}". Use dd/mm/aaaa.`);
      if (!endDate) throw new PeriodError(`Data de fim inválida: "${options.end}". Use dd/mm/aaaa.`);
      if (endDate.getTime() < startDate.getTime()) throw new PeriodError("A data de fim é anterior à de início.");
      start = startDate;
      end = addLocalDays(endDate, 1, tz); // fim inclusivo: até o fim do dia informado
      const duration = end - start;
      previous = { start: new Date(start.getTime() - duration), end: start };
      break;
    }
    default:
      throw new PeriodError(`Período desconhecido: ${key}`);
  }

  return {
    key,
    label: LABELS[key] || key,
    start,
    end,
    previous,
    description: describeRange(start, end, tz, options.earliest),
  };
}

function describeRange(start, end, tz, earliest) {
  const effectiveStart = start || (earliest ? new Date(earliest) : null);
  // Fim exclusivo à meia-noite = "até o fim do dia anterior".
  const endLabel = isMidnight(end, tz) ? formatDate(new Date(end.getTime() - 1), tz) : formatDateTime(end, tz);
  if (!effectiveStart) return `até ${endLabel}`;
  const startLabel = isMidnight(effectiveStart, tz) ? formatDate(effectiveStart, tz) : formatDateTime(effectiveStart, tz);
  return `${startLabel} → ${endLabel}`;
}

function isMidnight(date, tz) {
  return startOfDay(date, tz).getTime() === new Date(date).getTime();
}

/** Número de dias de calendário (aprox.) de um intervalo. */
function spanDays(start, end) {
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

module.exports = { resolvePeriod, PERIOD_CHOICES, LABELS, PeriodError, spanDays };
