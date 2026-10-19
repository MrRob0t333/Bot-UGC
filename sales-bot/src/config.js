"use strict";

/**
 * Carrega e valida a configuração (.env + config/groups.json + config/item_prices.json).
 * Mensagens de erro em português e acionáveis. Nunca imprime valores secretos.
 */

const fs = require("fs");
const path = require("path");
const { isValidTimeZone } = require("./time");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OWNER_IDS = ["1108166595374751828", "433699177705504768"];

function loadDotenv() {
  try {
    // quiet: o dotenv 17 imprime dicas no console por padrão.
    require("dotenv").config({ path: path.join(ROOT_DIR, ".env"), quiet: true });
  } catch {
    // dotenv ausente (ex.: testes) — usa apenas process.env.
  }
}

function str(env, key, fallback = "") {
  const value = env[key];
  return value === undefined || value === null || String(value).trim() === "" ? fallback : String(value).trim();
}

function int(env, key, fallback, { min = -Infinity, max = Infinity } = {}, errors) {
  const raw = str(env, key, "");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${key} precisa ser um número inteiro entre ${min} e ${max} (recebido "${raw}").`);
    return fallback;
  }
  return value;
}

function parseTime(env, key, fallback, errors) {
  const raw = env[key] === undefined ? fallback : String(env[key]).trim();
  if (raw === "") return null; // desligado
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    errors.push(`${key} precisa estar no formato HH:MM (recebido "${raw}").`);
    return null;
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function snowflake(value) {
  return /^\d{15,21}$/.test(String(value || ""));
}

function parseIdList(raw) {
  return String(raw || "")
    .split(/[\s,;]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

/**
 * Valida a lista de grupos. Aceita split opcional (padrão: divisão igual entre os donos).
 * Retorna { groups, errors }.
 */
function validateGroups(input, ownerIds) {
  const errors = [];
  if (!Array.isArray(input)) {
    return { groups: [], errors: ["config/groups.json precisa ser uma lista (array) de grupos."] };
  }
  const seen = new Set();
  const groups = [];
  input.forEach((entry, index) => {
    const label = `grupo #${index + 1}`;
    const id = String(entry?.id ?? "").trim();
    if (!/^\d{1,20}$/.test(id)) {
      errors.push(`${label}: "id" precisa ser o ID numérico do grupo Roblox.`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`${label}: o grupo ${id} aparece duplicado.`);
      return;
    }
    seen.add(id);
    const name = String(entry?.name || "").trim() || `Grupo ${id}`;
    let split = entry?.split;
    if (split === undefined || split === null) {
      split = defaultSplit(ownerIds);
    }
    if (typeof split !== "object" || Array.isArray(split)) {
      errors.push(`${label} (${name}): "split" precisa ser um objeto { "idDiscord": porcentagem }.`);
      return;
    }
    const cleanSplit = {};
    let total = 0;
    for (const [userId, rawPercent] of Object.entries(split)) {
      const percent = Number(rawPercent);
      if (!snowflake(userId)) errors.push(`${label} (${name}): "${userId}" não parece um ID Discord.`);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        errors.push(`${label} (${name}): porcentagem inválida para ${userId}.`);
        continue;
      }
      cleanSplit[userId] = percent;
      total += percent;
    }
    if (Math.abs(total - 100) > 1e-9) {
      errors.push(`${label} (${name}): a divisão soma ${total}%, precisa somar 100%.`);
    }
    groups.push({ id, name, split: cleanSplit });
  });
  return { groups, errors };
}

function defaultSplit(ownerIds) {
  const owners = ownerIds.length ? ownerIds : DEFAULT_OWNER_IDS;
  const share = 100 / owners.length;
  return Object.fromEntries(owners.map(id => [id, share]));
}

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
  return JSON.parse(text);
}

function loadGroups(groupsPath, ownerIds) {
  if (!fs.existsSync(groupsPath)) {
    return {
      groups: [],
      errors: [`Arquivo ${path.relative(ROOT_DIR, groupsPath)} não encontrado. Copie config/groups.example.json e edite.`],
    };
  }
  try {
    return validateGroups(readJsonFile(groupsPath), ownerIds);
  } catch (error) {
    return { groups: [], errors: [`Não foi possível ler ${path.relative(ROOT_DIR, groupsPath)}: ${error.message}`] };
  }
}

function loadItemPrices(pricesPath) {
  if (!fs.existsSync(pricesPath)) return { prices: [], errors: [] };
  try {
    const data = readJsonFile(pricesPath);
    if (!Array.isArray(data)) return { prices: [], errors: ["config/item_prices.json precisa ser uma lista."] };
    const errors = [];
    const prices = [];
    data.forEach((entry, index) => {
      const itemId = String(entry?.itemId ?? entry?.id ?? "").trim();
      const price = Number(entry?.price);
      if (!/^\d+$/.test(itemId) || !Number.isFinite(price) || price < 0) {
        errors.push(`item_prices #${index + 1}: precisa de "itemId" numérico e "price" >= 0.`);
        return;
      }
      prices.push({ itemId, price: Math.round(price), name: String(entry?.name || "").trim() || null });
    });
    return { prices, errors };
  } catch (error) {
    return { prices: [], errors: [`Não foi possível ler config/item_prices.json: ${error.message}`] };
  }
}

/**
 * @param {object} options
 * @param {boolean} [options.requireDiscord=true]
 * @param {boolean} [options.requireRoblox=true]
 * @param {object} [options.env=process.env]
 */
function loadConfig(options = {}) {
  const { requireDiscord = true, requireRoblox = true, env = process.env, rootDir = ROOT_DIR } = options;
  const errors = [];
  const warnings = [];

  const ownerIds = parseIdList(str(env, "OWNER_IDS", DEFAULT_OWNER_IDS.join(",")));
  for (const id of ownerIds) if (!snowflake(id)) errors.push(`OWNER_IDS contém "${id}", que não parece um ID Discord.`);

  const timezone = str(env, "TIMEZONE", "America/Sao_Paulo");
  if (!isValidTimeZone(timezone)) errors.push(`TIMEZONE "${timezone}" não é um fuso IANA válido (ex.: America/Sao_Paulo).`);

  const discord = {
    token: str(env, "DISCORD_TOKEN"),
    clientId: str(env, "DISCORD_CLIENT_ID", str(env, "CLIENT_ID")),
    guildId: str(env, "GUILD_ID"),
    salesChannelId: str(env, "SALES_CHANNEL_ID"),
    summaryChannelId: str(env, "SUMMARY_CHANNEL_ID"),
    alertChannelId: str(env, "ALERT_CHANNEL_ID"),
  };
  if (!discord.summaryChannelId) discord.summaryChannelId = discord.salesChannelId;

  if (requireDiscord) {
    if (!discord.token) errors.push("DISCORD_TOKEN vazio: crie uma aplicação Discord própria para este bot e cole o token do bot.");
    if (!snowflake(discord.clientId)) errors.push("DISCORD_CLIENT_ID vazio ou inválido: é o Application ID da aplicação Discord.");
    if (!snowflake(discord.guildId)) errors.push("GUILD_ID vazio ou inválido: ID do servidor Discord onde os comandos aparecem.");
    if (!snowflake(discord.salesChannelId)) errors.push("SALES_CHANNEL_ID vazio ou inválido: canal dos avisos de venda.");
    if (discord.alertChannelId && !snowflake(discord.alertChannelId)) errors.push("ALERT_CHANNEL_ID inválido.");
    if (!discord.alertChannelId) warnings.push("ALERT_CHANNEL_ID vazio: alertas técnicos irão por DM aos donos.");
  }

  const roblox = {
    cookie: str(env, "ROBLOX_COOKIE").replace(/^\.ROBLOSECURITY=/i, "").replace(/^"|"$/g, ""),
    requestsPerMinute: int(env, "ROBLOX_REQUESTS_PER_MINUTE", 60, { min: 1, max: 600 }, errors),
    timeoutMs: int(env, "ROBLOX_TIMEOUT_MS", 15000, { min: 1000, max: 120000 }, errors),
  };
  if (requireRoblox && !roblox.cookie) {
    errors.push("ROBLOX_COOKIE vazio: cole o valor do cookie .ROBLOSECURITY da conta alternativa.");
  } else if (roblox.cookie && !roblox.cookie.startsWith("_|WARNING")) {
    warnings.push("ROBLOX_COOKIE não começa com \"_|WARNING:-DO-NOT-SHARE-THIS\" — confira se copiou o valor completo.");
  }

  const sync = {
    pollIntervalMinutes: int(env, "POLL_INTERVAL_MINUTES", 3, { min: 1, max: 1440 }, errors),
    pendingRecheckDays: int(env, "PENDING_RECHECK_DAYS", 10, { min: 1, max: 60 }, errors),
    backfillPageDelayMs: int(env, "BACKFILL_PAGE_DELAY_MS", 2000, { min: 0, max: 60000 }, errors),
    fundsSnapshotMinutes: int(env, "FUNDS_SNAPSHOT_MINUTES", 30, { min: 5, max: 1440 }, errors),
    backupKeep: int(env, "BACKUP_KEEP", 14, { min: 1, max: 365 }, errors),
    maxIncrementalPages: int(env, "MAX_INCREMENTAL_PAGES", 100, { min: 1, max: 10000 }, errors),
  };

  const schedules = {
    daily: parseTime(env, "DAILY_SUMMARY_TIME", "23:00", errors),
    weekly: parseTime(env, "WEEKLY_SUMMARY_TIME", "23:05", errors),
    weeklyDay: int(env, "WEEKLY_SUMMARY_DAY", 0, { min: 0, max: 6 }, errors),
    monthly: parseTime(env, "MONTHLY_SUMMARY_TIME", "09:00", errors),
    monthlyDay: int(env, "MONTHLY_SUMMARY_DAY", 1, { min: 1, max: 28 }, errors),
  };

  const dataDir = path.resolve(rootDir, str(env, "DATA_DIR", "data"));
  const groupsPath = path.join(rootDir, "config", "groups.json");
  const pricesPath = path.join(rootDir, "config", "item_prices.json");

  const groupResult = options.groups ? validateGroups(options.groups, ownerIds) : loadGroups(groupsPath, ownerIds);
  errors.push(...groupResult.errors);
  if (!groupResult.errors.length && !groupResult.groups.length) errors.push("Nenhum grupo configurado em config/groups.json.");

  const priceResult = loadItemPrices(pricesPath);
  errors.push(...priceResult.errors);

  return {
    errors,
    warnings,
    config: {
      rootDir,
      dataDir,
      dbPath: path.join(dataDir, "sales.db"),
      backupDir: path.join(dataDir, "backups"),
      lockPath: path.join(dataDir, "sales-bot.lock"),
      ownerIds,
      timezone,
      discord,
      roblox,
      sync,
      schedules,
      groups: groupResult.groups,
      itemPrices: priceResult.prices,
      logLevel: str(env, "LOG_LEVEL", "info"),
    },
  };
}

module.exports = { loadConfig, loadDotenv, validateGroups, parseIdList, defaultSplit, DEFAULT_OWNER_IDS, ROOT_DIR };
