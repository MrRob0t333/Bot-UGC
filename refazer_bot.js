require("dotenv").config();

console.log("Iniciando bot laboratorio /refazer...");

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const zlib = require("zlib");
const { execFile, execFileSync } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");

const LIGHT_POWER_CHOICES = [
  { name: "0.20 - very soft", value: 0.2 },
  { name: "0.50 - soft", value: 0.5 },
  { name: "1.00 - normal", value: 1 },
  { name: "2.00 - bright", value: 2 },
  { name: "3.00 - maximum", value: 3 },
];

function addLightPowerChoices(option) {
  return option.addChoices(...LIGHT_POWER_CHOICES);
}

function cleanEnv(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function parseIdListEnv(value) {
  return String(value || "")
    .split(/[,\s;]+/)
    .map(item => cleanEnv(item))
    .filter(Boolean);
}

function normalizeTripoApiBase(value) {
  const base = cleanEnv(value, "https://api.tripo3d.ai/v2/openapi").replace(/\/+$/, "");

  if (/^https:\/\/openapi\.tripo3d\.ai\/v3$/i.test(base)) {
    return "https://api.tripo3d.ai/v2/openapi";
  }

  return base;
}

const TOKEN = cleanEnv(process.env.REFAZER_DISCORD_TOKEN || process.env.DISCORD_TOKEN);
const CLIENT_ID = cleanEnv(process.env.REFAZER_CLIENT_ID || process.env.CLIENT_ID);
const GUILD_ID = cleanEnv(process.env.REFAZER_GUILD_ID || process.env.GUILD_ID);
const ROBLOSECURITY = cleanEnv(process.env.ROBLOSECURITY);
const ROBLOX_COOKIES = [
  ROBLOSECURITY,
  cleanEnv(process.env.ROBLOSECURITY_2 || process.env.REFAZER_ROBLOSECURITY_2),
  cleanEnv(process.env.ROBLOSECURITY_3 || process.env.REFAZER_ROBLOSECURITY_3),
  ...String(process.env.REFAZER_ROBLOSECURITY_POOL || "")
    .split(/\n|,(?=_\|WARNING:)|,(?=_\|)/)
    .map(item => cleanEnv(item)),
].filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 3);

const PREMIUM_ROLE = cleanEnv(process.env.REFAZER_PREMIUM_ROLE, "1521989120745013459");
const ELITE_ROLE = cleanEnv(process.env.REFAZER_ELITE_ROLE, "1523463473328292013");
const PREMIUM_LIFETIME_ROLE = cleanEnv(process.env.REFAZER_PREMIUM_LIFETIME_ROLE, "1524638659679092766");
const ELITE_LIFETIME_ROLE = cleanEnv(process.env.REFAZER_ELITE_LIFETIME_ROLE, "1524638763899420753");
const NORMAL_ROLE = cleanEnv(process.env.REFAZER_NORMAL_ROLE, "1521959526394237089");
const FREE_ROLE = cleanEnv(process.env.REFAZER_FREE_ROLE, "1523104972068356187");
const ADMIN_ROLE = cleanEnv(process.env.REFAZER_ADMIN_ROLE, "1522293475801038868");
const AFFILIATE_ROLE = cleanEnv(process.env.REFAZER_AFFILIATE_ROLE, "1523108378346520607");
const COMMAND_CHANNEL_IDS = new Set(parseIdListEnv(process.env.REFAZER_COMMAND_CHANNELS || process.env.REFAZER_ALLOWED_COMMAND_CHANNELS));
const CLEAN_CHANNEL_IDS = new Set(parseIdListEnv(process.env.REFAZER_CLEAN_CHANNELS || process.env.REFAZER_DELETE_USER_MESSAGES_CHANNELS));
const COMMAND_CHANNEL_ADMIN_BYPASS = cleanEnv(process.env.REFAZER_COMMAND_CHANNEL_ADMIN_BYPASS, "true") !== "false";

const BLENDER_PATH =
  cleanEnv(process.env.BLENDER_PATH) ||
  "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe";
const PYTHON_PATH = cleanEnv(process.env.PYTHON_PATH || process.env.REFAZER_PYTHON_PATH, "python");
const CLOTHING_RESET_TEMPLATE_PATH = path.join(__dirname, "assets", "clothing_reset_template.png");

const NANO_BANANA_PRO_ENDPOINT = cleanEnv(process.env.NANO_BANANA_PRO_ENDPOINT);
const NANO_BANANA_PRO_API_KEY = cleanEnv(process.env.NANO_BANANA_PRO_API_KEY);
const GEMINI_API_KEY = cleanEnv(process.env.GEMINI_API_KEY);
const GEMINI_API_BASE = cleanEnv(process.env.GEMINI_API_BASE, "https://generativelanguage.googleapis.com/v1beta");
const OPENAI_API_KEY = cleanEnv(process.env.OPENAI_API_KEY);
const OPENAI_IMAGE_MODEL = cleanEnv(process.env.OPENAI_IMAGE_MODEL, "gpt-image-1-mini");
const OPENAI_IMAGE_QUALITY = cleanEnv(process.env.OPENAI_IMAGE_QUALITY, "high");
const OPENAI_IMAGE_SIZE = cleanEnv(process.env.OPENAI_IMAGE_SIZE, "1024x1024");
const TRIPO_AI_ENDPOINT = cleanEnv(process.env.TRIPO_AI_ENDPOINT);
const TRIPO_AI_API_KEY = cleanEnv(process.env.TRIPO_AI_API_KEY);
const TRIPO_API_KEY = cleanEnv(process.env.TRIPO_API_KEY || TRIPO_AI_API_KEY);
const RAW_TRIPO_API_BASE = cleanEnv(process.env.TRIPO_API_BASE, "https://api.tripo3d.ai/v2/openapi");
const TRIPO_API_BASE = normalizeTripoApiBase(RAW_TRIPO_API_BASE);
const TRIPO_MODEL_VERSION = cleanEnv(process.env.TRIPO_MODEL_VERSION, "v3.1-20260211");
const TRIPO_GEOMETRY_QUALITY = cleanEnv(process.env.TRIPO_GEOMETRY_QUALITY, "detailed");
const TRIPO_SMART_LOW_POLY = cleanEnv(process.env.TRIPO_SMART_LOW_POLY, "false") === "true";
const TRIPO_QUAD = cleanEnv(process.env.TRIPO_QUAD, "false") === "true";
const HYPER3D_API_KEY = cleanEnv(process.env.HYPER3D_API_KEY || process.env.RODIN_API_KEY);
const HYPER3D_API_BASE = cleanEnv(process.env.HYPER3D_API_BASE, "https://api.hyper3d.com/api/v2").replace(/\/+$/, "");
const HYPER3D_TIER = cleanEnv(process.env.HYPER3D_TIER, "Gen-2.5-Medium");
const HYPER3D_QUALITY = cleanEnv(process.env.HYPER3D_QUALITY, "medium");
const HYPER3D_MESH_MODE = cleanEnv(process.env.HYPER3D_MESH_MODE, "Raw");
const HYPER3D_MATERIAL = cleanEnv(process.env.HYPER3D_MATERIAL, "Shaded");
const HYPER3D_HIGH_PACK = cleanEnv(process.env.HYPER3D_HIGH_PACK, "false") === "true";
const HYPER3D_PREVIEW_RENDER = cleanEnv(process.env.HYPER3D_PREVIEW_RENDER, "false") === "true";
const HYPER3D_TEXTURE_MODE = cleanEnv(process.env.HYPER3D_TEXTURE_MODE, "medium");
const HYPER3D_GEOMETRY_INSTRUCT_MODE = cleanEnv(process.env.HYPER3D_GEOMETRY_INSTRUCT_MODE);
const HYPER3D_TEXTURE_DELIGHT = cleanEnv(process.env.HYPER3D_TEXTURE_DELIGHT, "false") === "true";
const HYPER3D_USE_ORIGINAL_ALPHA = cleanEnv(process.env.HYPER3D_USE_ORIGINAL_ALPHA, "false") === "true";
const HYPER3D_USE_QUALITY_OVERRIDE = cleanEnv(process.env.HYPER3D_USE_QUALITY_OVERRIDE, "false") === "true";
const HYPER3D_SITE_LIKE_MODE = cleanEnv(process.env.HYPER3D_SITE_LIKE_MODE, "true") !== "false";
const MODEL_PROVIDER = cleanEnv(process.env.MODEL_PROVIDER, "auto").toLowerCase();
const MODEL_DELIVERY_MODE = cleanEnv(process.env.REFAZER_MODEL_DELIVERY_MODE, "channel").toLowerCase();
const PAYMENT_PROVIDER = cleanEnv(process.env.PAYMENT_PROVIDER, "stripe").toLowerCase();
const MERCADO_PAGO_ACCESS_TOKEN = cleanEnv(process.env.MERCADO_PAGO_ACCESS_TOKEN);
const MERCADO_PAGO_PUBLIC_KEY = cleanEnv(process.env.MERCADO_PAGO_PUBLIC_KEY);
const MERCADO_PAGO_WEBHOOK_URL = cleanEnv(process.env.MERCADO_PAGO_WEBHOOK_URL);
const MERCADO_PAGO_WEBHOOK_SECRET = cleanEnv(process.env.MERCADO_PAGO_WEBHOOK_SECRET);
const MERCADO_PAGO_SUCCESS_URL = cleanEnv(process.env.MERCADO_PAGO_SUCCESS_URL, "https://discord.com");
const MERCADO_PAGO_FAILURE_URL = cleanEnv(process.env.MERCADO_PAGO_FAILURE_URL, "https://discord.com");
const MERCADO_PAGO_PENDING_URL = cleanEnv(process.env.MERCADO_PAGO_PENDING_URL, "https://discord.com");
const STRIPE_SECRET_KEY = cleanEnv(process.env.STRIPE_SECRET_KEY);
const STRIPE_WEBHOOK_SECRET = cleanEnv(process.env.STRIPE_WEBHOOK_SECRET);
const STRIPE_WEBHOOK_URL = cleanEnv(process.env.STRIPE_WEBHOOK_URL);
const STRIPE_SUCCESS_URL = cleanEnv(process.env.STRIPE_SUCCESS_URL, "https://discord.com");
const STRIPE_CANCEL_URL = cleanEnv(process.env.STRIPE_CANCEL_URL, "https://discord.com");
const WEBHOOK_HOST = cleanEnv(process.env.WEBHOOK_HOST, "0.0.0.0");
const WEBHOOK_PORT = Number(cleanEnv(process.env.WEBHOOK_PORT, "3001"));
const REFAZER_MOCK_IA = process.env.REFAZER_MOCK_IA === "true";
const VIEW_CACHE_DIR = path.join(__dirname, "cache", "views");
const VIEW_CACHE_MAX_AGE_MS = Number(process.env.REFAZER_VIEW_CACHE_DAYS || 14) * 24 * 60 * 60 * 1000;
const ROBLOX_MAX_TEXTURE_SIZE = Number(process.env.REFAZER_ROBLOX_MAX_TEXTURE_SIZE || 2048);
const DISCORD_SAFE_ATTACHMENT_MB = Number(cleanEnv(process.env.REFAZER_DISCORD_MAX_ATTACHMENT_MB, "50"));
const DISCORD_MAX_ATTACHMENT_BYTES =
  Math.max(1, Number.isFinite(DISCORD_SAFE_ATTACHMENT_MB) ? DISCORD_SAFE_ATTACHMENT_MB : 50) * 1024 * 1024;
const ROBLOX_MIN_TRIANGLE_LIMIT = 500;
const ROBLOX_SAFE_TRIANGLE_LIMIT = Number(process.env.REFAZER_DEFAULT_TRIANGLES || 3900);
const ROBLOX_MAX_TRIANGLE_LIMIT = 3950;
const GUIDED_THREAD_FREE_CLOSE_HOURS = Number(process.env.REFAZER_GUIDED_THREAD_FREE_CLOSE_HOURS || 24);
const GUIDED_THREAD_PREMIUM_CLOSE_HOURS = Number(process.env.REFAZER_GUIDED_THREAD_PREMIUM_CLOSE_HOURS || 168);
const GUIDED_THREAD_ELITE_CLOSE_HOURS = Number(process.env.REFAZER_GUIDED_THREAD_ELITE_CLOSE_HOURS || 336);

const DEFAULT_RENDER_SETTINGS = {
  lighting: "flat",
  pov: "normal",
  ior: 1,
  roughness: 1,
  exposure: 0.15,
  lightPower: 1,
};
const VIEW_RENDER_CACHE_VERSION = "ai-flat-reference-v4";
const RAW_DEFAULT_TEXTURE_TONE = cleanEnv(process.env.REFAZER_DEFAULT_TEXTURE_TONE, "normal").toLowerCase();
const TEXTURE_TONES = {
  normal: {
    label: "Roblox Safe",
    value: 1,
    saturation: 1,
    gamma: 1,
  },
  brighter: {
    label: "Brighter",
    value: 1.16,
    saturation: 1.04,
    gamma: 0.92,
  },
  vibrant: {
    label: "Vibrant",
    value: 1.2,
    saturation: 1.12,
    gamma: 0.9,
  },
};
const DEFAULT_TEXTURE_TONE = TEXTURE_TONES[RAW_DEFAULT_TEXTURE_TONE] ? RAW_DEFAULT_TEXTURE_TONE : "normal";
const DEFAULT_TEXTURE_ADJUSTMENTS = {
  saturation: 1,
  value: 1,
};

const COOLDOWN_MS = 10000;
const cooldowns = new Map();
const inviteUses = new Map();
const pendingMultiviewActions = new Map();
const WALLET_TOKENS_PER_BRL = 1000 / 30;
const AI_MODEL_LAUNCH_PROMO_ENABLED = cleanEnv(process.env.REFAZER_AI_MODEL_PROMO_ENABLED, "true") !== "false";
const AI_MODEL_LAUNCH_PROMO_FIRST_LIMIT = Number(process.env.REFAZER_AI_MODEL_PROMO_FIRST_LIMIT || 3);
const AI_MODEL_LAUNCH_PROMO_FIRST_PRICE_BRL = Number(process.env.REFAZER_AI_MODEL_PROMO_FIRST_PRICE_BRL || 15);
const AI_MODEL_LAUNCH_PROMO_REGULAR_PRICE_BRL = Number(process.env.REFAZER_AI_MODEL_PROMO_REGULAR_PRICE_BRL || 20);
const AI_MODEL_LAUNCH_PROMO_DISCOUNT_ROLE = cleanEnv(process.env.REFAZER_AI_MODEL_PROMO_DISCOUNT_ROLE, "1529274490289258608");
const AI_MODEL_LAUNCH_PROMO_ROLE_PRICE_BRL = Number(process.env.REFAZER_AI_MODEL_PROMO_ROLE_PRICE_BRL || 16);
const AI_MODEL_INCLUDED_REFERENCE_ROUNDS = Number(process.env.REFAZER_AI_MODEL_INCLUDED_REFERENCE_ROUNDS || 1);
const AI_MODEL_EXTRA_REFERENCE_REGEN_BRL = Number(process.env.REFAZER_AI_MODEL_EXTRA_REFERENCE_REGEN_BRL || 1);

const MODEL_QUALITY_CONFIG = {
  medium: {
    label: "Standard",
    hyper3dQuality: "medium",
    priceExtraBrl: 0,
  },
  high: {
    label: "Sharper Details",
    hyper3dQuality: "high",
    priceExtraBrl: Number(process.env.REFAZER_MODEL_QUALITY_HIGH_EXTRA_BRL || 1),
  },
  ultra: {
    label: "Max Detail",
    hyper3dQuality: cleanEnv(process.env.HYPER3D_ULTRA_QUALITY_VALUE || "high"),
    priceExtraBrl: Number(process.env.REFAZER_MODEL_QUALITY_ULTRA_EXTRA_BRL || 2),
  },
};

const ADVANCED_TEXTURE_CONFIG = {
  none: {
    label: "Off",
    resolution: null,
    priceExtraBrl: 0,
  },
  basic: {
    label: "Advanced Texture Basic",
    resolution: "Basic",
    priceExtraBrl: Number(process.env.REFAZER_ADVANCED_TEXTURE_BASIC_EXTRA_BRL || 3),
  },
  high: {
    label: "Advanced Texture High",
    resolution: "High",
    priceExtraBrl: Number(process.env.REFAZER_ADVANCED_TEXTURE_HIGH_EXTRA_BRL || 5),
  },
};

const PRICE_CONFIG = {
  baseFree: 30,
  baseBasic: 25,
  basePremium: 20,
  baseElite: 20,
  copyFreeOverLimit: 2,
  copyBasicOverLimit: 1,
  multiviewExtra: 7,
  basicMultiviewExtra: 5,
  premiumMultiviewExtra: 0,
  eliteMultiviewExtra: 0,
  noTextureDiscount: 2,
  lowPolyExtra: 3,
  basicLowPolyExtra: 0,
  premiumLowPolyExtra: 0,
  eliteLowPolyExtra: 0,
  maxTriangles: 3950,
};

const API_COST_ESTIMATE_BRL = {
  minProfit: Number(process.env.REFAZER_MIN_PROFIT_BRL || 10),
  modelStandard: Number(process.env.REFAZER_API_COST_MODEL_STANDARD_BRL || 7),
  modelNoTexture: Number(process.env.REFAZER_API_COST_MODEL_NO_TEXTURE_BRL || 6),
  multiviewExtra: Number(process.env.REFAZER_API_COST_MULTIVIEW_EXTRA_BRL || 2),
  lowPolyExtra: Number(process.env.REFAZER_API_COST_LOWPOLY_EXTRA_BRL || 1),
};

const COPY_PLAN_CONFIG = {
  free: {
    label: "Free",
    dailyLimit: 3,
    overLimitPrice: PRICE_CONFIG.copyFreeOverLimit,
  },
  basic: {
    label: "Basic",
    dailyLimit: 10,
    overLimitPrice: PRICE_CONFIG.copyBasicOverLimit,
  },
  premium: {
    label: "Premium",
    dailyLimit: null,
    overLimitPrice: 0,
  },
  elite: {
    label: "Elite",
    dailyLimit: null,
    overLimitPrice: 0,
  },
};

const CLOTHING_COPY_PLAN_CONFIG = {
  free: {
    label: "Free",
    dailyLimit: Number(process.env.REFAZER_FREE_CLOTHING_DAILY_LIMIT || 6),
    overLimitTokens: Number(process.env.REFAZER_FREE_CLOTHING_PRICE || 10),
  },
  basic: {
    label: "Basic",
    dailyLimit: Number(process.env.REFAZER_BASIC_CLOTHING_DAILY_LIMIT || 20),
    overLimitTokens: Number(process.env.REFAZER_BASIC_CLOTHING_PRICE || 5),
  },
  premium: {
    label: "Premium",
    dailyLimit: null,
    overLimitTokens: 0,
  },
  elite: {
    label: "Elite",
    dailyLimit: null,
    overLimitTokens: 0,
  },
};

const SNIPER_PLAN_CONFIG = {
  free: {
    label: "No subscription",
    dailyLimit: Number(process.env.REFAZER_FREE_SNIPER_DAILY_LIMIT || 1),
    walletAmount: Math.ceil(Number(process.env.REFAZER_FREE_SNIPER_PRICE_BRL || 50) * WALLET_TOKENS_PER_BRL),
  },
  basic: {
    label: "Basic",
    dailyLimit: Number(process.env.REFAZER_BASIC_SNIPER_DAILY_LIMIT || 1),
    walletAmount: Math.ceil(Number(process.env.REFAZER_BASIC_SNIPER_PRICE_BRL || 35) * WALLET_TOKENS_PER_BRL),
  },
  premium: {
    label: "Premium",
    dailyLimit: Number(process.env.REFAZER_PREMIUM_SNIPER_DAILY_LIMIT || 2),
    walletAmount: Math.ceil(Number(process.env.REFAZER_PREMIUM_SNIPER_PRICE_BRL || 20) * WALLET_TOKENS_PER_BRL),
  },
  elite: {
    label: "Elite",
    dailyLimit: Number(process.env.REFAZER_ELITE_SNIPER_DAILY_LIMIT || 3),
    walletAmount: Math.ceil(Number(process.env.REFAZER_ELITE_SNIPER_PRICE_BRL || 10) * WALLET_TOKENS_PER_BRL),
  },
};

const BULK_ITEM_DELAY_MS = Number(process.env.REFAZER_BULK_ITEM_DELAY_MS || 3000);
const BULK_ASSET_LIMIT = Number(process.env.REFAZER_BULK_ASSET_LIMIT || 15);
const FREE_BULK_ASSET_LIMIT = Number(process.env.REFAZER_FREE_BULK_ASSET_LIMIT || 3);
const BASIC_BULK_ASSET_LIMIT = Number(process.env.REFAZER_BASIC_BULK_ASSET_LIMIT || 7);
const PREMIUM_BULK_ASSET_LIMIT = Number(process.env.REFAZER_PREMIUM_BULK_ASSET_LIMIT || 15);
const ELITE_BULK_ASSET_LIMIT = Number(process.env.REFAZER_ELITE_BULK_ASSET_LIMIT || 15);
const BULK_CLOTHING_LIMIT = Number(process.env.REFAZER_BULK_CLOTHING_LIMIT || 15);
const FREE_BULK_CLOTHING_LIMIT = Number(process.env.REFAZER_FREE_BULK_CLOTHING_LIMIT || 5);
const BASIC_BULK_CLOTHING_LIMIT = Number(process.env.REFAZER_BASIC_BULK_CLOTHING_LIMIT || 10);
const PREMIUM_BULK_CLOTHING_LIMIT = Number(process.env.REFAZER_PREMIUM_BULK_CLOTHING_LIMIT || 15);
const ELITE_BULK_CLOTHING_LIMIT = Number(process.env.REFAZER_ELITE_BULK_CLOTHING_LIMIT || 15);

const IMAGE_ENHANCEMENTS = {
  none: {
    label: "No enhancement",
    model: null,
    priceExtra: 0,
    estimatedCostBrl: 0,
  },
  economy: {
    label: "Clean local enhancement",
    model: null,
    priceExtra: 3,
    estimatedCostBrl: 0,
  },
  ai: {
    label: "AI reference enhancement",
    model: "openai-image",
    priceExtra: Number(process.env.REFAZER_GUIDED_AI_ENHANCE_EXTRA_BRL || 0),
    estimatedCostBrl: Number(process.env.REFAZER_API_COST_ENHANCEMENT_AI_BRL || 1),
  },
  standard: {
    label: "Standard",
    model: "gemini-3.1-flash-image",
    priceExtra: 5,
    estimatedCostBrl: Number(process.env.REFAZER_API_COST_ENHANCEMENT_STANDARD_BRL || 2),
  },
  premium: {
    label: "Premium",
    model: "gemini-3-pro-image",
    priceExtra: 9,
    estimatedCostBrl: Number(process.env.REFAZER_API_COST_ENHANCEMENT_PREMIUM_BRL || 5),
  },
};

const IMAGE_RESOLUTIONS = {
  "1K": {
    label: "1K",
    priceExtra: 0,
  },
  "2K": {
    label: "2K",
    priceExtra: 2,
  },
  "4K": {
    label: "4K",
    priceExtra: 4,
  },
};

const IMAGE_ASPECT_RATIOS = new Set(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]);
const LOCAL_IMAGE_CLEANUP_PRICE_BRL = Number(process.env.REFAZER_LOCAL_IMAGE_CLEANUP_PRICE_BRL || 0.5);
const WALLET_TOKEN_NAME = "Service Credits";
const WALLET_MIN_PURCHASE = Number(process.env.REFAZER_WALLET_MIN_PURCHASE || 300);
const GIFT_CODE_DEFAULT_EXPIRATION_DAYS = Number(process.env.REFAZER_GIFT_CODE_DEFAULT_EXPIRATION_DAYS || 7);
const GIFT_CODE_MAX_EXPIRATION_DAYS = Number(process.env.REFAZER_GIFT_CODE_MAX_EXPIRATION_DAYS || 30);
const PURCHASE_EXPIRATION_MINUTES = Number(process.env.REFAZER_PURCHASE_EXPIRATION_MINUTES || 30);
const PURCHASE_EXPIRATION_MS = PURCHASE_EXPIRATION_MINUTES > 0
  ? PURCHASE_EXPIRATION_MINUTES * 60 * 1000
  : 0;
const SERVICE_CREDITS_NOTE = "Service Credits are non-withdrawable, non-resellable and redeemable only for Velvet digital services. Gift codes, when available, are recipient-restricted and cannot be exchanged for cash, Robux or external value.";
const VELVET_EMOJIS = {
  shield: "<:escudo:1524645193817788516>",
  coin: "<a:token:1524645150788157440>",
  cart: "<:carrinho:1524645099773100073>",
  alert: "<:alerta:1524644993673990194>",
  bot: "<:bot:1524645071654355054>",
  star: "<:estrela:1524645031049302116>",
};
const DISABLED_STORED_VALUE_COMMANDS = new Set([
  "affiliate_withdraw",
  "velvet_transferir",
  "velvet_sacar",
  "velvet_admin_saques",
  "velvet_admin_saque",
  "admin_withdrawals",
  "admin_withdrawal",
]);
const IMAGE_GENERATION_PRICE_BRL = Number(process.env.REFAZER_IMAGE_GENERATION_PRICE_BRL || 1);
const IMAGE_GENERATION_PRICE = Number(
  process.env.REFAZER_IMAGE_GENERATION_PRICE || brlToWalletTokens(IMAGE_GENERATION_PRICE_BRL)
);
const PROMPT_MODEL_PRICE = Number(process.env.REFAZER_PROMPT_MODEL_PRICE || 1100);
const SERVICE_CREDIT_SCOPES = {
  all: "All services",
  copy: "UGC copy",
  clothing: "Clothing copy",
  remake: "AI remake",
  multiview: "Multiview model",
  image_model: "Single image model",
  prompt_model: "Prompt model",
  image: "Image generation",
  enhancement: "Reference cleanup",
  sniper: "Market sniper",
};
const AFFILIATE_WALLET_PURCHASE_RATE = Number(process.env.REFAZER_AFFILIATE_WALLET_RATE || 0.10);
const AFFILIATE_SERVICE_RATE = Number(process.env.REFAZER_AFFILIATE_SERVICE_RATE || 0.05);
const AFFILIATE_SUBSCRIPTION_RATE = Number(process.env.REFAZER_AFFILIATE_SUBSCRIPTION_RATE || 0.20);
const AFFILIATE_SUBSCRIPTION_BOOST_RATE = Number(process.env.REFAZER_AFFILIATE_SUBSCRIPTION_BOOST_RATE || 0.50);
const AFFILIATE_SUBSCRIPTION_BOOST_CLIENTS = Number(process.env.REFAZER_AFFILIATE_SUBSCRIPTION_BOOST_CLIENTS || 100);
const AFFILIATE_WITHDRAW_MIN = 1000;
const SUBSCRIPTION_PLANS = {
  basic: {
    label: "Basic",
    brl: 104.5,
    roleId: NORMAL_ROLE,
  },
  premium: {
    label: "Premium",
    brl: 214.5,
    roleId: PREMIUM_ROLE,
  },
  elite: {
    label: "Elite",
    brl: 379.5,
    roleId: ELITE_ROLE,
  },
  premium_lifetime: {
    label: "Premium Lifetime",
    brl: 1644.5,
    roleId: PREMIUM_LIFETIME_ROLE,
    lifetime: true,
  },
  elite_lifetime: {
    label: "Elite Lifetime",
    brl: 3294.5,
    roleId: ELITE_LIFETIME_ROLE,
    lifetime: true,
  },
};
const PREPAID_SUBSCRIPTION_DAYS = Number(process.env.REFAZER_PREPAID_SUBSCRIPTION_DAYS || 30);
const DEFAULT_CURRENCY = "USD";
const DEFAULT_LANGUAGE = "en";
const CURRENCIES = {
  BRL: { symbol: "R$", brlRate: 1 },
  USD: { symbol: "$", brlRate: 5.5 },
  EUR: { symbol: "€", brlRate: 6 },
  GBP: { symbol: "£", brlRate: 7 },
};
const MULTIVIEW_VIEW_ORDER = ["frente", "direita", "costas", "esquerda"];
const MULTIVIEW_API_ORDER = ["frente", "esquerda", "costas", "direita"];
const MULTIVIEW_VIEW_ALIASES = {
  front: "frente",
  frente: "frente",
  right: "direita",
  direita: "direita",
  back: "costas",
  costas: "costas",
  left: "esquerda",
  esquerda: "esquerda",
};
const MULTIVIEW_UPLOAD_ORDER = parseMultiviewUploadOrder(process.env.REFAZER_MULTIVIEW_UPLOAD_ORDER);
const WALLET_DB_PATH = path.join(__dirname, "data", "refazer_wallet.json");
const PENDING_MULTIVIEW_PATH = path.join(__dirname, "data", "pending_multiview_actions.json");
const PENDING_MULTIVIEW_TTL_MS = 6 * 60 * 60 * 1000;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Falta REFAZER_DISCORD_TOKEN, REFAZER_CLIENT_ID ou REFAZER_GUILD_ID no .env.");
  console.error("Tambem pode usar DISCORD_TOKEN, CLIENT_ID e GUILD_ID enquanto estiver testando.");
  process.exit(1);
}

global.$ = {
  assert(condition, message) {
    if (!condition) throw new Error(message || "assert failed");
  },
  assert_warn(condition, message) {
    if (!condition) console.warn(message || "assert warning");
  },
  bufferToString(buffer) {
    return Buffer.from(buffer).toString("utf8");
  },
};

let RBXMeshParser;

function loadMeshParser() {
  if (RBXMeshParser) return RBXMeshParser;

  global.ByteReader = require("./parsers/ByteReader.js");
  global.DracoBitstream = require("./parsers/DracoBitstream.js");
  RBXMeshParser = require("./parsers/MeshParser.js");

  return RBXMeshParser;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
});

function parseMultiviewUploadOrder(raw) {
  const valid = new Set(MULTIVIEW_VIEW_ORDER);
  const order = String(raw || "")
    .split(/[,\s;]+/)
    .map(item => MULTIVIEW_VIEW_ALIASES[item.trim().toLowerCase()] || item.trim().toLowerCase())
    .filter(Boolean);

  if (order.length === 4 && order.every(item => valid.has(item)) && new Set(order).size === 4) {
    return order;
  }

  return MULTIVIEW_API_ORDER;
}

const commands = [
  new SlashCommandBuilder()
    .setName("refazer_comandos")
    .setDescription("Mostra os comandos disponiveis do refazer")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("commands")
    .setDescription("Shows available Velvet commands")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Choose your language and payment currency")
    .addStringOption(o =>
      o
        .setName("language")
        .setDescription("Bot language")
        .setRequired(true)
        .addChoices(
          { name: "English", value: "en" },
          { name: "Español", value: "es" },
          { name: "Português do Brasil", value: "pt-BR" },
        )
    )
    .addStringOption(o =>
      o
        .setName("currency")
        .setDescription("Payment currency")
        .setRequired(false)
        .addChoices(
          { name: "USD - Dollar", value: "USD" },
          { name: "EUR - Euro", value: "EUR" },
          { name: "GBP - Pound", value: "GBP" },
          { name: "BRL - Real (Mercado Pago)", value: "BRL" }
        )
    )
    .addStringOption(o =>
      o
        .setName("render_lighting")
        .setDescription("Default /views lighting")
        .setRequired(false)
        .addChoices(
          { name: "Studio balanced", value: "studio" },
          { name: "Soft bright", value: "soft" },
          { name: "Dramatic", value: "dramatic" },
          { name: "Flat inspection", value: "flat" }
        )
    )
    .addStringOption(o =>
      o
        .setName("render_pov")
        .setDescription("Default /views camera POV/framing")
        .setRequired(false)
        .addChoices(
          { name: "Normal", value: "normal" },
          { name: "Close inspection", value: "close" },
          { name: "Wide full item", value: "wide" },
          { name: "Top-down tilt", value: "top_down" }
        )
    )
    .addNumberOption(o =>
      o.setName("render_ior").setDescription("Default material IOR. 1.00 to 2.50").setRequired(false).setMinValue(1).setMaxValue(2.5)
    )
    .addNumberOption(o =>
      o.setName("render_roughness").setDescription("Default material roughness. 0.00 shiny, 1.00 matte").setRequired(false).setMinValue(0).setMaxValue(1)
    )
    .addNumberOption(o =>
      o.setName("render_exposure").setDescription("Default render exposure. -1.00 to 1.00").setRequired(false).setMinValue(-1).setMaxValue(1)
    )
    .addNumberOption(o =>
      addLightPowerChoices(o.setName("render_light_power").setDescription("Default light strength multiplier. 0.20 to 3.00").setRequired(false).setMinValue(0.2).setMaxValue(3))
    )
    .addStringOption(o =>
      o
        .setName("advanced_texture_prompt")
        .setDescription("Show the optional advanced texture offer before generation")
        .setRequired(false)
        .addChoices(
          { name: "Show", value: "show" },
          { name: "Hide", value: "hide" }
        )
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Default final texture tone for Roblox")
        .setRequired(false)
        .addChoices(
          { name: "Roblox Safe", value: "normal" },
          { name: "Brighter", value: "brighter" },
          { name: "Vibrant", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Default texture saturation. 1.00 keeps original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Default texture brightness/value. 1.00 keeps original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_saldo")
    .setDescription("Mostra seu saldo de Service Credits")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Shows your Service Credits balance")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("Shows your recent Velvet orders and Service Credits activity")
    .addIntegerOption(o =>
      o.setName("limit").setDescription("How many entries to show").setRequired(false).setMinValue(1).setMaxValue(15)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("order_status")
    .setDescription("Checks a Service Credits order or 3D model request status")
    .addStringOption(o =>
      o.setName("id").setDescription("Order ID or model request ID").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_comprar")
    .setDescription("Cria um pedido de compra de Service Credits")
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Service Credits")
        .setRequired(true)
        .setMinValue(WALLET_MIN_PURCHASE)
    )
    .addStringOption(o =>
      o
        .setName("moeda")
        .setDescription("Moeda de pagamento. BRL usa Mercado Pago/Pix.")
        .setRequired(true)
        .addChoices(
          { name: "USD - Dollar", value: "USD" },
          { name: "EUR - Euro", value: "EUR" },
          { name: "GBP - Pound", value: "GBP" },
          { name: "BRL - Real (Mercado Pago)", value: "BRL" }
        )
    )
    .addStringOption(o =>
      o
        .setName("gateway")
        .setDescription("Gateway de pagamento")
        .setRequired(false)
        .addChoices(
          { name: "Padrao do bot", value: "default" },
          { name: "Stripe", value: "stripe" },
          { name: "Mercado Pago", value: "mercadopago" },
          { name: "Mercado Pago Pix", value: "mercadopago_pix" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Creates a Service Credits purchase request")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("Service Credits amount")
        .setRequired(true)
        .setMinValue(WALLET_MIN_PURCHASE)
    )
    .addStringOption(o =>
      o
        .setName("currency")
        .setDescription("Payment currency. BRL uses Mercado Pago/Pix.")
        .setRequired(true)
        .addChoices(
          { name: "BRL - Real", value: "BRL" },
          { name: "USD - Dollar", value: "USD" },
          { name: "EUR - Euro", value: "EUR" },
          { name: "GBP - Pound", value: "GBP" }
        )
    )
    .addStringOption(o =>
      o
        .setName("provider")
        .setDescription("Payment gateway")
        .setRequired(false)
        .addChoices(
          { name: "Bot default", value: "default" },
          { name: "Stripe", value: "stripe" },
          { name: "Mercado Pago", value: "mercadopago" },
          { name: "Mercado Pago Pix", value: "mercadopago_pix" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate")
    .setDescription("Shows your affiliate code, link and commission balance")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate_register")
    .setDescription("Affiliate only: registers your Discord invite link")
    .addStringOption(o =>
      o.setName("invite").setDescription("Your Discord invite link or code").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate_apply")
    .setDescription("Applies an affiliate code or invite to your account")
    .addStringOption(o =>
      o.setName("code").setDescription("Affiliate code or invite link").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate_redeem")
    .setDescription("Moves affiliate commission into your Service Credits balance")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Service Credits amount").setRequired(true).setMinValue(1)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate_withdraw")
    .setDescription("Creates an affiliate commission withdrawal request")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Service Credits amount").setRequired(true).setMinValue(AFFILIATE_WITHDRAW_MIN)
    )
    .addStringOption(o =>
      o.setName("payment_info").setDescription("Where/how the team should pay you").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("subscribe")
    .setDescription("Creates a Basic, Premium or Elite subscription link")
    .addStringOption(o =>
      o
        .setName("plan")
        .setDescription("Subscription plan")
        .setRequired(true)
        .addChoices(
          { name: "Basic - $19/month", value: "basic" },
          { name: "Premium - $39/month", value: "premium" },
          { name: "Elite - $69/month", value: "elite" },
          { name: "Premium Lifetime - $299 once", value: "premium_lifetime" },
          { name: "Elite Lifetime - $599 once", value: "elite_lifetime" }
        )
    )
    .addStringOption(o =>
      o.setName("email").setDescription("Payment email").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("provider")
        .setDescription("Payment gateway")
        .setRequired(false)
        .addChoices(
          { name: "Bot default", value: "default" },
          { name: "Stripe", value: "stripe" },
          { name: "Mercado Pago", value: "mercadopago" },
          { name: "Mercado Pago Pix - 30 days", value: "mercadopago_pix" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_transferir")
    .setDescription("Transfere Service Credits para outro usuário")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário que vai receber").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Service Credits")
        .setRequired(true)
        .setMinValue(1)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_sacar")
    .setDescription("Cria um pedido de saque para revisao da equipe")
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Service Credits")
        .setRequired(true)
        .setMinValue(100)
    )
    .addStringOption(o =>
      o.setName("roblox_usuario").setDescription("Seu usuário no Roblox").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("grupo_14_dias")
        .setDescription("Digite SIM se ja esta no grupo ha pelo menos 14 dias")
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_admin_add")
    .setDescription("Admin: adiciona Service Credits para um usuário")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário que vai receber").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Service Credits")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(o =>
      o.setName("motivo").setDescription("Motivo do ajuste").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_admin_remover")
    .setDescription("Admin: remove Service Credits de um usuário")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário que vai perder saldo").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Service Credits")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(o =>
      o.setName("motivo").setDescription("Motivo do ajuste").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_admin_compras")
    .setDescription("Admin: lista pedidos de compra pendentes")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_admin_compra")
    .setDescription("Admin: aprova ou rejeita uma compra")
    .addStringOption(o =>
      o.setName("id").setDescription("ID do pedido de compra").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("acao")
        .setDescription("O que fazer com o pedido")
        .setRequired(true)
        .addChoices(
          { name: "Aprovar", value: "aprovar" },
          { name: "Rejeitar", value: "rejeitar" }
        )
    )
    .addStringOption(o =>
      o.setName("motivo").setDescription("Observacao da equipe").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_admin_saques")
    .setDescription("Admin: lista pedidos de saque pendentes")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_admin_saque")
    .setDescription("Admin: aprova ou rejeita um saque")
    .addStringOption(o =>
      o.setName("id").setDescription("ID do pedido de saque").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("acao")
        .setDescription("O que fazer com o pedido")
        .setRequired(true)
        .addChoices(
          { name: "Aprovar", value: "aprovar" },
          { name: "Rejeitar", value: "rejeitar" }
        )
    )
    .addStringOption(o =>
      o.setName("motivo").setDescription("Observacao da equipe").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("copiar")
    .setDescription("Envia o modelo original e textura sem recriar")
    .addStringOption(o =>
      o.setName("id").setDescription("ID do UGC original").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("steal")
    .setDescription("Copies original asset files or classic clothing templates")
    .addStringOption(o =>
      o.setName("id").setDescription("UGC, classic clothing ID, or Roblox catalog URL").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("sniper")
    .setDescription("Admin market radar for recent best-selling Roblox UGC items")
    .addStringOption(o =>
      o
        .setName("window")
        .setDescription("Market window")
        .setRequired(true)
        .addChoices(
          { name: "Best today", value: "today" },
          { name: "Best yesterday", value: "yesterday" },
          { name: "Recently published", value: "recent" },
          { name: "Best this week", value: "week" },
          { name: "Best all time", value: "total" }
        )
    )
    .addStringOption(o =>
      o
        .setName("category")
        .setDescription("Catalog category")
        .setRequired(false)
        .addChoices(
          { name: "All", value: "all" },
          { name: "Accessories", value: "accessories" },
          { name: "Hats", value: "hats" },
          { name: "Hair", value: "hair" },
          { name: "Face accessories", value: "face_accessories" },
          { name: "Neck accessories", value: "neck_accessories" },
          { name: "Shoulder accessories", value: "shoulder_accessories" },
          { name: "Front accessories", value: "front_accessories" },
          { name: "Back accessories", value: "back_accessories" },
          { name: "Waist accessories", value: "waist_accessories" },
          { name: "Faces", value: "faces" },
          { name: "Heads", value: "heads" },
          { name: "Bundles", value: "bundles" },
          { name: "Classic shirts", value: "classic_shirts" },
          { name: "Classic pants", value: "classic_pants" },
          { name: "T-shirts", value: "tshirts" },
          { name: "Layered clothing", value: "layered_clothing" },
          { name: "Clothing", value: "clothing" },
          { name: "Collectibles", value: "collectibles" }
        )
    )
    .addStringOption(o =>
      o.setName("keyword").setDescription("Optional niche keyword, for example horror, vkei, hair").setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName("min_price").setDescription("Minimum Robux price").setRequired(false).setMinValue(0)
    )
    .addIntegerOption(o =>
      o.setName("max_price").setDescription("Maximum Robux price").setRequired(false).setMinValue(1)
    )
    .addIntegerOption(o =>
      o.setName("max_age_days").setDescription("Only include items created within this many days").setRequired(false).setMinValue(0).setMaxValue(365)
    )
    .addIntegerOption(o =>
      o.setName("results").setDescription("How many results to return. Admin only.").setRequired(false).setMinValue(1).setMaxValue(50)
    )
    .addStringOption(o =>
      o
        .setName("depth")
        .setDescription("Scan depth. Deep is slower and more likely to hit Roblox rate limits.")
        .setRequired(false)
        .addChoices(
          { name: "Normal", value: "normal" },
          { name: "Deep", value: "deep" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("limited_sniper")
    .setDescription("Admin radar for best-selling Roblox limited / collectible UGC items")
    .addStringOption(o =>
      o
        .setName("window")
        .setDescription("Market window")
        .setRequired(true)
        .addChoices(
          { name: "Best today", value: "today" },
          { name: "Best yesterday", value: "yesterday" },
          { name: "Recently published", value: "recent" },
          { name: "Best this week", value: "week" },
          { name: "Best all time", value: "total" }
        )
    )
    .addStringOption(o =>
      o
        .setName("category")
        .setDescription("Limited category")
        .setRequired(false)
        .addChoices(
          { name: "All limiteds", value: "all" },
          { name: "Collectibles", value: "collectibles" },
          { name: "Accessories", value: "accessories" },
          { name: "Hats", value: "hats" },
          { name: "Hair", value: "hair" },
          { name: "Face accessories", value: "face_accessories" },
          { name: "Neck accessories", value: "neck_accessories" },
          { name: "Shoulder accessories", value: "shoulder_accessories" },
          { name: "Front accessories", value: "front_accessories" },
          { name: "Back accessories", value: "back_accessories" },
          { name: "Waist accessories", value: "waist_accessories" }
        )
    )
    .addStringOption(o =>
      o.setName("keyword").setDescription("Optional niche keyword, for example horror, vkei, hair").setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName("min_price").setDescription("Minimum Robux price").setRequired(false).setMinValue(0)
    )
    .addIntegerOption(o =>
      o.setName("max_price").setDescription("Maximum Robux price").setRequired(false).setMinValue(1)
    )
    .addIntegerOption(o =>
      o.setName("max_age_days").setDescription("Only include limiteds created within this many days").setRequired(false).setMinValue(0).setMaxValue(365)
    )
    .addIntegerOption(o =>
      o.setName("results").setDescription("How many limiteds to return. Admin only.").setRequired(false).setMinValue(1).setMaxValue(50)
    )
    .addStringOption(o =>
      o
        .setName("depth")
        .setDescription("Scan depth. Deep is slower and more likely to hit Roblox rate limits.")
        .setRequired(false)
        .addChoices(
          { name: "Normal", value: "normal" },
          { name: "Deep", value: "deep" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("bulk_steal_clothing")
    .setDescription("Copies classic clothing templates in bulk")
    .addStringOption(o =>
      o.setName("ids").setDescription("Clothing IDs or URLs, separated by space or comma").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("bulk_steal")
    .setDescription("Copies original assets in bulk")
    .addStringOption(o =>
      o.setName("ids").setDescription("UGC IDs, separated by space or comma").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("views")
    .setDescription("Renders front, side, back and isometric reference images from a UGC")
    .addStringOption(o =>
      o.setName("id").setDescription("Original UGC ID").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("lighting")
        .setDescription("Lighting preset for this render")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Studio balanced", value: "studio" },
          { name: "Soft bright", value: "soft" },
          { name: "Dramatic", value: "dramatic" },
          { name: "Flat inspection", value: "flat" }
        )
    )
    .addStringOption(o =>
      o
        .setName("pov")
        .setDescription("Camera POV/framing for this render")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Normal", value: "normal" },
          { name: "Close inspection", value: "close" },
          { name: "Wide full item", value: "wide" },
          { name: "Top-down tilt", value: "top_down" }
        )
    )
    .addStringOption(o =>
      o
        .setName("angles")
        .setDescription("Reference angle set. 5 Blender views is admin-only.")
        .setRequired(false)
        .addChoices(
          { name: "Multiview 4 - front/right/back/left", value: "multiview4" },
          { name: "5 Blender views - front/right/back/left/top", value: "ai5" }
        )
    )
    .addNumberOption(o =>
      o.setName("ior").setDescription("Material IOR. 1.00 to 2.50").setRequired(false).setMinValue(1).setMaxValue(2.5)
    )
    .addNumberOption(o =>
      o.setName("roughness").setDescription("Material roughness. 0.00 shiny, 1.00 matte").setRequired(false).setMinValue(0).setMaxValue(1)
    )
    .addNumberOption(o =>
      o.setName("exposure").setDescription("Render exposure. -1.00 to 1.00").setRequired(false).setMinValue(-1).setMaxValue(1)
    )
    .addNumberOption(o =>
      addLightPowerChoices(o.setName("light_power").setDescription("Light strength multiplier. 0.20 to 3.00").setRequired(false).setMinValue(0.2).setMaxValue(3))
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("views_custom")
    .setDescription("Renders UGC views with full lighting and material controls")
    .addStringOption(o =>
      o.setName("id").setDescription("Original UGC ID").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("lighting")
        .setDescription("Lighting preset")
        .setRequired(true)
        .addChoices(
          { name: "Studio balanced", value: "studio" },
          { name: "Soft bright", value: "soft" },
          { name: "Dramatic", value: "dramatic" },
          { name: "Flat inspection", value: "flat" }
        )
    )
    .addStringOption(o =>
      o
        .setName("pov")
        .setDescription("Camera POV/framing")
        .setRequired(true)
        .addChoices(
          { name: "Normal", value: "normal" },
          { name: "Close inspection", value: "close" },
          { name: "Wide full item", value: "wide" },
          { name: "Top-down tilt", value: "top_down" }
        )
    )
    .addNumberOption(o =>
      o.setName("ior").setDescription("Material IOR. 1.00 normal, up to 2.50 glassy").setRequired(true).setMinValue(1).setMaxValue(2.5)
    )
    .addNumberOption(o =>
      o.setName("roughness").setDescription("0.00 shiny, 1.00 matte").setRequired(true).setMinValue(0).setMaxValue(1)
    )
    .addNumberOption(o =>
      o.setName("exposure").setDescription("Render exposure. -1.00 dark to 1.00 bright").setRequired(true).setMinValue(-1).setMaxValue(1)
    )
    .addNumberOption(o =>
      addLightPowerChoices(o.setName("light_power").setDescription("Light strength multiplier. 0.20 to 3.00").setRequired(true).setMinValue(0.2).setMaxValue(3))
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("model_views")
    .setDescription("Admin: renders reference images from an uploaded 3D model")
    .addAttachmentOption(o =>
      o.setName("model").setDescription("3D model file: GLB, GLTF, OBJ or FBX").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("angles")
        .setDescription("Reference angle set")
        .setRequired(false)
        .addChoices(
          { name: "Multiview 4 - front/right/back/left", value: "multiview4" },
          { name: "5 Blender views - front/right/back/left/top", value: "blender5" },
          { name: "Full 10 views", value: "full10" }
        )
    )
    .addStringOption(o =>
      o
        .setName("lighting")
        .setDescription("Lighting preset")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Flat inspection", value: "flat" },
          { name: "Studio", value: "studio" },
          { name: "Soft", value: "soft" },
          { name: "Dramatic", value: "dramatic" }
        )
    )
    .addStringOption(o =>
      o
        .setName("pov")
        .setDescription("Camera framing")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Normal", value: "normal" },
          { name: "Close", value: "close" },
          { name: "Wide", value: "wide" },
          { name: "Top Down", value: "top_down" }
        )
    )
    .addNumberOption(o =>
      o.setName("ior").setDescription("Material IOR. 1.00 normal, up to 2.50 glassy").setRequired(false).setMinValue(1).setMaxValue(2.5)
    )
    .addNumberOption(o =>
      o.setName("roughness").setDescription("Material roughness. 0 glossy, 1 matte").setRequired(false).setMinValue(0).setMaxValue(1)
    )
    .addNumberOption(o =>
      o.setName("exposure").setDescription("Render exposure. -1.00 to 1.00").setRequired(false).setMinValue(-1).setMaxValue(1)
    )
    .addNumberOption(o =>
      addLightPowerChoices(o.setName("light_power").setDescription("Light strength multiplier. 0.20 to 3.00").setRequired(false).setMinValue(0.2).setMaxValue(3))
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_bulk_views")
    .setDescription("Admin: renders reference views for up to 10 UGC IDs")
    .addStringOption(o =>
      o.setName("ids").setDescription("Up to 10 UGC IDs, separated by space or comma").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("lighting")
        .setDescription("Lighting preset for this render batch")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Studio balanced", value: "studio" },
          { name: "Soft bright", value: "soft" },
          { name: "Dramatic", value: "dramatic" },
          { name: "Flat inspection", value: "flat" }
        )
    )
    .addStringOption(o =>
      o
        .setName("pov")
        .setDescription("Camera POV/framing for this render batch")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Normal", value: "normal" },
          { name: "Close inspection", value: "close" },
          { name: "Wide full item", value: "wide" },
          { name: "Top-down tilt", value: "top_down" }
        )
    )
    .addNumberOption(o =>
      o.setName("ior").setDescription("Material IOR. 1.00 to 2.50").setRequired(false).setMinValue(1).setMaxValue(2.5)
    )
    .addNumberOption(o =>
      o.setName("roughness").setDescription("Material roughness. 0.00 shiny, 1.00 matte").setRequired(false).setMinValue(0).setMaxValue(1)
    )
    .addNumberOption(o =>
      o.setName("exposure").setDescription("Render exposure. -1.00 to 1.00").setRequired(false).setMinValue(-1).setMaxValue(1)
    )
    .addNumberOption(o =>
      addLightPowerChoices(o.setName("light_power").setDescription("Light strength multiplier. 0.20 to 3.00").setRequired(false).setMinValue(0.2).setMaxValue(3))
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_views_full")
    .setDescription("Admin: renders a full 10-angle reference set for one UGC")
    .addStringOption(o =>
      o.setName("id").setDescription("Original UGC ID").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("lighting")
        .setDescription("Lighting preset for this render")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Studio balanced", value: "studio" },
          { name: "Soft bright", value: "soft" },
          { name: "Dramatic", value: "dramatic" },
          { name: "Flat inspection", value: "flat" }
        )
    )
    .addStringOption(o =>
      o
        .setName("pov")
        .setDescription("Camera POV/framing for this render")
        .setRequired(false)
        .addChoices(
          { name: "Your default", value: "default" },
          { name: "Normal", value: "normal" },
          { name: "Close inspection", value: "close" },
          { name: "Wide full item", value: "wide" },
          { name: "Top-down tilt", value: "top_down" }
        )
    )
    .addNumberOption(o =>
      o.setName("ior").setDescription("Material IOR. 1.00 to 2.50").setRequired(false).setMinValue(1).setMaxValue(2.5)
    )
    .addNumberOption(o =>
      o.setName("roughness").setDescription("Material roughness. 0.00 shiny, 1.00 matte").setRequired(false).setMinValue(0).setMaxValue(1)
    )
    .addNumberOption(o =>
      o.setName("exposure").setDescription("Render exposure. -1.00 to 1.00").setRequired(false).setMinValue(-1).setMaxValue(1)
    )
    .addNumberOption(o =>
      addLightPowerChoices(o.setName("light_power").setDescription("Light strength multiplier. 0.20 to 3.00").setRequired(false).setMinValue(0.2).setMaxValue(3))
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_roblox_status")
    .setDescription("Admin: checks Roblox cookie/safe-mode status")
    .addBooleanOption(o =>
      o.setName("reset_pause").setDescription("Clear the current Roblox Safe Mode pause").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_status")
    .setDescription("Admin: checks Velvet systems, APIs, queues and recent risk signals")
    .addBooleanOption(o =>
      o.setName("reset_roblox_pause").setDescription("Clear the current Roblox Safe Mode pause").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("bulk_remake")
    .setDescription("Premium: creates a quote/request for up to 10 remakes")
    .addStringOption(o =>
      o.setName("ids").setDescription("Up to 10 UGC IDs, separated by space or comma").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("difference").setDescription("How different it should be").setRequired(true).setMinValue(1).setMaxValue(10)
    )
    .addStringOption(o =>
      o
        .setName("enhancement")
        .setDescription("Reference image enhancement")
        .setRequired(true)
        .addChoices(
          { name: "No enhancement", value: "none" },
          { name: "Clean Local", value: "economy" }
        )
    )
    .addStringOption(o =>
      o
        .setName("texture")
        .setDescription("Texture quality")
        .setRequired(false)
        .addChoices(
          { name: "No texture", value: "none" },
          { name: "Standard", value: "standard" },
        )
    )
    .addIntegerOption(o =>
      o.setName("triangles").setDescription("Triangle limit. Max: 3950").setRequired(false).setMinValue(500).setMaxValue(3950)
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Final texture tone")
        .setRequired(false)
        .addChoices(
          { name: "Use my default", value: "default" },
          { name: "Roblox Safe", value: "normal" },
          { name: "Brighter", value: "brighter" },
          { name: "Vibrant", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Texture saturation. 1.00 keeps original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Texture brightness/value. 1.00 keeps original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("remake")
    .setDescription("Remakes a UGC model")
    .addStringOption(o =>
      o.setName("id").setDescription("Original UGC ID").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("difference")
        .setDescription("How different it should be from the original")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addStringOption(o =>
      o
        .setName("enhancement")
        .setDescription("Reference image enhancement")
        .setRequired(true)
        .addChoices(
          { name: "No enhancement", value: "none" },
          { name: "Clean Local", value: "economy" }
        )
    )
    .addStringOption(o =>
      o
        .setName("texture")
        .setDescription("Texture quality")
        .setRequired(false)
        .addChoices(
          { name: "No texture", value: "none" },
          { name: "Standard", value: "standard" },
        )
    )
    .addIntegerOption(o =>
      o
        .setName("triangles")
        .setDescription("Triangle limit. Max: 3950")
        .setRequired(false)
        .setMinValue(500)
        .setMaxValue(3950)
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Final texture tone")
        .setRequired(false)
        .addChoices(
          { name: "Use my default", value: "default" },
          { name: "Roblox Safe", value: "normal" },
          { name: "Brighter", value: "brighter" },
          { name: "Vibrant", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Texture saturation. 1.00 keeps original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Texture brightness/value. 1.00 keeps original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .addStringOption(o =>
      o
        .setName("view")
        .setDescription("Reference view")
        .setRequired(false)
        .addChoices(
          { name: "Isometric", value: "isometrica" },
          { name: "Front", value: "frente" },
          { name: "Right", value: "direita" },
          { name: "Left", value: "esquerda" },
          { name: "Back", value: "costas" }
        )
    )
    .addBooleanOption(o =>
      o
        .setName("mock_ai")
        .setDescription("Test the flow without real generation")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("price")
    .setDescription("Calculates a remake price")
    .addStringOption(o =>
      o
        .setName("mode")
        .setDescription("Generation mode")
        .setRequired(true)
        .addChoices(
          { name: "Single image", value: "single" },
          { name: "Multiview", value: "multiview" }
        )
    )
    .addStringOption(o =>
      o
        .setName("texture")
        .setDescription("Texture quality")
        .setRequired(true)
        .addChoices(
          { name: "No texture", value: "none" },
          { name: "Standard", value: "standard" },
        )
    )
    .addStringOption(o =>
      o
        .setName("enhancement")
        .setDescription("Reference image enhancement")
        .setRequired(true)
        .addChoices(
          { name: "No enhancement", value: "none" },
          { name: "Clean Local", value: "economy" }
        )
    )
    .addIntegerOption(o =>
      o
        .setName("triangles")
        .setDescription("Triangle limit. Max: 3950")
        .setRequired(false)
        .setMinValue(500)
        .setMaxValue(3950)
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Final texture tone")
        .setRequired(false)
        .addChoices(
          { name: "Use my default", value: "default" },
          { name: "Roblox Safe", value: "normal" },
          { name: "Brighter", value: "brighter" },
          { name: "Vibrant", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Texture saturation. 1.00 keeps original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Texture brightness/value. 1.00 keeps original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("generate_image")
    .setDescription("Generates a reference image from a prompt")
    .addStringOption(o =>
      o.setName("prompt").setDescription("Describe the image you want").setRequired(true).setMaxLength(1000)
    )
    .addStringOption(o =>
      o
        .setName("quality")
        .setDescription("Image generation quality")
        .setRequired(false)
        .addChoices(
          { name: "Economy", value: "economy" },
          { name: "Standard", value: "standard" },
          { name: "Premium", value: "premium" }
        )
    )
    .addStringOption(o =>
      o
        .setName("resolution")
        .setDescription("Output resolution")
        .setRequired(false)
        .addChoices(
          { name: "1K", value: "1K" },
          { name: "2K", value: "2K" },
          { name: "4K", value: "4K" }
        )
    )
    .addStringOption(o =>
      o
        .setName("aspect_ratio")
        .setDescription("Image shape")
        .setRequired(false)
        .addChoices(
          { name: "Square 1:1", value: "1:1" },
          { name: "Landscape 3:2", value: "3:2" },
          { name: "Portrait 2:3", value: "2:3" },
          { name: "Wide 16:9", value: "16:9" },
          { name: "Vertical 9:16", value: "9:16" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("enhance_images")
    .setDescription("Enhances up to 4 reference images before multiview")
    .addAttachmentOption(o =>
      o.setName("front").setDescription("Front image").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("quality")
        .setDescription("Enhancement quality")
        .setRequired(true)
        .addChoices(
          { name: "Clean Local", value: "economy" }
        )
    )
    .addAttachmentOption(o =>
      o.setName("right").setDescription("Right side image").setRequired(false)
    )
    .addAttachmentOption(o =>
      o.setName("back").setDescription("Back image").setRequired(false)
    )
    .addAttachmentOption(o =>
      o.setName("left").setDescription("Left side image").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("prompt_model")
    .setDescription("Generates a 3D model from a text prompt")
    .addStringOption(o =>
      o.setName("prompt").setDescription("Describe the 3D model you want").setRequired(true).setMaxLength(1000)
    )
    .addStringOption(o =>
      o
        .setName("texture")
        .setDescription("Texture quality")
        .setRequired(false)
        .addChoices(
          { name: "No texture", value: "none" },
          { name: "Standard", value: "standard" },
        )
    )
    .addIntegerOption(o =>
      o.setName("triangles").setDescription("Triangle limit. Max: 3950").setRequired(false).setMinValue(500).setMaxValue(3950)
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Final texture tone")
        .setRequired(false)
        .addChoices(
          { name: "Use my default", value: "default" },
          { name: "Roblox Safe", value: "normal" },
          { name: "Brighter", value: "brighter" },
          { name: "Vibrant", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Texture saturation. 1.00 keeps original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Texture brightness/value. 1.00 keeps original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("image_model")
    .setDescription("Generates a 3D model from one reference image")
    .addAttachmentOption(o =>
      o.setName("image").setDescription("Main reference image").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("texture")
        .setDescription("Texture quality")
        .setRequired(false)
        .addChoices(
          { name: "No texture", value: "none" },
          { name: "Standard", value: "standard" },
        )
    )
    .addIntegerOption(o =>
      o.setName("triangles").setDescription("Triangle limit. Max: 3950").setRequired(false).setMinValue(500).setMaxValue(3950)
    )
    .addBooleanOption(o =>
      o
        .setName("alpha")
        .setDescription("Use image transparency/alpha in the AI generation. Default: off")
        .setRequired(false)
    )
    .addStringOption(o =>
      o
        .setName("detail_level")
        .setDescription("Final detail level")
        .setRequired(false)
        .addChoices(
          { name: "Standard", value: "medium" },
          { name: `Sharper Details (+${brlToWalletTokens(modelQualityConfig("high").priceExtraBrl)} ${WALLET_TOKEN_NAME})`, value: "high" }
        )
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Final texture tone")
        .setRequired(false)
        .addChoices(
          { name: "Use my default", value: "default" },
          { name: "Roblox Safe", value: "normal" },
          { name: "Brighter", value: "brighter" },
          { name: "Vibrant", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Texture saturation. 1.00 keeps original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Texture brightness/value. 1.00 keeps original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_add")
    .setDescription("Admin: adds Service Credits to a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Service Credits amount").setRequired(true).setMinValue(1)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Adjustment reason").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_buy")
    .setDescription("Admin: creates a discounted Service Credits checkout for a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User that will receive the credits").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Service Credits amount").setRequired(true).setMinValue(1)
    )
    .addNumberOption(o =>
      o.setName("price_brl").setDescription("Custom checkout price in BRL").setRequired(true).setMinValue(1)
    )
    .addStringOption(o =>
      o
        .setName("provider")
        .setDescription("Payment gateway")
        .setRequired(false)
        .addChoices(
          { name: "Bot default", value: "default" },
          { name: "Stripe", value: "stripe" },
          { name: "Mercado Pago", value: "mercadopago" },
          { name: "Mercado Pago Pix", value: "mercadopago_pix" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("code_redeem")
    .setDescription("Redeems a Service Credits promo code")
    .addStringOption(o =>
      o.setName("code").setDescription("Promo code").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("gift_create")
    .setDescription("Creates a restricted Service Credits gift for one user")
    .addUserOption(o =>
      o.setName("recipient").setDescription("User who can redeem this gift").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Service Credits amount").setRequired(true).setMinValue(1)
    )
    .addIntegerOption(o =>
      o
        .setName("expires_days")
        .setDescription(`Expiration in days. Default ${GIFT_CODE_DEFAULT_EXPIRATION_DAYS}, max ${GIFT_CODE_MAX_EXPIRATION_DAYS}`)
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(GIFT_CODE_MAX_EXPIRATION_DAYS)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("gift_redeem")
    .setDescription("Redeems a Service Credits gift code sent to you")
    .addStringOption(o =>
      o.setName("code").setDescription("Gift code").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("gift_history")
    .setDescription("Shows your recent Service Credits history")
    .addIntegerOption(o =>
      o.setName("limit").setDescription("How many entries to show").setRequired(false).setMinValue(1).setMaxValue(25)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_code_create")
    .setDescription("Admin: creates a limited Service Credits promo code")
    .addStringOption(o =>
      o.setName("code").setDescription("Code name, for example VELVET100").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Service Credits given per redeem").setRequired(true).setMinValue(1)
    )
    .addIntegerOption(o =>
      o.setName("uses").setDescription("Maximum number of users that can redeem it").setRequired(true).setMinValue(1)
    )
    .addStringOption(o =>
      o
        .setName("services")
        .setDescription("Optional: all, copy, clothing, remake, multiview, prompt_model, image, enhancement, sniper")
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName("note").setDescription("Internal note").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_code_disable")
    .setDescription("Admin: disables a promo code")
    .addStringOption(o =>
      o.setName("code").setDescription("Promo code").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_codes")
    .setDescription("Admin: lists active and recent promo codes")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_gift_cancel")
    .setDescription("Admin: cancels an active gift code and refunds the sender")
    .addStringOption(o =>
      o.setName("code").setDescription("Gift code").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Team note").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_credit_history")
    .setDescription("Admin: shows a user's recent Service Credits history")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("limit").setDescription("How many entries to show").setRequired(false).setMinValue(1).setMaxValue(25)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_remove")
    .setDescription("Admin: removes Service Credits from a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Service Credits amount").setRequired(true).setMinValue(1)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Adjustment reason").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_purchases")
    .setDescription("Admin: lists pending purchase requests")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_purchase")
    .setDescription("Admin: approves or rejects a purchase")
    .addStringOption(o =>
      o.setName("id").setDescription("Purchase request ID").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "Approve", value: "aprovar" },
          { name: "Reject", value: "rejeitar" }
        )
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Team note").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_withdrawals")
    .setDescription("Admin: lists pending withdrawal requests")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_withdrawal")
    .setDescription("Admin: approves or rejects a withdrawal")
    .addStringOption(o =>
      o.setName("id").setDescription("Withdrawal request ID").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("action")
        .setDescription("Action")
        .setRequired(true)
        .addChoices(
          { name: "Approve", value: "aprovar" },
          { name: "Reject", value: "rejeitar" }
        )
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Team note").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_post_guide")
    .setDescription("Admin: posts the official bot usage guide in this channel")
    .addStringOption(o =>
      o
        .setName("language")
        .setDescription("Guide language")
        .setRequired(true)
        .addChoices(
          { name: "English", value: "en" },
          { name: "Both", value: "both" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_post_terms")
    .setDescription("Admin: posts the official purchase and service terms in this channel")
    .addStringOption(o =>
      o
        .setName("language")
        .setDescription("Terms language")
        .setRequired(true)
        .addChoices(
          { name: "English", value: "en" },
          { name: "Both", value: "both" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_post_info")
    .setDescription("Admin: posts a polished official information message as the bot")
    .addStringOption(o =>
      o
        .setName("type")
        .setDescription("Message to publish")
        .setRequired(true)
        .addChoices(
          { name: "Rules", value: "rules" },
          { name: "Terms of Service", value: "terms" },
          { name: "Subscriptions", value: "subscriptions" },
          { name: "How to Buy", value: "how_to_buy" },
          { name: "How Service Credits Work", value: "credits" },
          { name: "Bot Instructions", value: "bot_instructions" },
          { name: "Announcements", value: "announcements" },
          { name: "Update Log", value: "update_log" },
          { name: "Our Results", value: "results" }
        )
    )
    .addChannelOption(o =>
      o
        .setName("channel")
        .setDescription("Channel where the bot should post")
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_post_model_starter")
    .setDescription("Admin: posts the simple 3D model creation button")
    .addChannelOption(o =>
      o
        .setName("channel")
        .setDescription("Channel where the bot should post")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("generate3d")
    .setDescription("Starts the guided 3D model request flow")
    .addIntegerOption(o =>
      o
        .setName("triangles")
        .setDescription("Roblox triangle target. 500 to 3950. Default: 3900")
        .setRequired(false)
        .setMinValue(ROBLOX_MIN_TRIANGLE_LIMIT)
        .setMaxValue(ROBLOX_MAX_TRIANGLE_LIMIT)
    )
    .addStringOption(o =>
      o
        .setName("prompt")
        .setDescription("Optional guidance to improve the model. Keep shape-preservation instructions clear")
        .setRequired(false)
        .setMaxLength(900)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("multiview")
    .setDescription("Creates a multiview remake request")
    .addAttachmentOption(o =>
      o.setName("front").setDescription("Front image").setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName("right").setDescription("Right side image").setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName("left").setDescription("Left side image").setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName("back").setDescription("Back image").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("texture")
        .setDescription("Texture quality")
        .setRequired(false)
        .addChoices(
          { name: "No texture", value: "none" },
          { name: "Standard", value: "standard" },
        )
    )
    .addStringOption(o =>
      o
        .setName("enhancement")
        .setDescription("Reference image enhancement")
        .setRequired(false)
        .addChoices(
          { name: "No enhancement", value: "none" },
          { name: "Clean Local", value: "economy" }
        )
    )
    .addIntegerOption(o =>
      o
        .setName("triangles")
        .setDescription("Triangle limit. Max: 3950")
        .setRequired(false)
        .setMinValue(500)
        .setMaxValue(3950)
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Final texture tone")
        .setRequired(false)
        .addChoices(
          { name: "Use my default", value: "default" },
          { name: "Roblox Safe", value: "normal" },
          { name: "Brighter", value: "brighter" },
          { name: "Vibrant", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Texture saturation. 1.00 keeps original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Texture brightness/value. 1.00 keeps original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .addBooleanOption(o =>
      o
        .setName("alpha")
        .setDescription("Use image transparency/alpha in the AI generation. Default: off")
        .setRequired(false)
    )
    .addStringOption(o =>
      o
        .setName("detail_level")
        .setDescription("Final detail level. Standard is the safest promo default")
        .setRequired(false)
        .addChoices(
          { name: "Standard", value: "medium" },
          { name: `Sharper Details (+${brlToWalletTokens(modelQualityConfig("high").priceExtraBrl)} ${WALLET_TOKEN_NAME})`, value: "high" }
        )
    )
    .addStringOption(o =>
      o
        .setName("prompt")
        .setDescription("Optional guidance for the 3D AI. Example: preserve silhouette, sharp UGC accessory")
        .setRequired(false)
        .setMaxLength(900)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("refazer")
    .setDescription("Refaz um modelo UGC")
    .addStringOption(o =>
      o.setName("id").setDescription("ID do UGC original").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("diferenca")
        .setDescription("Quanto deve ficar diferente do original")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addStringOption(o =>
      o
        .setName("melhoria")
        .setDescription("Melhoria das imagens antes da modelagem")
        .setRequired(true)
        .addChoices(
          { name: "Sem melhoria", value: "none" },
          { name: "Limpeza local", value: "economy" }
        )
    )
    .addStringOption(o =>
      o
        .setName("textura")
        .setDescription("Qualidade da textura")
        .setRequired(false)
        .addChoices(
          { name: "Sem textura", value: "none" },
          { name: "Padrao", value: "standard" },
        )
    )
    .addIntegerOption(o =>
      o
        .setName("triangles")
        .setDescription("Limite de triangulos. Maximo: 3950")
        .setRequired(false)
        .setMinValue(500)
        .setMaxValue(3950)
    )
    .addStringOption(o =>
      o
        .setName("texture_tone")
        .setDescription("Tom final da textura")
        .setRequired(false)
        .addChoices(
          { name: "Usar meu padrao", value: "default" },
          { name: "Roblox seguro", value: "normal" },
          { name: "Mais clara", value: "brighter" },
          { name: "Mais viva", value: "vibrant" }
        )
    )
    .addNumberOption(o =>
      o.setName("texture_saturation").setDescription("Saturacao da textura. 1.00 mantem original").setRequired(false).setMinValue(0.5).setMaxValue(1.5)
    )
    .addNumberOption(o =>
      o.setName("texture_value").setDescription("Brilho/value da textura. 1.00 mantem original").setRequired(false).setMinValue(0.6).setMaxValue(1.6)
    )
    .addStringOption(o =>
      o
        .setName("vista")
        .setDescription("Foto de referencia usada no processamento")
        .setRequired(false)
        .addChoices(
          { name: "Isometrica", value: "isometrica" },
          { name: "Frente", value: "frente" },
          { name: "Direita", value: "direita" },
          { name: "Esquerda", value: "esquerda" },
          { name: "Costas", value: "costas" }
        )
    )
    .addBooleanOption(o =>
      o
        .setName("mock_ia")
        .setDescription("Testar o fluxo completo sem gerar modelo real")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("refazer_mock")
    .setDescription("Testa o /refazer completo sem gerar modelo real")
    .addStringOption(o =>
      o.setName("id").setDescription("ID do UGC original").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("diferenca")
        .setDescription("Quanto deve ficar diferente do original")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("modelo_ultimo")
    .setDescription("Envia o ultimo modelo finalizado")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("refazer_debug")
    .setDescription("Mostra dados internos do ultimo modelo. Uso privado")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("refazer_preco")
    .setDescription("Calcula o preco de um modelo refeito")
    .addStringOption(o =>
      o
        .setName("modo")
        .setDescription("Tipo de geracao")
        .setRequired(true)
        .addChoices(
          { name: "Imagem unica", value: "single" },
          { name: "Multiview", value: "multiview" }
        )
    )
    .addStringOption(o =>
      o
        .setName("textura")
        .setDescription("Qualidade da textura")
        .setRequired(true)
        .addChoices(
          { name: "Sem textura", value: "none" },
          { name: "Padrao", value: "standard" },
        )
    )
    .addStringOption(o =>
      o
        .setName("melhoria")
        .setDescription("Melhoria das imagens antes da modelagem")
        .setRequired(true)
        .addChoices(
          { name: "Sem melhoria", value: "none" },
          { name: "Limpeza local", value: "economy" }
        )
    )
    .addIntegerOption(o =>
      o
        .setName("triangles")
        .setDescription("Limite de triangulos. Maximo recomendado: 3950")
        .setRequired(false)
        .setMinValue(500)
        .setMaxValue(3950)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("refazer_multiview")
    .setDescription("Abre um pedido multiview com fotos nomeadas")
    .addAttachmentOption(o =>
      o.setName("frente").setDescription("Foto frontal").setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName("direita").setDescription("Foto do lado direito").setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName("esquerda").setDescription("Foto do lado esquerdo").setRequired(true)
    )
    .addAttachmentOption(o =>
      o.setName("costas").setDescription("Foto de costas").setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("textura")
        .setDescription("Qualidade da textura")
        .setRequired(false)
        .addChoices(
          { name: "Sem textura", value: "none" },
          { name: "Padrao", value: "standard" },
        )
    )
    .addStringOption(o =>
      o
        .setName("melhoria")
        .setDescription("Melhoria das imagens antes da modelagem")
        .setRequired(false)
        .addChoices(
          { name: "Sem melhoria", value: "none" },
          { name: "Limpeza local", value: "economy" }
        )
    )
    .addIntegerOption(o =>
      o
        .setName("triangles")
        .setDescription("Limite de triangulos. Maximo: 3950")
        .setRequired(false)
        .setMinValue(500)
        .setMaxValue(3950)
    )
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const hiddenCommandNames = new Set([
    // Legacy Portuguese aliases kept in code for old interactions, but hidden from Discord's command menu.
    "refazer_comandos",
    "velvet_saldo",
    "velvet_comprar",
    "velvet_transferir",
    "velvet_sacar",
    "velvet_admin_add",
    "velvet_admin_remover",
    "velvet_admin_compras",
    "velvet_admin_compra",
    "velvet_admin_saques",
    "velvet_admin_saque",
    "copiar",
    "refazer",
    "refazer_preco",
    "refazer_multiview",
    "refazer_mock",
    "modelo_ultimo",
    "refazer_debug",
    // Advanced/duplicate public commands hidden to keep the bot simple for clients.
    "views_custom",
    "remake",
    "bulk_remake",
    "enhance_images",
    "image_model",
    "prompt_model",
    "admin_bulk_views",
    "admin_views_full",
    "admin_code_create",
    "admin_code_disable",
    "admin_codes",
    "admin_gift_cancel",
    "admin_post_guide",
    "admin_post_terms",
    "admin_post_model_starter",
    // Low-use internal finance/admin surfaces.
    "affiliate_withdraw",
    "admin_withdrawals",
    "admin_withdrawal",
  ]);
  const registeredCommands = commands.filter(command => !hiddenCommandNames.has(command.name));

  console.log("Registrando comandos do bot laboratorio...");
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: registeredCommands,
  });

  console.log("Comandos do bot laboratorio registrados.");
}

function apiCreditsFor({ mode, texture, lowPoly }) {
  let credits = 0;

  credits += texture === "none" ? 40 : 50;

  return credits;
}

function userRemakePlan(interaction) {
  if (userIsElite(interaction)) return "elite";
  if (userIsPremium(interaction)) return "premium";
  if (hasRole(interaction, NORMAL_ROLE)) return "basic";
  return "free";
}

function remakeBasePriceForPlan(plan) {
  if (plan === "elite") return PRICE_CONFIG.baseElite;
  if (plan === "premium") return PRICE_CONFIG.basePremium;
  if (plan === "basic") return PRICE_CONFIG.baseBasic;
  return PRICE_CONFIG.baseFree;
}

function remakePlanLabel(plan) {
  if (plan === "elite") return "Elite";
  if (plan === "premium") return "Premium";
  if (plan === "basic") return "Basic";
  return "No subscription";
}

function planForInteraction(interaction) {
  return userRemakePlan(interaction);
}

function normalizeModelQuality(value) {
  const key = cleanEnv(value || "medium").toLowerCase().replace(/[\s-]+/g, "_");
  return MODEL_QUALITY_CONFIG[key] ? key : "medium";
}

function modelQualityConfig(value) {
  return MODEL_QUALITY_CONFIG[normalizeModelQuality(value)] || MODEL_QUALITY_CONFIG.medium;
}

function normalizeAdvancedTexture(value) {
  const key = cleanEnv(value || "none").toLowerCase().replace(/[\s-]+/g, "_");
  return ADVANCED_TEXTURE_CONFIG[key] ? key : "none";
}

function advancedTextureConfig(value) {
  return ADVANCED_TEXTURE_CONFIG[normalizeAdvancedTexture(value)] || ADVANCED_TEXTURE_CONFIG.none;
}

function multiviewExtraForPlan(plan) {
  if (plan === "elite") return PRICE_CONFIG.eliteMultiviewExtra;
  if (plan === "premium") return PRICE_CONFIG.premiumMultiviewExtra;
  if (plan === "basic") return PRICE_CONFIG.basicMultiviewExtra;
  return PRICE_CONFIG.multiviewExtra;
}

function lowPolyExtraForPlan(plan) {
  if (plan === "elite") return PRICE_CONFIG.eliteLowPolyExtra;
  if (plan === "premium") return PRICE_CONFIG.premiumLowPolyExtra;
  if (plan === "basic") return PRICE_CONFIG.basicLowPolyExtra;
  return PRICE_CONFIG.lowPolyExtra;
}

function enhancementExtraForPlan(plan, enhancementConfig) {
  const base = enhancementConfig.priceExtra || 0;
  if (!base) return 0;
  if (enhancementConfig.model === null) return 0;
  if (plan === "elite") return Math.ceil(base * 0.5);
  if (plan === "premium") return Math.ceil(base * 0.8);
  return base;
}

function imageGenerationDiscountForPlan(plan) {
  if (plan === "elite") return 0.65;
  if (plan === "premium") return 0.8;
  if (plan === "basic") return 0.9;
  return 1;
}

function qualityUsesAiEnhancement(quality) {
  return false;
}

function localCleanupPriceForPlan(plan, count) {
  const base = brlToWalletTokens(LOCAL_IMAGE_CLEANUP_PRICE_BRL) * Math.max(0, count);
  return Math.ceil(base * imageGenerationDiscountForPlan(plan));
}

function promptModelBaseBrlForPlan(plan) {
  if (plan === "elite") return 20;
  if (plan === "premium") return 25;
  if (plan === "basic") return 28;
  return PROMPT_MODEL_PRICE / WALLET_TOKENS_PER_BRL;
}

function aiModelPromoUsage(userId) {
  const db = readWalletDb();
  const serviceKeys = new Set(["remake", "multiview", "image_model", "prompt_model"]);
  return db.transactions.filter(transaction =>
    transaction.userId === userId &&
    transaction.type === "debit" &&
    serviceKeys.has(transaction.meta?.serviceKey)
  ).length;
}

function aiModelLaunchPromoFor(interaction) {
  if (!AI_MODEL_LAUNCH_PROMO_ENABLED) return null;

  const used = aiModelPromoUsage(interaction.user.id);
  const remainingFirstSlots = Math.max(AI_MODEL_LAUNCH_PROMO_FIRST_LIMIT - used, 0);
  const roleDiscountActive =
    remainingFirstSlots <= 0 &&
    AI_MODEL_LAUNCH_PROMO_DISCOUNT_ROLE &&
    hasRole(interaction, AI_MODEL_LAUNCH_PROMO_DISCOUNT_ROLE);
  const priceBrl = remainingFirstSlots > 0
    ? AI_MODEL_LAUNCH_PROMO_FIRST_PRICE_BRL
    : roleDiscountActive
      ? AI_MODEL_LAUNCH_PROMO_ROLE_PRICE_BRL
      : AI_MODEL_LAUNCH_PROMO_REGULAR_PRICE_BRL;

  return {
    used,
    remainingFirstSlots,
    firstLimit: AI_MODEL_LAUNCH_PROMO_FIRST_LIMIT,
    roleDiscountActive,
    priceBrl,
    walletAmount: brlToWalletTokens(priceBrl),
    label: remainingFirstSlots > 0
      ? `Launch promo (${used + 1}/${AI_MODEL_LAUNCH_PROMO_FIRST_LIMIT})`
      : roleDiscountActive
        ? "Launch promo role discount"
        : "Launch promo",
  };
}

function applyAiModelLaunchPromo(interaction, quote) {
  const promo = aiModelLaunchPromoFor(interaction);
  if (!promo) return quote;
  const promoExtraBrl = Number(quote.promoExtraBrl || 0);
  const promoExtraWalletAmount = brlToWalletTokens(promoExtraBrl);
  const walletAmount = promo.walletAmount + promoExtraWalletAmount;
  const priceBrl = promo.priceBrl + promoExtraBrl;

  return {
    ...quote,
    promo,
    originalPrice: quote.price ?? quote.priceBrl,
    originalWalletAmount: quote.walletAmount,
    price: priceBrl,
    priceBrl,
    walletAmount,
    estimatedProfitBrl: priceBrl - (quote.estimatedApiCostBrl || 0),
    lines: [
      `${promo.label}: ${formatWalletAmount(promo.priceBrl)}`,
      promo.remainingFirstSlots > 0
        ? `First ${promo.firstLimit} AI models: ${formatWalletAmount(AI_MODEL_LAUNCH_PROMO_FIRST_PRICE_BRL)} each`
        : promo.roleDiscountActive
          ? `Special role price after first ${promo.firstLimit}: ${formatWalletAmount(AI_MODEL_LAUNCH_PROMO_ROLE_PRICE_BRL)} each`
          : `Promo price after first ${promo.firstLimit}: ${formatWalletAmount(AI_MODEL_LAUNCH_PROMO_REGULAR_PRICE_BRL)} each`,
      ...(quote.promoExtraLines || []),
    ],
  };
}

function quoteSnapshotFromQuote(quote, settings = {}) {
  return {
    walletAmount: Number(quote.walletAmount) || 0,
    price: Number(quote.price ?? quote.priceBrl) || 0,
    priceBrl: Number(quote.priceBrl ?? quote.price) || 0,
    originalWalletAmount: Number(quote.originalWalletAmount) || null,
    originalPrice: Number(quote.originalPrice) || null,
    estimatedProfitBrl: Number(quote.estimatedProfitBrl) || null,
    lines: Array.isArray(quote.lines) ? quote.lines.slice() : [],
    promoExtraLines: Array.isArray(quote.promoExtraLines) ? quote.promoExtraLines.slice() : [],
    plan: quote.plan || null,
    planLabel: quote.planLabel || null,
    promo: quote.promo ? {
      used: quote.promo.used,
      remainingFirstSlots: quote.promo.remainingFirstSlots,
      firstLimit: quote.promo.firstLimit,
      roleDiscountActive: quote.promo.roleDiscountActive,
      priceBrl: quote.promo.priceBrl,
      walletAmount: quote.promo.walletAmount,
      label: quote.promo.label,
    } : null,
    settings: {
      mode: settings.mode || null,
      texture: settings.texture || null,
      triangles: settings.triangles || null,
      enhancement: settings.enhancement || null,
      modelQuality: settings.modelQuality || null,
      advancedTexture: settings.advancedTexture || null,
    },
    lockedAt: new Date().toISOString(),
  };
}

function quoteSnapshotMatches(snapshot, settings = {}) {
  if (!snapshot?.walletAmount || !snapshot.settings) return false;
  return ["mode", "texture", "triangles", "enhancement", "modelQuality", "advancedTexture"].every(key =>
    String(snapshot.settings[key] ?? "") === String(settings[key] ?? "")
  );
}

function quoteWithSnapshot(fallbackQuote, snapshot) {
  if (!snapshot?.walletAmount) return fallbackQuote;
  return {
    ...fallbackQuote,
    ...snapshot,
    lines: Array.isArray(snapshot.lines) ? snapshot.lines.slice() : fallbackQuote.lines,
    promoExtraLines: Array.isArray(snapshot.promoExtraLines) ? snapshot.promoExtraLines.slice() : fallbackQuote.promoExtraLines,
  };
}

function estimatedApiCostBrl({ mode, texture, lowPoly, enhancement }) {
  texture = normalizeTextureOption(texture);
  const enhancementConfig = IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none;
  let cost = API_COST_ESTIMATE_BRL.modelStandard;

  if (texture === "none") cost = API_COST_ESTIMATE_BRL.modelNoTexture;
  if (mode === "multiview") cost += API_COST_ESTIMATE_BRL.multiviewExtra;
  if (lowPoly) cost += API_COST_ESTIMATE_BRL.lowPolyExtra;
  cost += enhancementConfig.estimatedCostBrl || 0;

  return cost;
}

function calculatePrice(interaction, { mode, texture, triangles, enhancement, modelQuality, advancedTexture }) {
  texture = normalizeTextureOption(texture);
  const plan = userRemakePlan(interaction);
  const enhancementConfig = IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none;
  const qualityConfig = modelQualityConfig(modelQuality);
  const advancedTextureCfg = advancedTextureConfig(advancedTexture);
  let price = remakeBasePriceForPlan(plan);
  const lines = [`Base ${remakePlanLabel(plan)}: ${formatWalletAmount(price)}`];
  const promoExtraLines = [];
  let promoExtraBrl = 0;

  if (mode === "multiview") {
    const multiviewExtra = multiviewExtraForPlan(plan);
    price += multiviewExtra;
    lines.push(`Multiview: +${formatWalletAmount(multiviewExtra)}`);
  }

  if (texture === "none") {
    price -= PRICE_CONFIG.noTextureDiscount;
    lines.push(`No texture: -${formatWalletAmount(PRICE_CONFIG.noTextureDiscount)}`);
  }

  const lowPoly = Boolean(triangles);

  if (lowPoly) {
    const lowPolyExtra = lowPolyExtraForPlan(plan);
    price += lowPolyExtra;
    lines.push(`Triangle limit (${triangles}): +${formatWalletAmount(lowPolyExtra)}`);
  }

  const enhancementExtra = enhancementExtraForPlan(plan, enhancementConfig);
  if (enhancementExtra > 0) {
    price += enhancementExtra;
    lines.push(`${enhancementConfig.label}: +${formatWalletAmount(enhancementExtra)}`);
  }

  if (qualityConfig.priceExtraBrl > 0) {
    price += qualityConfig.priceExtraBrl;
    const line = `${qualityConfig.label} quality: +${formatWalletAmount(qualityConfig.priceExtraBrl)}`;
    lines.push(line);
    promoExtraLines.push(line);
    promoExtraBrl += qualityConfig.priceExtraBrl;
  }

  if (advancedTextureCfg.priceExtraBrl > 0) {
    price += advancedTextureCfg.priceExtraBrl;
    const line = `${advancedTextureCfg.label}: +${formatWalletAmount(advancedTextureCfg.priceExtraBrl)}`;
    lines.push(line);
    promoExtraLines.push(line);
    promoExtraBrl += advancedTextureCfg.priceExtraBrl;
  }

  const estimatedCost = estimatedApiCostBrl({ mode, texture, lowPoly, enhancement });
  const minimumSafePrice = Math.ceil(estimatedCost + API_COST_ESTIMATE_BRL.minProfit);

  if (price < minimumSafePrice) {
    const safetyExtra = minimumSafePrice - price;
    price = minimumSafePrice;
    lines.push(`Protected minimum margin: +${formatWalletAmount(safetyExtra)}`);
  }

  return applyAiModelLaunchPromo(interaction, {
    premium: plan === "premium",
    plan,
    planLabel: remakePlanLabel(plan),
    price,
    walletAmount: brlToWalletTokens(price),
    lines,
    promoExtraBrl,
    promoExtraLines,
    modelQuality: normalizeModelQuality(modelQuality),
    advancedTexture: normalizeAdvancedTexture(advancedTexture),
    apiCredits: apiCreditsFor({ mode, texture, lowPoly }),
    estimatedApiCostBrl: estimatedCost,
    estimatedProfitBrl: price - estimatedCost,
  });
}

function calculateImageGenerationPrice(interaction, { quality, resolution }) {
  const plan = planForInteraction(interaction);
  const enhancementConfig = IMAGE_ENHANCEMENTS[quality] || IMAGE_ENHANCEMENTS.standard;
  const resolutionConfig = IMAGE_RESOLUTIONS[resolution] || IMAGE_RESOLUTIONS["1K"];
  const rawPrice = IMAGE_GENERATION_PRICE +
    brlToWalletTokens(enhancementConfig.priceExtra || 0) +
    brlToWalletTokens(resolutionConfig.priceExtra || 0);
  const price = Math.ceil(rawPrice * imageGenerationDiscountForPlan(plan));

  return {
    plan,
    planLabel: remakePlanLabel(plan),
    price,
    rawPrice,
    discountTokens: Math.max(0, rawPrice - price),
    enhancementConfig,
    resolutionConfig,
  };
}

function calculateImageEnhancementPrice(interaction, { quality, count }) {
  const plan = planForInteraction(interaction);
  const enhancementConfig = IMAGE_ENHANCEMENTS[quality] || IMAGE_ENHANCEMENTS.standard;
  const baseTokensPerImage = brlToWalletTokens(enhancementConfig.priceExtra || 0);
  const rawPrice = Math.max(0, count) * baseTokensPerImage;
  const price = rawPrice > 0 ? Math.max(1, Math.ceil(rawPrice * imageGenerationDiscountForPlan(plan))) : 0;

  return {
    plan,
    planLabel: remakePlanLabel(plan),
    price,
    rawPrice,
    discountTokens: Math.max(0, rawPrice - price),
    enhancementConfig,
  };
}

function calculatePromptModelPrice(interaction, { texture, triangles }) {
  texture = normalizeTextureOption(texture);
  const plan = planForInteraction(interaction);
  const lowPoly = Boolean(triangles);
  let priceBrl = promptModelBaseBrlForPlan(plan);
  const lines = [`Base ${remakePlanLabel(plan)}: ${formatWalletAmount(priceBrl)}`];

  if (texture === "none") {
    priceBrl -= PRICE_CONFIG.noTextureDiscount;
    lines.push(`No texture: -${formatWalletAmount(PRICE_CONFIG.noTextureDiscount)}`);
  }

  if (lowPoly) {
    const lowPolyExtra = lowPolyExtraForPlan(plan);
    priceBrl += lowPolyExtra;
    lines.push(`Triangle limit (${triangles}): +${formatWalletAmount(lowPolyExtra)}`);
  }

  const estimatedCost = estimatedApiCostBrl({ mode: "single", texture, lowPoly, enhancement: "none" });
  const minimumSafePrice = Math.ceil(estimatedCost + API_COST_ESTIMATE_BRL.minProfit);

  if (priceBrl < minimumSafePrice) {
    const safetyExtra = minimumSafePrice - priceBrl;
    priceBrl = minimumSafePrice;
    lines.push(`Protected minimum margin: +${formatWalletAmount(safetyExtra)}`);
  }

  return applyAiModelLaunchPromo(interaction, {
    plan,
    planLabel: remakePlanLabel(plan),
    priceBrl,
    walletAmount: brlToWalletTokens(priceBrl),
    lines,
    estimatedApiCostBrl: estimatedCost,
    estimatedProfitBrl: priceBrl - estimatedCost,
  });
}

function getSaoPauloDayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function userCopyPlan(interaction) {
  if (userIsElite(interaction)) return "elite";
  if (userHasPremiumAccess(interaction) || userIsAdmin(interaction)) return "premium";
  if (hasRole(interaction, NORMAL_ROLE)) return "basic";
  return "free";
}

function copyUsageFor(user) {
  const dayKey = getSaoPauloDayKey();
  user.copyUsage ||= { day: dayKey, count: 0 };

  if (user.copyUsage.day !== dayKey) {
    user.copyUsage = { day: dayKey, count: 0 };
  }

  return user.copyUsage;
}

function clothingUsageFor(user) {
  const dayKey = getSaoPauloDayKey();
  user.clothingUsage ||= { day: dayKey, count: 0 };

  if (user.clothingUsage.day !== dayKey) {
    user.clothingUsage = { day: dayKey, count: 0 };
  }

  return user.clothingUsage;
}

function sniperUsageFor(user) {
  const dayKey = getSaoPauloDayKey();
  user.sniperUsage ||= { day: dayKey, count: 0 };

  if (user.sniperUsage.day !== dayKey) {
    user.sniperUsage = { day: dayKey, count: 0 };
  }

  return user.sniperUsage;
}

function walletCopyUsage(userId) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const usage = copyUsageFor(user);
  writeWalletDb(db);
  return { day: usage.day, count: usage.count };
}

function walletClothingUsage(userId) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const usage = clothingUsageFor(user);
  writeWalletDb(db);
  return { day: usage.day, count: usage.count };
}

function walletSniperUsage(userId) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const usage = sniperUsageFor(user);
  writeWalletDb(db);
  return { day: usage.day, count: usage.count };
}

function addCopyUsage(userId, count = 1) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const usage = copyUsageFor(user);
  usage.count += count;
  walletTransaction(db, {
    userId,
    type: "usage",
    amount: 0,
    actorId: client.user.id,
    reason: "Daily copy usage",
    meta: { day: usage.day, count, totalToday: usage.count },
  });
  writeWalletDb(db);
  return { day: usage.day, count: usage.count };
}

function addClothingUsage(userId, count = 1) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const usage = clothingUsageFor(user);
  usage.count += count;
  walletTransaction(db, {
    userId,
    type: "usage",
    amount: 0,
    actorId: client.user.id,
    reason: "Daily clothing copy usage",
    meta: { day: usage.day, count, totalToday: usage.count },
  });
  writeWalletDb(db);
  return { day: usage.day, count: usage.count };
}

function addSniperUsage(userId, count = 1) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const usage = sniperUsageFor(user);
  usage.count += count;
  walletTransaction(db, {
    userId,
    type: "usage",
    amount: 0,
    actorId: client.user.id,
    reason: "Daily sniper usage",
    meta: { day: usage.day, count, totalToday: usage.count },
  });
  writeWalletDb(db);
  return { day: usage.day, count: usage.count };
}

function calculateSniperPrice(interaction) {
  if (userIsAdmin(interaction)) {
    const usage = walletSniperUsage(interaction.user.id);
    return {
      plan: "owner",
      planLabel: "Owner",
      dailyLimit: null,
      usedToday: usage.count,
      remaining: null,
      walletAmount: 0,
    };
  }

  const planKey = userCopyPlan(interaction);
  const plan = SNIPER_PLAN_CONFIG[planKey] || SNIPER_PLAN_CONFIG.free;
  const usage = walletSniperUsage(interaction.user.id);
  const remaining = Math.max(plan.dailyLimit - usage.count, 0);

  return {
    plan: planKey,
    planLabel: plan.label,
    dailyLimit: plan.dailyLimit,
    usedToday: usage.count,
    remaining,
    walletAmount: plan.walletAmount,
  };
}

function calculateCopyPrice(interaction, usedTodayOverride) {
  const planKey = userCopyPlan(interaction);
  const plan = COPY_PLAN_CONFIG[planKey];
  const usedToday = usedTodayOverride ?? walletCopyUsage(interaction.user.id).count;
  const freeRemaining = plan.dailyLimit === null ? null : Math.max(plan.dailyLimit - usedToday, 0);
  const price = plan.dailyLimit === null || freeRemaining > 0 ? 0 : plan.overLimitPrice;

  return {
    plan: planKey,
    planLabel: plan.label,
    dailyLimit: plan.dailyLimit,
    usedToday,
    freeRemaining,
    price,
    walletAmount: brlToWalletTokens(price),
  };
}

function calculateClothingCopyPrice(interaction, usedTodayOverride) {
  const planKey = userCopyPlan(interaction);
  const plan = CLOTHING_COPY_PLAN_CONFIG[planKey];
  const usedToday = usedTodayOverride ?? walletClothingUsage(interaction.user.id).count;
  const freeRemaining = plan.dailyLimit === null ? null : Math.max(plan.dailyLimit - usedToday, 0);
  const walletAmount = plan.dailyLimit === null || freeRemaining > 0 ? 0 : plan.overLimitTokens;

  return {
    plan: planKey,
    planLabel: plan.label,
    dailyLimit: plan.dailyLimit,
    usedToday,
    freeRemaining,
    walletAmount,
  };
}

function calculateBulkClothingCopyPrice(interaction, count, usedTodayOverride) {
  const planKey = userCopyPlan(interaction);
  const plan = CLOTHING_COPY_PLAN_CONFIG[planKey];
  const usedToday = usedTodayOverride ?? walletClothingUsage(interaction.user.id).count;
  const freeRemaining = plan.dailyLimit === null ? null : Math.max(plan.dailyLimit - usedToday, 0);
  const paidCount = plan.dailyLimit === null ? 0 : Math.max(count - freeRemaining, 0);
  const walletAmount = paidCount * plan.overLimitTokens;

  return {
    plan: planKey,
    planLabel: plan.label,
    dailyLimit: plan.dailyLimit,
    usedToday,
    freeRemaining,
    count,
    paidCount,
    freeCount: count - paidCount,
    walletAmount,
    perPaidItem: plan.overLimitTokens,
  };
}

function bulkClothingLimitFor(interaction) {
  const planKey = userCopyPlan(interaction);
  if (planKey === "elite") return Math.min(ELITE_BULK_CLOTHING_LIMIT, BULK_CLOTHING_LIMIT);
  if (planKey === "premium") return Math.min(PREMIUM_BULK_CLOTHING_LIMIT, BULK_CLOTHING_LIMIT);
  if (planKey === "basic") return Math.min(BASIC_BULK_CLOTHING_LIMIT, BULK_CLOTHING_LIMIT);
  return Math.min(FREE_BULK_CLOTHING_LIMIT, BULK_CLOTHING_LIMIT);
}

function bulkAssetLimitFor(interaction) {
  const planKey = userCopyPlan(interaction);
  if (planKey === "elite") return Math.min(ELITE_BULK_ASSET_LIMIT, BULK_ASSET_LIMIT);
  if (planKey === "premium") return Math.min(PREMIUM_BULK_ASSET_LIMIT, BULK_ASSET_LIMIT);
  if (planKey === "basic") return Math.min(BASIC_BULK_ASSET_LIMIT, BULK_ASSET_LIMIT);
  return Math.min(FREE_BULK_ASSET_LIMIT, BULK_ASSET_LIMIT);
}

function localizedLineLabels(language) {
  if (language === "pt-BR") {
    return {
      plan: "Plano",
      dailyCopies: "Copias diarias",
      dailyClothingCopies: "Copias de roupa diarias",
      freeCopiesToday: "Copias gratis hoje",
      freeClothingCopiesToday: "Copias de roupa gratis hoje",
      freeRemainingBeforeCopy: "Gratis restantes antes desta copia",
      freeRemainingBeforeBulk: "Gratis restantes antes deste lote",
      bulkAmount: "Quantidade em lote",
      paidCopies: "Copias pagas",
      pricePerPaidCopy: "Preco por copia paga",
      unlimited: "ilimitadas",
    };
  }
  if (language === "es") {
    return {
      plan: "Plan",
      dailyCopies: "Copias diarias",
      dailyClothingCopies: "Copias de ropa diarias",
      freeCopiesToday: "Copias gratis hoy",
      freeClothingCopiesToday: "Copias de ropa gratis hoy",
      freeRemainingBeforeCopy: "Gratis restantes antes de esta copia",
      freeRemainingBeforeBulk: "Gratis restantes antes de este lote",
      bulkAmount: "Cantidad del lote",
      paidCopies: "Copias pagadas",
      pricePerPaidCopy: "Precio por copia pagada",
      unlimited: "ilimitadas",
    };
  }
  return {
    plan: "Plan",
    dailyCopies: "Daily copies",
    dailyClothingCopies: "Daily clothing copies",
    freeCopiesToday: "Free copies today",
    freeClothingCopiesToday: "Free clothing copies today",
    freeRemainingBeforeCopy: "Free remaining before this copy",
    freeRemainingBeforeBulk: "Free remaining before this bulk",
    bulkAmount: "Bulk amount",
    paidCopies: "Paid copies",
    pricePerPaidCopy: "Price per paid copy",
    unlimited: "unlimited",
  };
}

function formatCopyAllowance(quote, language = "en") {
  const labels = localizedLineLabels(language);
  if (quote.dailyLimit === null) {
    return [
      `**${labels.plan}:** ${quote.planLabel}`,
      `**${labels.dailyCopies}:** ${labels.unlimited}`,
    ].join("\n");
  }

  return [
    `**${labels.plan}:** ${quote.planLabel}`,
    `**${labels.freeCopiesToday}:** ${Math.min(quote.usedToday, quote.dailyLimit)}/${quote.dailyLimit}`,
    `**${labels.freeRemainingBeforeCopy}:** ${quote.freeRemaining}`,
  ].join("\n");
}

function formatClothingAllowance(quote, language = "en") {
  const labels = localizedLineLabels(language);
  if (quote.dailyLimit === null) {
    return [
      `**${labels.plan}:** ${quote.planLabel}`,
      `**${labels.dailyClothingCopies}:** ${labels.unlimited}`,
    ].join("\n");
  }

  return [
    `**${labels.plan}:** ${quote.planLabel}`,
    `**${labels.freeClothingCopiesToday}:** ${Math.min(quote.usedToday, quote.dailyLimit)}/${quote.dailyLimit}`,
    `**${labels.freeRemainingBeforeCopy}:** ${quote.freeRemaining}`,
  ].filter(line => line !== null).join("\n");
}

function formatBulkClothingAllowance(quote, language = "en") {
  const labels = localizedLineLabels(language);
  const base = quote.dailyLimit === null
    ? [
      `**${labels.plan}:** ${quote.planLabel}`,
      `**${labels.dailyClothingCopies}:** ${labels.unlimited}`,
    ]
    : [
      `**${labels.plan}:** ${quote.planLabel}`,
      `**${labels.freeClothingCopiesToday}:** ${Math.min(quote.usedToday, quote.dailyLimit)}/${quote.dailyLimit}`,
      `**${labels.freeRemainingBeforeBulk}:** ${quote.freeRemaining}`,
    ];

  return [
    ...base,
    `**${labels.bulkAmount}:** ${quote.count}`,
    `**${labels.paidCopies}:** ${quote.paidCount}`,
    quote.paidCount ? `**${labels.pricePerPaidCopy}:** ${formatTokenAmount(quote.perPaidItem)}` : null,
  ].filter(Boolean).join("\n");
}

function brlToWalletTokens(value) {
  return Math.ceil(value * WALLET_TOKENS_PER_BRL);
}

function formatWalletAmount(value) {
  return formatTokenAmount(brlToWalletTokens(value));
}

function normalizeTextureOption(texture) {
  return texture === "none" ? "none" : "standard";
}

function emptyWalletDb() {
  return {
    users: {},
    purchaseRequests: [],
    withdrawalRequests: [],
    affiliateWithdrawals: [],
    promoCodes: {},
    giftCodes: {},
    clothingTemplateActions: {},
    transactions: [],
  };
}

function readWalletDb() {
  if (!fs.existsSync(WALLET_DB_PATH)) return emptyWalletDb();

  try {
    return { ...emptyWalletDb(), ...JSON.parse(fs.readFileSync(WALLET_DB_PATH, "utf8")) };
  } catch (err) {
    console.error("Erro ao ler carteira:", err);
    return emptyWalletDb();
  }
}

function writeWalletDb(db) {
  fs.mkdirSync(path.dirname(WALLET_DB_PATH), { recursive: true });
  fs.writeFileSync(WALLET_DB_PATH, JSON.stringify(db, null, 2));
}

function walletUser(db, userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: 0,
      serviceCredits: [],
      language: DEFAULT_LANGUAGE,
      languageConfirmed: false,
      currency: DEFAULT_CURRENCY,
      affiliateCode: null,
      referredBy: null,
      affiliateBalance: 0,
      createdAt: new Date().toISOString(),
    };
  }

  db.users[userId].language ||= DEFAULT_LANGUAGE;
  db.users[userId].languageConfirmed = db.users[userId].languageConfirmed === true;
  db.users[userId].currency ||= DEFAULT_CURRENCY;
  db.users[userId].affiliateBalance ||= 0;
  db.users[userId].serviceCredits ||= [];
  copyUsageFor(db.users[userId]);
  clothingUsageFor(db.users[userId]);
  sniperUsageFor(db.users[userId]);

  return db.users[userId];
}

function normalizePromoCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function promoCodeList(db) {
  db.promoCodes ||= {};
  return db.promoCodes;
}

function giftCodeList(db) {
  db.giftCodes ||= {};
  return db.giftCodes;
}

function clothingTemplateActionList(db) {
  db.clothingTemplateActions ||= {};
  return db.clothingTemplateActions;
}

function createClothingTemplateAction({ userId, result, source = "single" }) {
  const db = readWalletDb();
  const actions = clothingTemplateActionList(db);
  const actionId = crypto.randomBytes(8).toString("hex");

  actions[actionId] = {
    id: actionId,
    userId,
    catalogId: result.catalogId,
    templateId: result.templateId,
    assetTypeId: result.assetTypeId,
    typeLabel: result.typeLabel,
    name: result.name,
    creator: result.creator,
    filePath: result.filePath,
    source,
    used: false,
    createdAt: new Date().toISOString(),
  };

  writeWalletDb(db);
  return actions[actionId];
}

function getClothingTemplateAction(actionId) {
  const db = readWalletDb();
  return clothingTemplateActionList(db)[actionId] || null;
}

function markClothingTemplateActionUsed(actionId) {
  const db = readWalletDb();
  const action = clothingTemplateActionList(db)[actionId];
  if (!action) return null;
  action.used = true;
  action.usedAt = new Date().toISOString();
  writeWalletDb(db);
  return action;
}

function clothingResetButton(actionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`clothing_reset:${actionId}`)
      .setLabel("Reset Template")
      .setStyle(ButtonStyle.Secondary)
  );
}

function clothingResetButtonRows(actions, offset = 0) {
  const buttons = actions
    .slice(0, 15)
    .map((action, index) =>
      new ButtonBuilder()
        .setCustomId(`clothing_reset:${action.id}`)
        .setLabel(`Reset ${offset + index + 1}`)
        .setStyle(ButtonStyle.Secondary)
    );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

function normalizeServiceScopes(input) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(/[,\s]+/);
  const scopes = raw
    .map(item => String(item || "").trim().toLowerCase().replace(/-/g, "_"))
    .filter(Boolean)
    .map(item => {
      if (["ugc", "asset", "assets", "steal", "copiar"].includes(item)) return "copy";
      if (["clothes", "roupa", "roupas", "steal_clothing"].includes(item)) return "clothing";
      if (["refazer", "single", "ai_remake"].includes(item)) return "remake";
      if (["multi", "refazer_multiview"].includes(item)) return "multiview";
      if (["image_model", "single_image", "single_image_model", "one_image"].includes(item)) return "image_model";
      if (["prompt", "text", "text_model"].includes(item)) return "prompt_model";
      if (["images", "generate_image"].includes(item)) return "image";
      if (["enhance", "cleanup", "clean", "enhance_images"].includes(item)) return "enhancement";
      if (["market", "radar", "market_sniper"].includes(item)) return "sniper";
      return item;
    })
    .filter(item => SERVICE_CREDIT_SCOPES[item]);

  return [...new Set(scopes)];
}

function formatServiceScopes(scopes) {
  const normalized = normalizeServiceScopes(scopes);
  if (!normalized.length) return "Service credit balance";
  if (normalized.includes("all")) return SERVICE_CREDIT_SCOPES.all;
  return normalized.map(scope => SERVICE_CREDIT_SCOPES[scope] || scope).join(", ");
}

function serviceScopeMatches(scopes, serviceKey) {
  const normalized = normalizeServiceScopes(scopes);
  if (!normalized.length) return false;
  return normalized.includes("all") || normalized.includes(serviceKey);
}

function serviceCreditBalanceFor(user, serviceKey) {
  if (!serviceKey) return 0;
  return (user.serviceCredits || []).reduce((sum, credit) => {
    if (!credit.active || credit.remaining <= 0) return sum;
    return serviceScopeMatches(credit.services, serviceKey) ? sum + credit.remaining : sum;
  }, 0);
}

function walletAvailableBalance(userId, serviceKey = null) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  return user.balance + serviceCreditBalanceFor(user, serviceKey);
}

function createPromoCode({ code, amount, maxUses, actorId, note, services }) {
  const normalized = normalizePromoCode(code);
  if (!normalized) return { ok: false, reason: "Invalid code. Use letters, numbers, _ or -." };
  const serviceScopes = normalizeServiceScopes(services);
  if (services && !serviceScopes.length) {
    return {
      ok: false,
      reason: `Invalid service scope. Use: ${Object.keys(SERVICE_CREDIT_SCOPES).join(", ")}.`,
    };
  }

  const db = readWalletDb();
  const codes = promoCodeList(db);
  if (codes[normalized]?.active) {
    return { ok: false, reason: "This code already exists and is active." };
  }

  codes[normalized] = {
    code: normalized,
    amount,
    maxUses,
    usedBy: [],
    active: true,
    note: note || "",
    services: serviceScopes,
    createdBy: actorId,
    createdAt: new Date().toISOString(),
    disabledAt: null,
  };

  walletTransaction(db, {
    userId: actorId,
    type: "promo_code_created",
    amount: 0,
    actorId,
    reason: `Promo code ${normalized} created`,
    meta: { code: normalized, amount, maxUses, note: note || "", services: serviceScopes },
  });

  writeWalletDb(db);
  return { ok: true, promo: codes[normalized] };
}

function disablePromoCode({ code, actorId }) {
  const normalized = normalizePromoCode(code);
  const db = readWalletDb();
  const codes = promoCodeList(db);
  const promo = codes[normalized];

  if (!promo) return { ok: false, reason: "Code not found." };
  if (!promo.active) return { ok: false, reason: "Code is already disabled." };

  promo.active = false;
  promo.disabledBy = actorId;
  promo.disabledAt = new Date().toISOString();

  walletTransaction(db, {
    userId: actorId,
    type: "promo_code_disabled",
    amount: 0,
    actorId,
    reason: `Promo code ${normalized} disabled`,
    meta: { code: normalized },
  });

  writeWalletDb(db);
  return { ok: true, promo };
}

function redeemPromoCode({ userId, code }) {
  const normalized = normalizePromoCode(code);
  const db = readWalletDb();
  const codes = promoCodeList(db);
  const promo = codes[normalized];

  if (!promo || !promo.active) return { ok: false, reason: "This code is invalid or inactive." };

  promo.usedBy ||= [];
  if (promo.usedBy.includes(userId)) {
    return { ok: false, reason: "You already redeemed this code." };
  }

  if (promo.usedBy.length >= promo.maxUses) {
    promo.active = false;
    promo.disabledAt = new Date().toISOString();
    writeWalletDb(db);
    return { ok: false, reason: "This code reached its usage limit." };
  }

  const user = walletUser(db, userId);
  if (normalizeServiceScopes(promo.services).length) {
    user.serviceCredits ||= [];
    user.serviceCredits.push({
      id: `${normalized}-${Date.now()}`,
      code: normalized,
      amount: promo.amount,
      remaining: promo.amount,
      services: normalizeServiceScopes(promo.services),
      active: true,
      createdAt: new Date().toISOString(),
    });
  } else {
    user.balance += promo.amount;
  }
  promo.usedBy.push(userId);
  if (promo.usedBy.length >= promo.maxUses) {
    promo.active = false;
    promo.disabledAt = new Date().toISOString();
  }

  walletTransaction(db, {
    userId,
    type: "promo_code_redeemed",
    amount: promo.amount,
    actorId: userId,
    reason: `Promo code ${normalized} redeemed`,
    meta: { code: normalized, services: normalizeServiceScopes(promo.services) },
  });

  writeWalletDb(db);
  return { ok: true, promo, balance: user.balance, serviceCredits: user.serviceCredits || [] };
}

function generateGiftCode(db) {
  const gifts = giftCodeList(db);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `GIFT-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    if (!gifts[code]) return code;
  }
  return `GIFT-${Date.now().toString(36).toUpperCase()}`;
}

function giftExpirationDate(days) {
  const safeDays = clampNumber(days, 1, GIFT_CODE_MAX_EXPIRATION_DAYS, GIFT_CODE_DEFAULT_EXPIRATION_DAYS);
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

function expireGiftCode(db, gift, actorId = "system") {
  if (!gift || gift.status !== "active") return false;
  if (!gift.expiresAt || Date.parse(gift.expiresAt) > Date.now()) return false;

  const sender = walletUser(db, gift.senderId);
  sender.balance += gift.amount;
  gift.status = "expired";
  gift.refundedAt = new Date().toISOString();
  gift.resolvedBy = actorId;

  walletTransaction(db, {
    userId: gift.senderId,
    type: "gift_expired_refund",
    amount: gift.amount,
    actorId,
    reason: `Gift code ${gift.code} expired and was refunded`,
    meta: { code: gift.code, recipientId: gift.recipientId },
  });
  return true;
}

function createGiftCode({ senderId, recipientId, amount, expiresDays }) {
  const db = readWalletDb();
  const sender = walletUser(db, senderId);

  if (sender.balance < amount) {
    return { ok: false, reason: "Insufficient Service Credits.", balance: sender.balance };
  }

  const gifts = giftCodeList(db);
  const code = generateGiftCode(db);
  const gift = {
    code,
    senderId,
    recipientId,
    amount,
    status: "active",
    createdAt: new Date().toISOString(),
    expiresAt: giftExpirationDate(expiresDays),
    redeemedAt: null,
    canceledAt: null,
    refundedAt: null,
  };

  sender.balance -= amount;
  gifts[code] = gift;

  walletTransaction(db, {
    userId: senderId,
    type: "gift_created",
    amount: -amount,
    actorId: senderId,
    reason: `Gift code ${code} created for ${recipientId}`,
    meta: { code, recipientId },
  });

  writeWalletDb(db);
  return { ok: true, gift, balance: sender.balance };
}

function redeemGiftCode({ userId, code }) {
  const normalized = normalizePromoCode(code);
  const db = readWalletDb();
  const gifts = giftCodeList(db);
  const gift = gifts[normalized];

  if (!gift) return { ok: false, reason: "Gift code not found." };
  if (gift.status !== "active") return { ok: false, reason: `This gift code is ${gift.status}.` };
  if (expireGiftCode(db, gift, userId)) {
    writeWalletDb(db);
    return { ok: false, reason: "This gift code expired and was refunded to the sender." };
  }
  if (gift.recipientId !== userId) {
    return { ok: false, reason: "This gift code belongs to another user." };
  }

  const user = walletUser(db, userId);
  user.balance += gift.amount;
  gift.status = "redeemed";
  gift.redeemedAt = new Date().toISOString();

  walletTransaction(db, {
    userId,
    type: "gift_redeemed",
    amount: gift.amount,
    actorId: userId,
    reason: `Gift code ${normalized} redeemed`,
    meta: { code: normalized, senderId: gift.senderId },
  });

  writeWalletDb(db);
  return { ok: true, gift, balance: user.balance };
}

function cancelGiftCode({ code, actorId, reason = "" }) {
  const normalized = normalizePromoCode(code);
  const db = readWalletDb();
  const gifts = giftCodeList(db);
  const gift = gifts[normalized];

  if (!gift) return { ok: false, reason: "Gift code not found." };
  if (gift.status !== "active") return { ok: false, reason: `This gift code is already ${gift.status}.` };

  const sender = walletUser(db, gift.senderId);
  sender.balance += gift.amount;
  gift.status = "canceled";
  gift.canceledAt = new Date().toISOString();
  gift.refundedAt = new Date().toISOString();
  gift.resolvedBy = actorId;
  gift.reason = reason;

  walletTransaction(db, {
    userId: gift.senderId,
    type: "gift_canceled_refund",
    amount: gift.amount,
    actorId,
    reason: reason || `Gift code ${normalized} canceled`,
    meta: { code: normalized, recipientId: gift.recipientId },
  });

  writeWalletDb(db);
  return { ok: true, gift, balance: sender.balance };
}

function walletBalance(userId) {
  const db = readWalletDb();
  return walletUser(db, userId).balance;
}

function walletServiceCreditsSummary(userId) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const activeCredits = (user.serviceCredits || [])
    .filter(credit => credit.active && credit.remaining > 0)
    .slice(0, 8);
  if (!activeCredits.length) return "";

  return activeCredits
    .map(credit => `- \`${credit.code}\`: ${formatTokenAmount(credit.remaining)} for ${formatServiceScopes(credit.services)}`)
    .join("\n");
}

function walletPreferences(userId) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  return {
    language: user.language || DEFAULT_LANGUAGE,
    languageConfirmed: user.languageConfirmed === true,
    currency: user.currency || DEFAULT_CURRENCY,
    textureTone: normalizeTextureTone(user.textureTone || DEFAULT_TEXTURE_TONE),
    textureAdjustments: normalizeTextureAdjustments(user.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS),
    advancedTexturePrompt: user.advancedTexturePrompt !== false,
    renderSettings: {
      ...DEFAULT_RENDER_SETTINGS,
      ...(user.renderSettings || {}),
    },
  };
}

function updateWalletPreferences(userId, updates) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  if (updates.language) {
    user.language = normalizeLanguage(updates.language);
    user.languageConfirmed = ["en", "pt-BR", "es"].includes(user.language);
  }
  if (updates.currency && CURRENCIES[updates.currency]) user.currency = updates.currency;
  if (updates.textureTone) user.textureTone = normalizeTextureTone(updates.textureTone);
  if (updates.textureAdjustments) {
    user.textureAdjustments = normalizeTextureAdjustments({
      ...(user.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS),
      ...updates.textureAdjustments,
    });
  }
  if (typeof updates.advancedTexturePrompt === "boolean") {
    user.advancedTexturePrompt = updates.advancedTexturePrompt;
  }
  if (updates.renderSettings) {
    user.renderSettings = normalizeRenderSettings({
      ...DEFAULT_RENDER_SETTINGS,
      ...(user.renderSettings || {}),
      ...updates.renderSettings,
    });
  }
  writeWalletDb(db);
  return {
    language: user.language,
    languageConfirmed: user.languageConfirmed === true,
    currency: user.currency,
    textureTone: normalizeTextureTone(user.textureTone || DEFAULT_TEXTURE_TONE),
    textureAdjustments: normalizeTextureAdjustments(user.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS),
    advancedTexturePrompt: user.advancedTexturePrompt !== false,
    renderSettings: {
      ...DEFAULT_RENDER_SETTINGS,
      ...(user.renderSettings || {}),
    },
  };
}

function normalizeLanguage(value) {
  const lang = cleanEnv(value).toLowerCase();
  if (lang === "pt" || lang === "pt-br" || lang === "pt_br") return "pt-BR";
  if (lang === "es" || lang.startsWith("es-") || lang.startsWith("es_")) return "es";
  if (lang === "en" || lang.startsWith("en-") || lang.startsWith("en_")) return "en";
  return "auto";
}

function languageFromDiscordLocale(locale) {
  const lang = normalizeLanguage(locale);
  return lang === "auto" ? "" : lang;
}

function languageFor(interaction) {
  const prefs = walletPreferences(interaction.user.id);
  const saved = normalizeLanguage(prefs.language);
  if (saved !== "auto") return saved;

  const localeLanguage = languageFromDiscordLocale(interaction.locale || interaction.guildLocale);
  if (localeLanguage) return localeLanguage;

  if (prefs.currency === "BRL") return "pt-BR";
  return "en";
}

function languageLabel(language) {
  if (language === "pt-BR") return "Português do Brasil";
  if (language === "es") return "Español";
  if (language === "en") return "English";
  return "Auto";
}

function userHasConfirmedLanguage(userId) {
  return walletPreferences(userId).languageConfirmed === true;
}

function languageSetupRequiredMessage() {
  return [
    "# 🌐 Choose Your Language",
    "**Before using Velvet services, please choose your bot language.**",
    "",
    "## Available Languages",
    "> **English** - international support and USD/EUR/GBP flows.",
    "> **Português do Brasil** - recomendado para BRL, Pix e Mercado Pago.",
    "> **Español** - soporte para clientes hispanohablantes.",
    "",
    "## How To Continue",
    "Use `/settings language:` and select your preferred language.",
    "",
    "You can change this anytime with `/settings`.",
  ].join("\n");
}

function formatSettingsMessage({ prefs, resolvedLanguage }) {
  const language = normalizeLanguage(resolvedLanguage);
  if (language === "pt-BR") {
    return [
      "# ⚙️ Configurações Velvet",
      uiLine("Idioma", languageLabel(resolvedLanguage)),
      uiLine("Moeda", prefs.currency),
      "",
      "## Textura",
      uiLine("Tom", textureToneSummary(prefs.textureTone, language)),
      uiLine("Controles", textureAdjustmentsSummary(prefs.textureAdjustments, language)),
      "",
      "## Render Padrão",
      renderSettingsSummary(prefs.renderSettings, language),
      "",
      "## Geração 3D",
      uiLine("Oferta de textura avançada", prefs.advancedTexturePrompt ? "Ativada antes da geração" : "Oculta"),
      "",
      `Previews de pagamento usarão **${prefs.currency}**. As mensagens do bot usarão **${languageLabel(resolvedLanguage)}** quando houver tradução disponível.`,
    ].join("\n");
  }

  if (language === "es") {
    return [
      "# ⚙️ Configuración Velvet",
      uiLine("Idioma", languageLabel(resolvedLanguage)),
      uiLine("Moneda", prefs.currency),
      "",
      "## Textura",
      uiLine("Tono", textureToneSummary(prefs.textureTone, language)),
      uiLine("Controles", textureAdjustmentsSummary(prefs.textureAdjustments, language)),
      "",
      "## Render Predeterminado",
      renderSettingsSummary(prefs.renderSettings, language),
      "",
      "## Generación 3D",
      uiLine("Oferta de textura avanzada", prefs.advancedTexturePrompt ? "Visible antes de generar" : "Oculta"),
      "",
      `Las vistas de pago usarán **${prefs.currency}**. Los mensajes del bot usarán **${languageLabel(resolvedLanguage)}** cuando la traducción esté disponible.`,
    ].join("\n");
  }

  return [
    "# ⚙️ Velvet Settings",
    uiLine("Language", languageLabel(resolvedLanguage)),
    uiLine("Currency", prefs.currency),
    "",
    "## Texture",
    uiLine("Tone", textureToneSummary(prefs.textureTone, language)),
    uiLine("Controls", textureAdjustmentsSummary(prefs.textureAdjustments, language)),
    "",
    "## Render Defaults",
    renderSettingsSummary(prefs.renderSettings, language),
    "",
    "## 3D Generation",
    uiLine("Advanced texture offer", prefs.advancedTexturePrompt ? "Shown before generation" : "Hidden"),
    "",
    `Payment previews will use **${prefs.currency}**. Bot messages will use **${languageLabel(resolvedLanguage)}** when localization is available.`,
  ].join("\n");
}

const LANGUAGE_SETUP_BYPASS_COMMANDS = new Set([
  "settings",
  "commands",
  "refazer_comandos",
]);

function commandRequiresConfirmedLanguage(interaction) {
  if (!interaction?.isChatInputCommand?.()) return false;
  if (LANGUAGE_SETUP_BYPASS_COMMANDS.has(interaction.commandName)) return false;
  if (userIsAdmin(interaction)) return false;
  return !userHasConfirmedLanguage(interaction.user.id);
}

function currencyFor(interaction, selectedCurrency) {
  const prefs = walletPreferences(interaction.user.id);
  return CURRENCIES[selectedCurrency] ? selectedCurrency : prefs.currency || DEFAULT_CURRENCY;
}

function paymentProviderFor(selectedProvider) {
  const selected = String(selectedProvider || "").toLowerCase();
  const provider = selected && selected !== "default"
    ? selected
    : String(PAYMENT_PROVIDER || "stripe").toLowerCase();
  return ["stripe", "mercadopago", "mercadopago_pix"].includes(provider) ? provider : "stripe";
}

function paymentProviderLabel(provider) {
  if (provider === "mercadopago_pix") return "Mercado Pago Pix";
  return provider === "mercadopago" ? "Mercado Pago" : "Stripe";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeTextureTone(value) {
  const key = String(value || "").toLowerCase();
  return TEXTURE_TONES[key] ? key : DEFAULT_TEXTURE_TONE;
}

function normalizeTextureAdjustments(value = {}) {
  return {
    saturation: clampNumber(value.saturation, 0.5, 1.5, DEFAULT_TEXTURE_ADJUSTMENTS.saturation),
    value: clampNumber(value.value, 0.6, 1.6, DEFAULT_TEXTURE_ADJUSTMENTS.value),
  };
}

function textureToneForInteraction(interaction) {
  const prefs = walletPreferences(interaction.user.id);
  const selected = interaction.options.getString("texture_tone");
  return selected && selected !== "default"
    ? normalizeTextureTone(selected)
    : normalizeTextureTone(prefs.textureTone);
}

function textureAdjustmentsForInteraction(interaction) {
  const prefs = walletPreferences(interaction.user.id);
  const base = normalizeTextureAdjustments(prefs.textureAdjustments);

  return normalizeTextureAdjustments({
    saturation: interaction.options.getNumber("texture_saturation") ?? base.saturation,
    value: interaction.options.getNumber("texture_value") ?? base.value,
  });
}

function explicitTextureToneForInteraction(interaction, fallback = DEFAULT_TEXTURE_TONE) {
  const selected = interaction.options.getString("texture_tone");
  return selected && selected !== "default" ? normalizeTextureTone(selected) : normalizeTextureTone(fallback);
}

function explicitTextureAdjustmentsForInteraction(interaction, fallback = DEFAULT_TEXTURE_ADJUSTMENTS) {
  return normalizeTextureAdjustments({
    saturation: interaction.options.getNumber("texture_saturation") ?? fallback.saturation,
    value: interaction.options.getNumber("texture_value") ?? fallback.value,
  });
}

function textureToneSummary(textureTone, language = "en") {
  const key = normalizeTextureTone(textureTone);
  const label = TEXTURE_TONES[key]?.label || TEXTURE_TONES[DEFAULT_TEXTURE_TONE].label;
  if (language === "pt-BR") {
    if (key === "normal") return "Roblox Seguro";
    if (key === "brighter") return "Mais claro";
    if (key === "vibrant") return "Vibrante";
  }
  if (language === "es") {
    if (key === "normal") return "Roblox Seguro";
    if (key === "brighter") return "Mas claro";
    if (key === "vibrant") return "Vibrante";
  }
  return label;
}

function textureAdjustmentsSummary(adjustments, language = "en") {
  const normalized = normalizeTextureAdjustments(adjustments);
  if (language === "pt-BR") {
    return `Saturacao ${normalized.saturation.toFixed(2)}x, Valor ${normalized.value.toFixed(2)}x`;
  }
  if (language === "es") {
    return `Saturacion ${normalized.saturation.toFixed(2)}x, Valor ${normalized.value.toFixed(2)}x`;
  }
  return `Saturation ${normalized.saturation.toFixed(2)}x, Value ${normalized.value.toFixed(2)}x`;
}

function normalizeRenderSettings(settings = {}) {
  const lighting = ["studio", "soft", "dramatic", "flat"].includes(settings.lighting)
    ? settings.lighting
    : DEFAULT_RENDER_SETTINGS.lighting;
  const pov = ["normal", "close", "wide", "top_down"].includes(settings.pov)
    ? settings.pov
    : DEFAULT_RENDER_SETTINGS.pov;

  return {
    lighting,
    pov,
    ior: clampNumber(settings.ior, 1, 2.5, DEFAULT_RENDER_SETTINGS.ior),
    roughness: clampNumber(settings.roughness, 0, 1, DEFAULT_RENDER_SETTINGS.roughness),
    exposure: clampNumber(settings.exposure, -1, 1, DEFAULT_RENDER_SETTINGS.exposure),
    lightPower: clampNumber(settings.lightPower, 0.2, 3, DEFAULT_RENDER_SETTINGS.lightPower),
  };
}

function renderSettingsForInteraction(interaction) {
  const prefs = walletPreferences(interaction.user.id);
  const base = normalizeRenderSettings(prefs.renderSettings);
  const lighting = interaction.options.getString("lighting");
  const pov = interaction.options.getString("pov");

  return normalizeRenderSettings({
    ...base,
    lighting: lighting && lighting !== "default" ? lighting : base.lighting,
    pov: pov && pov !== "default" ? pov : base.pov,
    ior: interaction.options.getNumber("ior") ?? base.ior,
    roughness: interaction.options.getNumber("roughness") ?? base.roughness,
    exposure: interaction.options.getNumber("exposure") ?? base.exposure,
    lightPower: interaction.options.getNumber("light_power") ?? base.lightPower,
  });
}

function renderSettingsSummary(settings, language = "en") {
  const labels = language === "pt-BR"
    ? {
      lighting: "Iluminacao",
      pov: "POV",
      ior: "IOR",
      roughness: "Rugosidade",
      exposure: "Exposicao",
      lightPower: "Potencia da luz",
    }
    : language === "es"
      ? {
        lighting: "Iluminacion",
        pov: "POV",
        ior: "IOR",
        roughness: "Rugosidad",
        exposure: "Exposicion",
        lightPower: "Potencia de luz",
      }
      : {
        lighting: "Lighting",
        pov: "POV",
        ior: "IOR",
        roughness: "Roughness",
        exposure: "Exposure",
        lightPower: "Light power",
      };
  return [
    `${labels.lighting}: ${settings.lighting}`,
    `${labels.pov}: ${settings.pov}`,
    `${labels.ior}: ${settings.ior}`,
    `${labels.roughness}: ${settings.roughness}`,
    `${labels.exposure}: ${settings.exposure}`,
    `${labels.lightPower}: ${settings.lightPower}`,
  ].join("\n");
}

function walletTransaction(db, { userId, type, amount, actorId, reason, meta }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    type,
    amount,
    actorId,
    reason: reason || "",
    meta: meta || {},
    createdAt: new Date().toISOString(),
  };
  db.transactions.push(entry);
  return entry;
}

function addWalletBalance({ userId, amount, actorId, reason, meta }) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  user.balance += amount;
  walletTransaction(db, { userId, type: "credit", amount, actorId, reason, meta });
  writeWalletDb(db);
  return user.balance;
}

function removeWalletBalance({ userId, amount, actorId, reason, meta }) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const serviceKey = meta?.serviceKey || meta?.service || meta?.command || null;
  const serviceCreditAvailable = serviceCreditBalanceFor(user, serviceKey);
  if (user.balance + serviceCreditAvailable < amount) {
    return { ok: false, balance: user.balance, available: user.balance + serviceCreditAvailable };
  }

  let remaining = amount;
  const serviceCreditsUsed = [];

  if (serviceKey && remaining > 0) {
    for (const credit of user.serviceCredits || []) {
      if (!credit.active || credit.remaining <= 0 || !serviceScopeMatches(credit.services, serviceKey)) continue;
      const used = Math.min(credit.remaining, remaining);
      credit.remaining -= used;
      remaining -= used;
      serviceCreditsUsed.push({ code: credit.code, amount: used, services: credit.services });
      if (credit.remaining <= 0) credit.active = false;
      if (remaining <= 0) break;
    }
  }

  if (remaining > 0) {
    user.balance -= remaining;
  }

  walletTransaction(db, {
    userId,
    type: "debit",
    amount: -amount,
    actorId,
    reason,
    meta: {
      ...(meta || {}),
      paidWithServiceCredits: serviceCreditsUsed,
      paidWithWallet: remaining,
    },
  });
  writeWalletDb(db);
  return { ok: true, balance: user.balance, serviceCreditsUsed, paidWithWallet: remaining };
}

function formatCurrencyFromBrl(brl, currencyCode = DEFAULT_CURRENCY) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES[DEFAULT_CURRENCY];
  const value = brl / currency.brlRate;
  return `${currency.symbol} ${value.toFixed(2)} ${currencyCode}`;
}

function stripeCurrencyFor(currencyCode) {
  return CURRENCIES[currencyCode] ? String(currencyCode).toLowerCase() : DEFAULT_CURRENCY.toLowerCase();
}

function stripeUnitAmountFromBrl(brl, currencyCode = DEFAULT_CURRENCY) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES[DEFAULT_CURRENCY];
  const value = brl / currency.brlRate;
  return Math.max(50, Math.round(value * 100));
}

async function mercadoPagoRequest(endpoint, body, options = {}) {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN nao configurado.");
  }

  const res = await fetch(`https://api.mercadopago.com${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Mercado Pago falhou (${res.status}): ${text || res.statusText}`);
  }

  return json;
}

async function mercadoPagoGet(endpoint) {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN nao configurado.");
  }

  const res = await fetch(`https://api.mercadopago.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
    },
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Mercado Pago GET falhou (${res.status}): ${text || res.statusText}`);
  }

  return json;
}

function toFormDataParams(data, prefix) {
  const params = new URLSearchParams();

  function append(value, key) {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => append(item, `${key}[${index}]`));
      return;
    }
    if (typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        append(childValue, key ? `${key}[${childKey}]` : childKey);
      }
      return;
    }
    params.append(key, String(value));
  }

  append(data, prefix || "");
  return params;
}

async function stripeRequest(endpoint, data) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY nao configurado.");
  }

  const res = await fetch(`https://api.stripe.com${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toFormDataParams(data),
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Stripe falhou (${res.status}): ${text || res.statusText}`);
  }

  return json;
}

async function createStripeCheckoutSession(request) {
  return stripeRequest("/v1/checkout/sessions", {
    mode: "payment",
    success_url: STRIPE_SUCCESS_URL,
    cancel_url: STRIPE_CANCEL_URL,
    client_reference_id: request.id,
    metadata: {
      type: "service_credits",
      user_id: request.userId,
      amount: request.amount,
      request_id: request.id,
    },
    line_items: [
      {
        price_data: {
          currency: stripeCurrencyFor(request.currency),
          unit_amount: stripeUnitAmountFromBrl(request.brl, request.currency),
          product_data: {
            name: `${request.amount} Service Credits`,
            description: "Non-transferable credits redeemable only for Velvet digital services.",
          },
        },
        quantity: 1,
      },
    ],
  });
}

async function createStripeSubscriptionSession({ userId, planKey, email, currency = DEFAULT_CURRENCY }) {
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) throw new Error("Plano invalido.");

  return stripeRequest("/v1/checkout/sessions", {
    mode: "subscription",
    success_url: STRIPE_SUCCESS_URL,
    cancel_url: STRIPE_CANCEL_URL,
    customer_email: email,
    client_reference_id: `sub-${planKey}-${userId}-${Date.now()}`,
    metadata: {
      type: "velvet_subscription",
      user_id: userId,
      plan: planKey,
      role_id: plan.roleId,
    },
    subscription_data: {
      metadata: {
        type: "velvet_subscription",
        user_id: userId,
        plan: planKey,
        role_id: plan.roleId,
      },
    },
    line_items: [
      {
        price_data: {
          currency: stripeCurrencyFor(currency),
          unit_amount: stripeUnitAmountFromBrl(plan.brl, currency),
          recurring: { interval: "month" },
          product_data: { name: `Velvet ${plan.label}` },
        },
        quantity: 1,
      },
    ],
  });
}

async function createStripeLifetimeSubscriptionSession({ request, email, currency = DEFAULT_CURRENCY }) {
  const planKey = request.meta?.planKey;
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan || !plan.lifetime) throw new Error("Invalid lifetime plan.");

  return stripeRequest("/v1/checkout/sessions", {
    mode: "payment",
    success_url: STRIPE_SUCCESS_URL,
    cancel_url: STRIPE_CANCEL_URL,
    customer_email: email,
    client_reference_id: request.id,
    metadata: {
      type: "velvet_subscription_lifetime",
      user_id: request.userId,
      plan: planKey,
      role_id: plan.roleId,
      request_id: request.id,
    },
    line_items: [
      {
        price_data: {
          currency: stripeCurrencyFor(currency),
          unit_amount: stripeUnitAmountFromBrl(plan.brl, currency),
          product_data: {
            name: `Velvet ${plan.label}`,
            description: "One-time lifetime access to Velvet digital service benefits.",
          },
        },
        quantity: 1,
      },
    ],
  });
}

function verifyStripeWebhook(rawBody, signature) {
  if (!STRIPE_WEBHOOK_SECRET) return JSON.parse(rawBody || "{}");

  const parts = Object.fromEntries(
    String(signature || "")
      .split(",")
      .map(part => part.split("="))
      .filter(([key, value]) => key && value)
  );
  const timestamp = parts.t;
  const expected = parts.v1;

  if (!timestamp || !expected) throw new Error("Stripe signature ausente.");

  const signedPayload = `${timestamp}.${rawBody}`;
  const computed = crypto
    .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  if (!safeEqualHex(computed, expected)) {
    throw new Error("Stripe signature invalida.");
  }

  return JSON.parse(rawBody || "{}");
}

async function createMercadoPagoPreference(request, options = {}) {
  const payload = {
    items: [
      {
        id: request.id,
        title: `${request.amount} Service Credits`,
        description: "Non-transferable credits redeemable only for Velvet digital services.",
        quantity: 1,
        currency_id: "BRL",
        unit_price: request.brl,
      },
    ],
    external_reference: request.id,
    metadata: {
      type: "service_credits",
      user_id: request.userId,
      amount: request.amount,
      request_id: request.id,
    },
    back_urls: {
      success: MERCADO_PAGO_SUCCESS_URL,
      failure: MERCADO_PAGO_FAILURE_URL,
      pending: MERCADO_PAGO_PENDING_URL,
    },
    auto_return: "approved",
  };

  if (options.defaultPaymentMethodId) {
    payload.payment_methods = {
      default_payment_method_id: options.defaultPaymentMethodId,
    };
  }

  if (request.expiresAt) {
    payload.expires = true;
    payload.expiration_date_from = request.createdAt;
    payload.expiration_date_to = request.expiresAt;
  }

  if (MERCADO_PAGO_WEBHOOK_URL) payload.notification_url = MERCADO_PAGO_WEBHOOK_URL;

  return mercadoPagoRequest("/checkout/preferences", payload);
}

async function createMercadoPagoSubscription({ userId, planKey, email }) {
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) throw new Error("Plano invalido.");

  const payload = {
    reason: `Velvet ${plan.label} subscription`,
    external_reference: `sub-${planKey}-${userId}-${Date.now()}`,
    payer_email: email,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: plan.brl,
      currency_id: "BRL",
    },
    metadata: {
      type: "velvet_subscription",
      user_id: userId,
      plan: planKey,
      role_id: plan.roleId,
    },
    back_url: MERCADO_PAGO_SUCCESS_URL,
    status: "pending",
  };

  if (MERCADO_PAGO_WEBHOOK_URL) payload.notification_url = MERCADO_PAGO_WEBHOOK_URL;

  return mercadoPagoRequest("/preapproval", payload);
}

async function createMercadoPagoPrepaidSubscriptionPreference(request) {
  const planKey = request.meta?.planKey;
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) throw new Error("Plano invalido.");

  const payload = {
    items: [
      {
        id: request.id,
        title: `Velvet ${plan.label} - ${PREPAID_SUBSCRIPTION_DAYS} days`,
        description: "Prepaid Velvet subscription access",
        quantity: 1,
        currency_id: "BRL",
        unit_price: request.brl,
      },
    ],
    external_reference: request.id,
    metadata: {
      type: "velvet_subscription_pix",
      user_id: request.userId,
      plan: planKey,
      role_id: plan.roleId,
      request_id: request.id,
      days: PREPAID_SUBSCRIPTION_DAYS,
    },
    payment_methods: {
      default_payment_method_id: "pix",
    },
    back_urls: {
      success: MERCADO_PAGO_SUCCESS_URL,
      failure: MERCADO_PAGO_FAILURE_URL,
      pending: MERCADO_PAGO_PENDING_URL,
    },
    auto_return: "approved",
  };

  if (request.expiresAt) {
    payload.expires = true;
    payload.expiration_date_from = request.createdAt;
    payload.expiration_date_to = request.expiresAt;
  }

  if (MERCADO_PAGO_WEBHOOK_URL) payload.notification_url = MERCADO_PAGO_WEBHOOK_URL;

  return mercadoPagoRequest("/checkout/preferences", payload);
}

async function createMercadoPagoLifetimeSubscriptionPreference(request) {
  const planKey = request.meta?.planKey;
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan || !plan.lifetime) throw new Error("Invalid lifetime plan.");

  const payload = {
    items: [
      {
        id: request.id,
        title: `Velvet ${plan.label}`,
        description: "One-time lifetime access to Velvet digital service benefits.",
        quantity: 1,
        currency_id: "BRL",
        unit_price: request.brl,
      },
    ],
    external_reference: request.id,
    metadata: {
      type: "velvet_subscription_lifetime",
      user_id: request.userId,
      plan: planKey,
      role_id: plan.roleId,
      request_id: request.id,
      email: request.meta?.email,
    },
    back_urls: {
      success: MERCADO_PAGO_SUCCESS_URL,
      pending: MERCADO_PAGO_CANCEL_URL,
      failure: MERCADO_PAGO_CANCEL_URL,
    },
    notification_url: MERCADO_PAGO_WEBHOOK_URL || undefined,
    auto_return: "approved",
  };

  if (request.expiresAt) {
    payload.expires = true;
    payload.expiration_date_from = request.createdAt;
    payload.expiration_date_to = request.expiresAt;
  }

  return mercadoPagoRequest("/checkout/preferences", payload);
}

function mercadoPagoPayerEmailFor(request) {
  const email = cleanEnv(request.meta?.email || request.email);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  return `discord-${request.userId}@velvetugc.com`;
}

async function createMercadoPagoPixPayment(request) {
  const payload = {
    transaction_amount: Number(request.brl.toFixed(2)),
    description: `${request.amount} Service Credits`,
    payment_method_id: "pix",
    external_reference: request.id,
    payer: {
      email: mercadoPagoPayerEmailFor(request),
    },
    metadata: {
      type: "service_credits",
      user_id: request.userId,
      amount: request.amount,
      request_id: request.id,
    },
    notification_url: MERCADO_PAGO_WEBHOOK_URL || undefined,
  };

  if (request.expiresAt) {
    payload.date_of_expiration = request.expiresAt;
  }

  return mercadoPagoRequest("/v1/payments", payload, {
    headers: {
      "X-Idempotency-Key": request.id,
    },
  });
}

function mercadoPagoPixAttachments(payment, requestId) {
  const base64 = payment?.point_of_interaction?.transaction_data?.qr_code_base64;
  if (!base64) return [];

  const buffer = Buffer.from(String(base64).replace(/^data:image\/\w+;base64,/, ""), "base64");
  return [new AttachmentBuilder(buffer, { name: `${requestId}_pix_qr.png` })];
}

function formatMercadoPagoPixMessage({ request, priceLabel, payment, language = "pt-BR" }) {
  const transactionData = payment?.point_of_interaction?.transaction_data || {};
  const pixCode = transactionData.qr_code;
  const ticketUrl = transactionData.ticket_url;

  if (language === "pt-BR") {
    return [
      "# 🟩 Checkout Pix",
      "**Seu pedido Pix foi criado com sucesso.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## Resumo do Pedido",
      uiLine("ID do pedido", `\`${request.id}\``),
      uiLine("Pacote", formatTokenAmount(request.amount)),
      uiLine("Preço", uiMoney(priceLabel)),
      uiLine("Status", "Aguardando pagamento Pix"),
      purchaseExpirationLine(request),
      "",
      "## Pagar com Pix",
      pixCode
        ? "Escaneie o QR Code abaixo ou copie e cole este código Pix no app do seu banco:"
        : "Abra a página de pagamento Pix do Mercado Pago abaixo:",
      pixCode ? `\`\`\`\n${pixCode}\n\`\`\`` : "",
      ticketUrl ? `Página de pagamento: ${ticketUrl}` : "",
      "",
      "Seus Service Credits serão liberados automaticamente após a confirmação do Mercado Pago.",
    ].filter(Boolean).join("\n");
  }

  if (language === "es") {
    return [
      "# 🟩 Checkout Pix",
      "**Tu pedido Pix fue creado correctamente.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## Resumen del Pedido",
      uiLine("ID del pedido", `\`${request.id}\``),
      uiLine("Paquete", formatTokenAmount(request.amount)),
      uiLine("Precio", uiMoney(priceLabel)),
      uiLine("Estado", "Esperando pago Pix"),
      purchaseExpirationLine(request),
      "",
      "## Pagar con Pix",
      pixCode
        ? "Escanea el QR Code o copia y pega este código Pix en tu app bancaria:"
        : "Abre la página de pago Pix de Mercado Pago:",
      pixCode ? `\`\`\`\n${pixCode}\n\`\`\`` : "",
      ticketUrl ? `Página de pago: ${ticketUrl}` : "",
      "",
      "Tus Service Credits se liberarán automáticamente después de la confirmación de Mercado Pago.",
    ].filter(Boolean).join("\n");
  }

  return [
    "# 🟩 Pix Checkout",
    "**Your Pix order was created successfully.**",
    SERVICE_CREDITS_NOTE,
    "",
    "## Order Summary",
    uiLine("Order ID", `\`${request.id}\``),
    uiLine("Package", formatTokenAmount(request.amount)),
    uiLine("Price", uiMoney(priceLabel)),
    uiLine("Status", "Awaiting Pix payment"),
    purchaseExpirationLine(request),
    "",
    "## Pay With Pix",
    pixCode
      ? "Scan the QR Code below or copy and paste this Pix code in your bank app:"
      : "Open the Mercado Pago Pix payment page below:",
    pixCode ? `\`\`\`\n${pixCode}\n\`\`\`` : "",
    ticketUrl ? `Payment page: ${ticketUrl}` : "",
    "",
    "Your Service Credits will be released automatically after Mercado Pago confirms the payment.",
  ].filter(Boolean).join("\n");
}

function makeAffiliateCode(userId) {
  return `VELVET${String(userId).slice(-6)}`;
}

function parseDiscordInviteCode(value) {
  const text = String(value || "").trim();

  try {
    const url = new URL(text.startsWith("http") ? text : `https://discord.gg/${text}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "discord.gg") {
      return (url.pathname.split("/").filter(Boolean)[0] || "").trim();
    }

    if (host === "discord.com" || host === "discordapp.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const inviteIndex = parts.findIndex(part => part.toLowerCase() === "invite");
      return inviteIndex >= 0 ? (parts[inviteIndex + 1] || "").trim() : "";
    }
  } catch {
    // Fall through and treat the raw value as a bare invite code.
  }

  const clean = text.split(/[/?#\s]/).filter(Boolean).pop() || "";
  return /^[a-zA-Z0-9-]{2,64}$/.test(clean) && !["http", "https", "discord", "discord.gg"].includes(clean.toLowerCase())
    ? clean
    : "";
}

function normalizeAffiliateLookup(value) {
  const raw = String(value || "").trim();
  const inviteCode = parseDiscordInviteCode(raw);
  return {
    code: raw.toUpperCase(),
    inviteCode,
  };
}

function findAffiliateOwner(db, value) {
  const normalized = normalizeAffiliateLookup(value);
  return Object.entries(db.users).find(([, user]) =>
    user.affiliateCode === normalized.code ||
    String(user.affiliateInviteCode || "").toLowerCase() === String(normalized.inviteCode || "").toLowerCase()
  )?.[0] || null;
}

function getAffiliateProfile(userId) {
  const db = readWalletDb();
  const user = walletUser(db, userId);

  if (!user.affiliateCode) {
    user.affiliateCode = makeAffiliateCode(userId);
    writeWalletDb(db);
  }

  return {
    code: user.affiliateCode,
    inviteCode: user.affiliateInviteCode || null,
    inviteUrl: parseDiscordInviteCode(user.affiliateInviteCode) ? `https://discord.gg/${user.affiliateInviteCode}` : null,
    referredBy: user.referredBy,
    affiliateBalance: user.affiliateBalance || 0,
    affiliateStats: user.affiliateStats || {},
  };
}

function registerAffiliateInvite(userId, invite) {
  const inviteCode = parseDiscordInviteCode(invite);
  if (!inviteCode) return { ok: false, reason: "Invalid invite link or code." };

  const db = readWalletDb();
  const existingOwner = findAffiliateOwner(db, inviteCode);
  if (existingOwner && existingOwner !== userId) {
    return { ok: false, reason: "This invite is already registered by another affiliate." };
  }

  const user = walletUser(db, userId);
  if (!user.affiliateCode) user.affiliateCode = makeAffiliateCode(userId);
  user.affiliateInviteCode = inviteCode;
  user.affiliateInviteUrl = `https://discord.gg/${inviteCode}`;
  writeWalletDb(db);
  return { ok: true, inviteCode, inviteUrl: user.affiliateInviteUrl, code: user.affiliateCode };
}

function applyAffiliateCode(userId, code) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const ownerId = findAffiliateOwner(db, code);

  if (!ownerId) return { ok: false, reason: "Affiliate code or invite not found." };
  if (ownerId === userId) return { ok: false, reason: "You cannot use your own affiliate link." };
  if (user.referredBy) return { ok: false, reason: "An affiliate is already linked to this account." };

  user.referredBy = ownerId;
  user.referredAt = new Date().toISOString();
  user.referredSource = parseDiscordInviteCode(code) ? "invite_or_code" : "code";
  writeWalletDb(db);
  return { ok: true, ownerId };
}

function applyAffiliateInviteReferral(userId, inviteCode) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const ownerId = findAffiliateOwner(db, inviteCode);

  if (!ownerId || ownerId === userId || user.referredBy) return null;

  user.referredBy = ownerId;
  user.referredAt = new Date().toISOString();
  user.referredSource = "discord_invite";
  user.referredInviteCode = inviteCode;
  writeWalletDb(db);
  return ownerId;
}

async function refreshInviteCache(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteUses.clear();
    invites.forEach(invite => {
      inviteUses.set(invite.code, invite.uses || 0);
    });
  } catch (err) {
    console.warn("Nao consegui ler convites do Discord. Atribuicao automatica de afiliado ficou indisponivel:", err.message);
  }
}

async function detectUsedInvite(guild) {
  try {
    const invites = await guild.invites.fetch();
    let usedInvite = null;

    invites.forEach(invite => {
      const previousUses = inviteUses.get(invite.code) || 0;
      const currentUses = invite.uses || 0;
      if (currentUses > previousUses) usedInvite = invite;
      inviteUses.set(invite.code, currentUses);
    });

    return usedInvite;
  } catch (err) {
    console.warn("Nao consegui detectar convite usado:", err.message);
    return null;
  }
}

function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function affiliateMonthStats(affiliate, month = currentMonthKey()) {
  affiliate.affiliateStats ||= {};
  affiliate.affiliateStats[month] ||= {
    walletPurchases: 0,
    servicePurchases: 0,
    subscriptionCustomers: [],
    commission: 0,
  };
  affiliate.affiliateStats[month].subscriptionCustomers ||= [];
  return affiliate.affiliateStats[month];
}

function creditAffiliateCommission(db, { buyerId, amountTokens = 0, brl = null, source, actorId, meta = {} }) {
  const buyer = walletUser(db, buyerId);
  if (!buyer.referredBy) return null;

  const affiliate = walletUser(db, buyer.referredBy);
  const stats = affiliateMonthStats(affiliate);
  let rate = AFFILIATE_WALLET_PURCHASE_RATE;

  if (source === "subscription") {
    rate = stats.subscriptionCustomers.length >= AFFILIATE_SUBSCRIPTION_BOOST_CLIENTS
      ? AFFILIATE_SUBSCRIPTION_BOOST_RATE
      : AFFILIATE_SUBSCRIPTION_RATE;
  } else if (source === "service") {
    rate = AFFILIATE_SERVICE_RATE;
  }

  const baseTokens = amountTokens || brlToWalletTokens(brl || 0);
  const commission = Math.floor(baseTokens * rate);
  if (commission <= 0) return null;

  affiliate.affiliateBalance = (affiliate.affiliateBalance || 0) + commission;

  if (source === "subscription" && !stats.subscriptionCustomers.includes(buyerId)) {
    stats.subscriptionCustomers.push(buyerId);
  } else if (source === "service") {
    stats.servicePurchases += 1;
  } else {
    stats.walletPurchases += 1;
  }
  stats.commission += commission;

  walletTransaction(db, {
    userId: buyer.referredBy,
    type: "affiliate_commission",
    amount: commission,
    actorId,
    reason: "Affiliate commission",
    meta: { buyerId, source, rate, ...meta },
  });

  return { affiliateId: buyer.referredBy, commission };
}

function redeemAffiliateCommission({ userId, amount, actorId }) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  if ((user.affiliateBalance || 0) < amount) return { ok: false, balance: user.affiliateBalance || 0 };

  user.affiliateBalance -= amount;
  user.balance += amount;
  walletTransaction(db, {
    userId,
    type: "affiliate_redeem",
    amount,
    actorId,
    reason: "Affiliate commission redeemed to wallet",
  });
  writeWalletDb(db);
  return { ok: true, affiliateBalance: user.affiliateBalance, balance: user.balance };
}

function createAffiliateWithdrawal({ userId, amount, paymentInfo }) {
  const db = readWalletDb();
  const user = walletUser(db, userId);

  if (amount < AFFILIATE_WITHDRAW_MIN) {
    return { ok: false, reason: `Minimum withdrawal is ${formatTokenAmount(AFFILIATE_WITHDRAW_MIN)}.` };
  }

  if ((user.affiliateBalance || 0) < amount) {
    return { ok: false, reason: `Insufficient affiliate balance. Current balance: ${formatTokenAmount(user.affiliateBalance || 0)}.` };
  }

  user.affiliateBalance -= amount;
  const request = {
    id: `aff-${Date.now()}`,
    userId,
    amount,
    paymentInfo,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.affiliateWithdrawals.push(request);
  walletTransaction(db, {
    userId,
    type: "affiliate_withdrawal_request",
    amount: -amount,
    actorId: userId,
    reason: "Affiliate withdrawal requested",
    meta: { requestId: request.id },
  });
  writeWalletDb(db);
  return { ok: true, request, affiliateBalance: user.affiliateBalance };
}

function creditAffiliateServiceCommission({ buyerId, walletAmount, priceBrl, source, actorId, meta }) {
  const db = readWalletDb();
  const credited = creditAffiliateCommission(db, {
    buyerId,
    amountTokens: walletAmount,
    brl: priceBrl,
    source: "service",
    actorId,
    meta: { service: source, ...meta },
  });
  writeWalletDb(db);
  return credited;
}

function purchaseExpiresAtFrom(createdAt) {
  if (!PURCHASE_EXPIRATION_MS) return null;
  const created = Date.parse(createdAt || "");
  if (!Number.isFinite(created)) return null;
  return new Date(created + PURCHASE_EXPIRATION_MS).toISOString();
}

function purchaseExpiresAt(request) {
  return request?.expiresAt || purchaseExpiresAtFrom(request?.createdAt);
}

function purchaseIsExpired(request, now = Date.now()) {
  if (!request || request.status !== "pending") return false;
  const expiresAt = Date.parse(purchaseExpiresAt(request) || "");
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function purchaseExpirationLine(request) {
  const expiresAt = purchaseExpiresAt(request);
  if (!expiresAt) return "";

  const expires = new Date(expiresAt);
  const minutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));
  return uiLine("Expires", `${expires.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })} (about ${minutes} min)`);
}

function expirePendingPurchases(now = Date.now()) {
  const db = readWalletDb();
  let changed = false;
  const expired = [];

  for (const request of db.purchaseRequests || []) {
    if (!purchaseIsExpired(request, now)) continue;
    request.status = "expired";
    request.expiredAt = new Date(now).toISOString();
    request.reason = request.reason || "Payment window expired.";
    expired.push(request);
    changed = true;
  }

  if (changed) writeWalletDb(db);
  return expired;
}

function expirePurchaseRequest(requestId, reason = "Payment window expired.") {
  const db = readWalletDb();
  const request = db.purchaseRequests.find(item => item.id === requestId);
  if (!request) return { ok: false, reason: "Pedido nao encontrado." };
  if (request.status !== "pending") return { ok: false, reason: "Esse pedido ja foi resolvido.", request };
  if (!purchaseIsExpired(request)) return { ok: false, reason: "Pedido ainda esta dentro do prazo.", request };

  request.status = "expired";
  request.expiredAt = new Date().toISOString();
  request.reason = reason;
  writeWalletDb(db);
  return { ok: true, request };
}

function createPurchaseRequest({ userId, amount, currency = DEFAULT_CURRENCY, brlOverride = null, source = "buy", channelId = null, meta = {} }) {
  const db = readWalletDb();
  const brl = Number((brlOverride ?? (amount / WALLET_TOKENS_PER_BRL)).toFixed(2));
  const createdAt = new Date().toISOString();
  const request = {
    id: `compra-${Date.now()}`,
    userId,
    amount,
    brl,
    currency,
    currencyAmount: Number((brl / (CURRENCIES[currency]?.brlRate || 1)).toFixed(2)),
    source,
    channelId,
    meta,
    status: "pending",
    createdAt,
    expiresAt: purchaseExpiresAtFrom(createdAt),
  };
  db.purchaseRequests.push(request);
  writeWalletDb(db);
  return request;
}

function resolvePurchase({ requestId, action, actorId, reason }) {
  const db = readWalletDb();
  const request = db.purchaseRequests.find(item => item.id === requestId);
  if (!request) return { ok: false, reason: "Pedido nao encontrado." };
  if (purchaseIsExpired(request)) {
    request.status = "expired";
    request.expiredAt = new Date().toISOString();
    request.reason = "Payment window expired.";
    writeWalletDb(db);
    return { ok: false, reason: "Esse pedido expirou. Crie um novo checkout." };
  }
  if (request.status !== "pending") return { ok: false, reason: "Esse pedido ja foi resolvido." };

  if (action === "aprovar") {
    const user = walletUser(db, request.userId);
    user.balance += request.amount;
    walletTransaction(db, {
      userId: request.userId,
      type: "purchase",
      amount: request.amount,
      actorId,
      reason,
      meta: { requestId, brl: request.brl },
    });
    creditAffiliateCommission(db, {
      buyerId: request.userId,
      amountTokens: request.amount,
      brl: request.brl,
      source: "wallet_purchase",
      actorId,
      meta: { purchaseId: request.id },
    });
  }

  request.status = action === "aprovar" ? "approved" : "rejected";
  request.resolvedBy = actorId;
  request.resolvedAt = new Date().toISOString();
  request.reason = reason || "";
  writeWalletDb(db);
  return { ok: true, request };
}

function findPurchaseRequest(requestId) {
  const db = readWalletDb();
  return db.purchaseRequests.find(item => item.id === requestId) || null;
}

async function notifyPurchaseApproved(request) {
  if (!request?.userId) return;

  const balance = walletBalance(request.userId);
  const message =
    "## Purchase Approved\n" +
    `**Order ID:** ${request.id}\n` +
    `**Amount:** ${formatTokenAmount(request.amount)}\n` +
    `**Service credit balance:** ${formatTokenAmount(balance)}\n\n` +
    "Your Service Credits are available now.";

  if (request.channelId) {
    try {
      const channel = await client.channels.fetch(request.channelId);
      if (channel?.isTextBased()) {
        await channel.send({
          content:
            "## Purchase Approved\n" +
            `**User:** <@${request.userId}>\n` +
            `**Amount:** ${formatTokenAmount(request.amount)}\n` +
            `**Service credit balance:** ${formatTokenAmount(balance)}`,
        });
      }
    } catch (err) {
      console.warn(`Nao consegui avisar compra aprovada no canal: ${request.id}`, err.message);
    }
  }

  try {
    const user = await client.users.fetch(request.userId);
    await user.send(message);
  } catch (err) {
    console.warn(`Nao consegui avisar compra aprovada por DM: ${request.id}`, err.message);
  }
}

async function syncSubscriptionRole({ userId, roleId, active }) {
  if (!userId || !roleId) return;

  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(userId);

  if (active) {
    await member.roles.add(roleId);
  } else {
    await member.roles.remove(roleId).catch(() => {});
  }
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function activatePrepaidSubscription({ request, provider, paymentId }) {
  const planKey = request.meta?.planKey;
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) return { ok: false, reason: "Plano invalido." };

  const now = new Date();
  const db = readWalletDb();
  const storedRequest = db.purchaseRequests.find(item => item.id === request.id);
  if (!storedRequest) return { ok: false, reason: "Pedido nao encontrado." };
  if (purchaseIsExpired(storedRequest)) {
    storedRequest.status = "expired";
    storedRequest.expiredAt = new Date().toISOString();
    storedRequest.reason = "Payment window expired.";
    writeWalletDb(db);
    return { ok: false, reason: "Esse pedido expirou. Crie um novo checkout." };
  }
  if (storedRequest.status !== "pending") return { ok: false, reason: "Esse pedido ja foi resolvido." };

  const user = walletUser(db, request.userId);
  user.prepaidSubscriptions ||= {};

  const current = user.prepaidSubscriptions[planKey];
  const currentExpiry = current?.active && Date.parse(current.expiresAt) > now.getTime()
    ? new Date(current.expiresAt)
    : now;
  const expiresAt = addDays(currentExpiry, PREPAID_SUBSCRIPTION_DAYS).toISOString();

  user.prepaidSubscriptions[planKey] = {
    plan: planKey,
    roleId: plan.roleId,
    active: true,
    provider,
    requestId: request.id,
    paymentId,
    startedAt: current?.startedAt || now.toISOString(),
    renewedAt: now.toISOString(),
    expiresAt,
  };

  storedRequest.status = "approved";
  storedRequest.resolvedBy = provider;
  storedRequest.resolvedAt = now.toISOString();
  storedRequest.reason = `${provider} prepaid subscription ${paymentId || ""}`.trim();

  walletTransaction(db, {
    userId: request.userId,
    type: "subscription_prepaid",
    amount: 0,
    actorId: provider,
    reason: `Velvet ${plan.label} prepaid subscription`,
    meta: { requestId: request.id, plan: planKey, brl: request.brl, expiresAt, paymentId },
  });

  creditAffiliateCommission(db, {
    buyerId: request.userId,
    brl: request.brl,
    source: "subscription",
    actorId: provider,
    meta: { requestId: request.id, plan: planKey, paymentId },
  });

  writeWalletDb(db);
  await syncSubscriptionRole({ userId: request.userId, roleId: plan.roleId, active: true });
  return { ok: true, plan, expiresAt };
}

async function notifyPrepaidSubscriptionApproved(request, plan, expiresAt) {
  const message =
    "## Subscription Activated\n" +
    `**Order ID:** \`${request.id}\`\n` +
    `**Plan:** Velvet ${plan.label}\n` +
    `**Valid until:** ${new Date(expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n` +
    "Your role is active now.";

  if (request.channelId) {
    try {
      const channel = await client.channels.fetch(request.channelId);
      if (channel?.isTextBased()) {
        await channel.send({
          content:
            "## Subscription Activated\n" +
            `**User:** <@${request.userId}>\n` +
            `**Plan:** Velvet ${plan.label}\n` +
            `**Valid until:** ${new Date(expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        });
      }
    } catch (err) {
      console.warn(`Nao consegui avisar assinatura aprovada no canal: ${request.id}`, err.message);
    }
  }

  try {
    const user = await client.users.fetch(request.userId);
    await user.send(message);
  } catch (err) {
    console.warn(`Nao consegui avisar assinatura aprovada por DM: ${request.id}`, err.message);
  }
}

async function activateLifetimeSubscription({ request, provider, paymentId }) {
  const planKey = request.meta?.planKey;
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan || !plan.lifetime) return { ok: false, reason: "Invalid lifetime plan." };

  const db = readWalletDb();
  const storedRequest = db.purchaseRequests.find(item => item.id === request.id);
  if (!storedRequest) return { ok: false, reason: "Order not found." };
  if (purchaseIsExpired(storedRequest)) {
    storedRequest.status = "expired";
    storedRequest.expiredAt = new Date().toISOString();
    storedRequest.reason = "Payment window expired.";
    writeWalletDb(db);
    return { ok: false, reason: "This order expired. Create a new checkout." };
  }
  if (storedRequest.status !== "pending") return { ok: false, reason: "Order already resolved." };

  storedRequest.status = "approved";
  storedRequest.approvedAt = new Date().toISOString();
  storedRequest.approvedBy = provider;
  storedRequest.paymentId = paymentId;
  walletTransaction(db, {
    userId: request.userId,
    type: "subscription_lifetime",
    amount: 0,
    actorId: provider,
    reason: `Velvet ${plan.label} lifetime access`,
    meta: { requestId: request.id, plan: planKey, brl: request.brl, paymentId },
  });
  creditAffiliateCommission(db, {
    buyerId: request.userId,
    brl: request.brl,
    source: "subscription_lifetime",
    actorId: provider,
    meta: { plan: planKey, requestId: request.id, paymentId },
  });
  writeWalletDb(db);

  await syncSubscriptionRole({ userId: request.userId, roleId: plan.roleId, active: true });
  return { ok: true, plan };
}

async function notifyLifetimeSubscriptionApproved(request, plan) {
  const message =
    `## Lifetime Access Activated\n` +
    `**Plan:** ${plan.label}\n` +
    `**Order ID:** \`${request.id}\`\n\n` +
    "Your lifetime role is active now.";

  if (request.channelId) {
    const channel = await client.channels.fetch(request.channelId).catch(() => null);
    if (channel) await channel.send({ content: `<@${request.userId}>\n${message}` }).catch(() => {});
  }
  const user = await client.users.fetch(request.userId).catch(() => null);
  if (user) await user.send(message).catch(() => {});
}

async function expirePrepaidSubscriptions() {
  const db = readWalletDb();
  const now = Date.now();
  const expired = [];

  for (const [userId, user] of Object.entries(db.users || {})) {
    for (const [planKey, subscription] of Object.entries(user.prepaidSubscriptions || {})) {
      if (!subscription.active || !subscription.expiresAt) continue;
      if (Date.parse(subscription.expiresAt) > now) continue;

      subscription.active = false;
      subscription.expiredAt = new Date().toISOString();
      expired.push({ userId, planKey, roleId: subscription.roleId });
      walletTransaction(db, {
        userId,
        type: "subscription_prepaid_expired",
        amount: 0,
        actorId: client.user?.id || "system",
        reason: "Prepaid subscription expired",
        meta: { plan: planKey, expiresAt: subscription.expiresAt },
      });
    }
  }

  if (expired.length) writeWalletDb(db);

  for (const item of expired) {
    await syncSubscriptionRole({ userId: item.userId, roleId: item.roleId, active: false }).catch(err => {
      console.warn(`Nao consegui remover cargo vencido de ${item.userId}:`, err.message);
    });
  }
}

async function handleMercadoPagoPayment(paymentId) {
  const payment = await mercadoPagoGet(`/v1/payments/${paymentId}`);
  const requestId = payment.external_reference || payment.metadata?.request_id;

  if (!requestId) {
    console.warn("Pagamento Mercado Pago sem external_reference:", paymentId);
    return;
  }

  const request = findPurchaseRequest(requestId);
  if (!request) {
    console.warn("Pedido de compra nao encontrado para pagamento:", requestId);
    return;
  }

  if (payment.status !== "approved") {
    console.log(`Pagamento ${paymentId} ainda nao aprovado: ${payment.status}`);
    return;
  }

  if (request.source === "subscription_pix") {
    const activated = await activatePrepaidSubscription({
      request,
      provider: "mercado_pago_pix",
      paymentId,
    });

    if (activated.ok) {
      console.log(`Assinatura Pix aprovada automaticamente: ${requestId}`);
      await notifyPrepaidSubscriptionApproved(request, activated.plan, activated.expiresAt);
    } else {
      console.log(`Assinatura Pix nao aprovada automaticamente: ${requestId} - ${activated.reason}`);
    }
    return;
  }

  if (request.source === "subscription_lifetime") {
    const activated = await activateLifetimeSubscription({
      request,
      provider: "mercado_pago",
      paymentId,
    });

    if (activated.ok) {
      console.log(`Lifetime Mercado Pago aprovado automaticamente: ${requestId}`);
      await notifyLifetimeSubscriptionApproved(request, activated.plan);
    } else {
      console.log(`Lifetime Mercado Pago nao aprovado automaticamente: ${requestId} - ${activated.reason}`);
    }
    return;
  }

  const resolved = resolvePurchase({
    requestId,
    action: "aprovar",
    actorId: "mercado_pago",
    reason: `Mercado Pago payment ${paymentId}`,
  });

  if (resolved.ok) {
    console.log(`Compra aprovada automaticamente: ${requestId}`);
    await notifyPurchaseApproved(resolved.request);
  } else {
    console.log(`Compra nao aprovada automaticamente: ${requestId} - ${resolved.reason}`);
  }
}

async function handleMercadoPagoSubscription(preapprovalId) {
  const subscription = await mercadoPagoGet(`/preapproval/${preapprovalId}`);
  const metadata = subscription.metadata || {};
  const userId = metadata.user_id;
  const planKey = metadata.plan;
  const plan = SUBSCRIPTION_PLANS[planKey];
  const roleId = metadata.role_id || plan?.roleId;

  if (!userId || !roleId) {
    console.warn("Assinatura Mercado Pago sem user_id/role_id:", preapprovalId);
    return;
  }

  const active = ["authorized", "active"].includes(subscription.status);
  const inactive = ["cancelled", "paused"].includes(subscription.status);

  if (active || inactive) {
    await syncSubscriptionRole({ userId, roleId, active });
    console.log(`Assinatura ${preapprovalId} sincronizada. Status: ${subscription.status}`);
  }
}

async function handleStripeCheckoutSession(session) {
  const metadata = session.metadata || {};

  if ((metadata.type === "service_credits" || metadata.type === "velvet_coins") && session.payment_status === "paid") {
    const requestId = metadata.request_id || session.client_reference_id;
    const resolved = resolvePurchase({
      requestId,
      action: "aprovar",
      actorId: "stripe",
      reason: `Stripe checkout session ${session.id}`,
    });

    if (resolved.ok) {
      console.log(`Compra Stripe aprovada automaticamente: ${requestId}`);
      await notifyPurchaseApproved(resolved.request);
    } else {
      console.log(`Compra Stripe nao aprovada automaticamente: ${requestId} - ${resolved.reason}`);
    }
    return;
  }

  if (metadata.type === "velvet_subscription") {
    await syncSubscriptionRole({
      userId: metadata.user_id,
      roleId: metadata.role_id || SUBSCRIPTION_PLANS[metadata.plan]?.roleId,
      active: true,
    });
    const plan = SUBSCRIPTION_PLANS[metadata.plan];
    if (plan) {
      const db = readWalletDb();
      creditAffiliateCommission(db, {
        buyerId: metadata.user_id,
        brl: plan.brl,
        source: "subscription",
        actorId: client.user.id,
        meta: { plan: metadata.plan, sessionId: session.id },
      });
      writeWalletDb(db);
    }
    console.log(`Assinatura Stripe ativada: ${session.id}`);
  }

  if (metadata.type === "velvet_subscription_lifetime" && session.payment_status === "paid") {
    const requestId = metadata.request_id || session.client_reference_id;
    const request = findPurchaseRequest(requestId);
    if (!request) {
      console.warn("Lifetime Stripe sem pedido:", requestId);
      return;
    }

    const activated = await activateLifetimeSubscription({
      request,
      provider: "stripe",
      paymentId: session.id,
    });

    if (activated.ok) {
      console.log(`Lifetime Stripe aprovado automaticamente: ${requestId}`);
      await notifyLifetimeSubscriptionApproved(request, activated.plan);
    } else {
      console.log(`Lifetime Stripe nao aprovado automaticamente: ${requestId} - ${activated.reason}`);
    }
  }
}

async function handleStripeSubscription(subscription, active) {
  const metadata = subscription.metadata || {};
  if (metadata.type !== "velvet_subscription") return;

  await syncSubscriptionRole({
    userId: metadata.user_id,
    roleId: metadata.role_id || SUBSCRIPTION_PLANS[metadata.plan]?.roleId,
    active,
  });
  console.log(`Assinatura Stripe sincronizada: ${subscription.id} active=${active}`);
}

async function handleStripeSubscriptionInvoice(invoice) {
  if (!invoice || invoice.billing_reason === "subscription_create") return;

  const metadata =
    invoice.subscription_details?.metadata ||
    invoice.lines?.data?.find(line => line.metadata?.type === "velvet_subscription")?.metadata ||
    {};

  if (metadata.type !== "velvet_subscription") return;

  const db = readWalletDb();
  const invoiceId = invoice.id;
  const alreadyCredited = db.transactions.some(transaction =>
    transaction.type === "affiliate_commission" &&
    transaction.meta?.source === "subscription" &&
    transaction.meta?.invoiceId === invoiceId
  );
  if (alreadyCredited) return;

  const amountPaidBrl = Number(invoice.amount_paid || 0) / 100;
  creditAffiliateCommission(db, {
    buyerId: metadata.user_id,
    brl: amountPaidBrl || SUBSCRIPTION_PLANS[metadata.plan]?.brl || 0,
    source: "subscription",
    actorId: client.user.id,
    meta: { plan: metadata.plan, invoiceId },
  });
  writeWalletDb(db);
}

async function processStripeWebhook(event) {
  if (event.type === "checkout.session.completed") {
    await handleStripeCheckoutSession(event.data?.object || {});
    return;
  }

  if (event.type === "invoice.payment_succeeded") {
    await handleStripeSubscriptionInvoice(event.data?.object || {});
    return;
  }

  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.paused") {
    await handleStripeSubscription(event.data?.object || {}, false);
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data?.object || {};
    if (invoice.subscription) {
      console.log(`Invoice payment failed for subscription ${invoice.subscription}. Waiting for subscription.updated to sync status.`);
    }
    return;
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data?.object || {};
    const active = ["active", "trialing"].includes(subscription.status);
    await handleStripeSubscription(subscription, active);
    return;
  }

  console.log(`Webhook Stripe ignorado: ${event.type}`);
}

function createWithdrawalRequest({ userId, amount, robloxUsername, groupConfirmed }) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  if (user.balance < amount) {
    return { ok: false, balance: user.balance };
  }

  const request = {
    id: `saque-${Date.now()}`,
    userId,
    amount,
    robloxUsername,
    groupConfirmed,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.withdrawalRequests.push(request);
  writeWalletDb(db);
  return { ok: true, request };
}

function resolveWithdrawal({ requestId, action, actorId, reason }) {
  const db = readWalletDb();
  const request = db.withdrawalRequests.find(item => item.id === requestId);
  if (!request) return { ok: false, reason: "Pedido nao encontrado." };
  if (request.status !== "pending") return { ok: false, reason: "Esse pedido ja foi resolvido." };

  if (action === "aprovar") {
    const user = walletUser(db, request.userId);
    if (user.balance < request.amount) {
      return { ok: false, reason: "Usuario nao tem saldo suficiente no momento da aprovacao." };
    }

    user.balance -= request.amount;
    walletTransaction(db, {
      userId: request.userId,
      type: "withdrawal",
      amount: -request.amount,
      actorId,
      reason,
      meta: { requestId },
    });
  }

  request.status = action === "aprovar" ? "approved" : "rejected";
  request.resolvedBy = actorId;
  request.resolvedAt = new Date().toISOString();
  request.reason = reason || "";
  writeWalletDb(db);
  return { ok: true, request };
}

function formatTokenAmount(amount) {
  return `${Number(amount || 0).toLocaleString("pt-BR")} ${WALLET_TOKEN_NAME}`;
}

function uiLine(label, value) {
  return `> **${label}:** ${value}`;
}

function uiMoney(value) {
  return `**${value}**`;
}

function formatBalanceMessage({ balance, serviceCredits = "", language = "en" }) {
  if (language === "pt-BR") {
    return [
      "# 💎 Carteira Velvet",
      "**Seus Service Credits estão prontos para usar nos serviços digitais da Velvet.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## Saldo",
      uiLine("Disponível", formatTokenAmount(balance)),
      serviceCredits ? `\n## Créditos Específicos\n${serviceCredits}` : "",
      "",
      "## Ações Rápidas",
      "> Use `/buy` para adicionar Service Credits.",
      "> Use `/generate3d` para iniciar um pedido guiado de modelo 3D.",
      "> Use `/commands` para ver todas as ferramentas disponíveis.",
    ].filter(Boolean).join("\n");
  }

  if (language === "es") {
    return [
      "# 💎 Billetera Velvet",
      "**Tus Service Credits están listos para usar en los servicios digitales de Velvet.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## Saldo",
      uiLine("Disponible", formatTokenAmount(balance)),
      serviceCredits ? `\n## Créditos Específicos\n${serviceCredits}` : "",
      "",
      "## Acciones Rápidas",
      "> Usa `/buy` para añadir Service Credits.",
      "> Usa `/generate3d` para iniciar una solicitud guiada de modelo 3D.",
      "> Usa `/commands` para ver todas las herramientas disponibles.",
    ].filter(Boolean).join("\n");
  }

  return [
    "# 💎 Velvet Wallet",
    "**Your Service Credits are ready to use on Velvet digital services.**",
    SERVICE_CREDITS_NOTE,
    "",
    "## Balance",
    uiLine("Available", formatTokenAmount(balance)),
    serviceCredits ? `\n## Service-Specific Credits\n${serviceCredits}` : "",
    "",
    "## Quick Actions",
    "> Use `/buy` to add Service Credits.",
    "> Use `/generate3d` to start a guided 3D model request.",
    "> Use `/commands` if you want to see every available tool.",
  ].filter(Boolean).join("\n");
}

function formatTransactionAmount(amount) {
  const number = Number(amount || 0);
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${formatTokenAmount(number)}`;
}

function formatTransactionLine(transaction) {
  const parsedDate = transaction.createdAt ? new Date(transaction.createdAt) : null;
  const date = parsedDate && Number.isFinite(parsedDate.getTime())
    ? parsedDate.toISOString().slice(0, 16).replace("T", " ")
    : "unknown date";
  const code = transaction.meta?.code ? ` | \`${transaction.meta.code}\`` : "";
  const reason = transaction.reason ? ` | ${transaction.reason}` : "";
  return `\`${date} UTC\` | **${formatTransactionAmount(transaction.amount)}** | ${transaction.type}${code}${reason}`;
}

function formatCreditHistoryMessage({ userId, transactions, title = "Credit History" }) {
  return [
    `# ${title}`,
    `**User:** <@${userId}>`,
    SERVICE_CREDITS_NOTE,
    "",
    transactions.length
      ? transactions.map(formatTransactionLine).join("\n")
      : "No credit history found yet.",
  ].join("\n");
}

function creditHistoryForUser(userId, limit = 15) {
  const db = readWalletDb();
  return db.transactions
    .filter(transaction => transaction.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, clampNumber(limit, 1, 25, 15));
}

function recentPurchaseRequestsForUser(userId, limit = 5) {
  const db = readWalletDb();
  return (db.purchaseRequests || [])
    .filter(request => request.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, clampNumber(limit, 1, 10, 5));
}

function formatShortDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function formatPurchaseRequestLine(request) {
  const price = request.brl ? formatCurrencyFromBrl(request.brl, request.currency || DEFAULT_CURRENCY) : "manual";
  return [
    `\`${request.id}\``,
    `**${request.status || "pending"}**`,
    formatTokenAmount(request.amount),
    price,
    formatShortDate(request.createdAt),
  ].join(" | ");
}

function formatCustomerHistoryMessage({ userId, limit = 8, language = "en" }) {
  const transactions = creditHistoryForUser(userId, limit);
  const purchases = recentPurchaseRequestsForUser(userId, 5);

  if (language === "pt-BR") {
    return [
      "# 🧾 Histórico Velvet",
      "**Seus pedidos recentes e movimentações de Service Credits.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## 💎 Movimentações Recentes",
      transactions.length
        ? transactions.map(formatTransactionLine).join("\n")
        : "> Nenhuma movimentação encontrada ainda.",
      "",
      "## 🛒 Pedidos Recentes",
      purchases.length
        ? purchases.map(formatPurchaseRequestLine).join("\n")
        : "> Nenhum pedido encontrado ainda.",
      "",
      "Use `/order_status id:ID_DO_PEDIDO` para consultar um pedido específico.",
    ].join("\n");
  }

  if (language === "es") {
    return [
      "# 🧾 Historial Velvet",
      "**Tus pedidos recientes y movimientos de Service Credits.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## 💎 Actividad Reciente",
      transactions.length
        ? transactions.map(formatTransactionLine).join("\n")
        : "> No se encontró actividad todavía.",
      "",
      "## 🛒 Pedidos Recientes",
      purchases.length
        ? purchases.map(formatPurchaseRequestLine).join("\n")
        : "> No se encontraron pedidos todavía.",
      "",
      "Usa `/order_status id:ORDER_ID` para revisar un pedido específico.",
    ].join("\n");
  }

  return [
    "# 🧾 Velvet History",
    "**Your recent Service Credits activity and purchase requests.**",
    SERVICE_CREDITS_NOTE,
    "",
    "## 💎 Recent Credit Activity",
    transactions.length
      ? transactions.map(formatTransactionLine).join("\n")
      : "> No Service Credits activity found yet.",
    "",
    "## 🛒 Recent Orders",
    purchases.length
      ? purchases.map(formatPurchaseRequestLine).join("\n")
      : "> No purchase requests found yet.",
    "",
    "Use `/order_status id:ORDER_ID` to inspect a specific order.",
  ].join("\n");
}

function findOrderStatus(id, requesterId = null, includeAdmin = false) {
  const needle = cleanEnv(id);
  if (!needle) return null;
  const db = readWalletDb();

  const purchase = (db.purchaseRequests || []).find(item => item.id === needle);
  if (purchase) {
    if (!includeAdmin && requesterId && purchase.userId !== requesterId) return { forbidden: true };
    return { type: "purchase", data: purchase };
  }

  const action = pendingMultiviewActions.get(needle);
  if (action) {
    if (!includeAdmin && requesterId && action.userId !== requesterId) return { forbidden: true };
    return { type: "model", data: action };
  }

  for (const [actionId, item] of pendingMultiviewActions.entries()) {
    if (item.generationActionId === needle || item.threadId === needle || item.sessionId === needle) {
      if (!includeAdmin && requesterId && item.userId !== requesterId) return { forbidden: true };
      return { type: "model", data: { ...item, id: actionId } };
    }
  }

  return null;
}

function formatOrderStatusMessage(result, language = "en") {
  if (language === "pt-BR") {
    if (!result) {
      return [
        "# 🔎 Pedido Não Encontrado",
        "Não encontrei esse pedido ou geração 3D.",
        "",
        "> Confira o ID e tente novamente, ou chame o suporte com um print.",
      ].join("\n");
    }

    if (result.forbidden) {
      return [
        "# 🔒 Pedido Privado",
        "Esse pedido pertence a outro usuário.",
        "",
        "> Apenas o cliente ou a equipe pode consultar esse status.",
      ].join("\n");
    }

    if (result.type === "purchase") {
      const request = result.data;
      return [
        "# 🛒 Status do Pedido",
        uiLine("ID do pedido", `\`${request.id}\``),
        uiLine("Status", `**${request.status || "pending"}**`),
        uiLine("Pacote", formatTokenAmount(request.amount)),
        uiLine("Preço", request.brl ? uiMoney(formatCurrencyFromBrl(request.brl, request.currency || DEFAULT_CURRENCY)) : "manual"),
        uiLine("Criado em", formatShortDate(request.createdAt)),
        request.expiresAt ? uiLine("Expira em", formatShortDate(request.expiresAt)) : "",
        "",
        request.status === "pending"
          ? "O pagamento ainda está aguardando confirmação. Os Service Credits são liberados automaticamente após aprovação."
          : "Esse pedido já foi resolvido.",
      ].filter(Boolean).join("\n");
    }

    const action = result.data;
    return [
      "# 🎨 Status da Geração 3D",
      uiLine("ID da solicitação", `\`${action.id || action.actionId || "unknown"}\``),
      uiLine("Status", `**${action.status || "unknown"}**`),
      uiLine("Cobrança", action.chargeStatus || "não cobrado"),
      uiLine("Entrega", action.deliveryStatus || "não entregue"),
      action.price ? uiLine("Preço", formatTokenAmount(action.price)) : "",
      action.balanceAfterCharge !== undefined ? uiLine("Saldo após cobrança", formatTokenAmount(action.balanceAfterCharge)) : "",
      action.lastError ? uiLine("Último problema", `\`${String(action.lastError).slice(0, 500)}\``) : "",
      "",
      "Service Credits só são descontados depois que o modelo final é entregue.",
    ].filter(Boolean).join("\n");
  }

  if (language === "es") {
    if (!result) {
      return [
        "# 🔎 Pedido No Encontrado",
        "No encontré ese pedido o solicitud de modelo 3D.",
        "",
        "> Revisa el ID e inténtalo de nuevo, o contacta soporte con una captura.",
      ].join("\n");
    }

    if (result.forbidden) {
      return [
        "# 🔒 Pedido Privado",
        "Ese pedido pertenece a otro usuario.",
        "",
        "> Solo el cliente o el equipo puede revisar este estado.",
      ].join("\n");
    }

    if (result.type === "purchase") {
      const request = result.data;
      return [
        "# 🛒 Estado del Pedido",
        uiLine("ID del pedido", `\`${request.id}\``),
        uiLine("Estado", `**${request.status || "pending"}**`),
        uiLine("Paquete", formatTokenAmount(request.amount)),
        uiLine("Precio", request.brl ? uiMoney(formatCurrencyFromBrl(request.brl, request.currency || DEFAULT_CURRENCY)) : "manual"),
        uiLine("Creado", formatShortDate(request.createdAt)),
        request.expiresAt ? uiLine("Expira", formatShortDate(request.expiresAt)) : "",
        "",
        request.status === "pending"
          ? "El pago aún espera confirmación. Los Service Credits se liberan automáticamente después de la aprobación."
          : "Este pedido ya fue resuelto.",
      ].filter(Boolean).join("\n");
    }

    const action = result.data;
    return [
      "# 🎨 Estado de Generación 3D",
      uiLine("ID de solicitud", `\`${action.id || action.actionId || "unknown"}\``),
      uiLine("Estado", `**${action.status || "unknown"}**`),
      uiLine("Cobro", action.chargeStatus || "no cobrado"),
      uiLine("Entrega", action.deliveryStatus || "no entregado"),
      action.price ? uiLine("Precio", formatTokenAmount(action.price)) : "",
      action.balanceAfterCharge !== undefined ? uiLine("Saldo después del cobro", formatTokenAmount(action.balanceAfterCharge)) : "",
      action.lastError ? uiLine("Último problema", `\`${String(action.lastError).slice(0, 500)}\``) : "",
      "",
      "Los Service Credits solo se descuentan después de entregar el modelo final.",
    ].filter(Boolean).join("\n");
  }

  if (!result) {
    return [
      "# 🔎 Order Not Found",
      "I could not find that order or model request.",
      "",
      "> Check the ID and try again, or contact support with a screenshot.",
    ].join("\n");
  }

  if (result.forbidden) {
    return [
      "# 🔒 Private Order",
      "That order belongs to another user.",
      "",
      "> Only the customer or staff can inspect this status.",
    ].join("\n");
  }

  if (result.type === "purchase") {
    const request = result.data;
    return [
      "# 🛒 Order Status",
      uiLine("Order ID", `\`${request.id}\``),
      uiLine("Status", `**${request.status || "pending"}**`),
      uiLine("Package", formatTokenAmount(request.amount)),
      uiLine("Price", request.brl ? uiMoney(formatCurrencyFromBrl(request.brl, request.currency || DEFAULT_CURRENCY)) : "manual"),
      uiLine("Created", formatShortDate(request.createdAt)),
      request.expiresAt ? uiLine("Expires", formatShortDate(request.expiresAt)) : "",
      "",
      request.status === "pending"
        ? "Payment is still awaiting confirmation. Service Credits are released automatically after approval."
        : "This order has already been resolved.",
    ].filter(Boolean).join("\n");
  }

  const action = result.data;
  return [
    "# 🎨 Model Request Status",
    uiLine("Request ID", `\`${action.id || action.actionId || "unknown"}\``),
    uiLine("Status", `**${action.status || "unknown"}**`),
    uiLine("Charge status", action.chargeStatus || "not charged"),
    uiLine("Delivery status", action.deliveryStatus || "not delivered"),
    action.price ? uiLine("Price", formatTokenAmount(action.price)) : "",
    action.balanceAfterCharge !== undefined ? uiLine("Balance after charge", formatTokenAmount(action.balanceAfterCharge)) : "",
    action.lastError ? uiLine("Last issue", `\`${String(action.lastError).slice(0, 500)}\``) : "",
    "",
    "Service Credits are only deducted after a final model is delivered.",
  ].filter(Boolean).join("\n");
}

function formatPurchaseMessage({ request, priceLabel, paymentProvider, paymentLink, language = "en" }) {
  if (language === "pt-BR") {
    return [
      "# 🛒 Checkout de Service Credits",
      "**Seu pedido foi criado com sucesso.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## Resumo do Pedido",
      uiLine("ID do pedido", `\`${request.id}\``),
      uiLine("Pacote", formatTokenAmount(request.amount)),
      uiLine("Preço", uiMoney(priceLabel)),
      uiLine("Status", "Aguardando pagamento"),
      purchaseExpirationLine(request),
      "",
      "## Pagamento Seguro",
      paymentLink
        ? `Pague com segurança via **${paymentProvider}**:\n${paymentLink}\n\nSeus Service Credits serão liberados automaticamente após a confirmação.`
        : "Envie o pagamento no canal indicado pela equipe. Seus Service Credits serão liberados após confirmação manual.",
    ].join("\n");
  }

  if (language === "es") {
    return [
      "# 🛒 Checkout de Service Credits",
      "**Tu pedido fue creado correctamente.**",
      SERVICE_CREDITS_NOTE,
      "",
      "## Resumen del Pedido",
      uiLine("ID del pedido", `\`${request.id}\``),
      uiLine("Paquete", formatTokenAmount(request.amount)),
      uiLine("Precio", uiMoney(priceLabel)),
      uiLine("Estado", "Esperando pago"),
      purchaseExpirationLine(request),
      "",
      "## Pago Seguro",
      paymentLink
        ? `Paga de forma segura con **${paymentProvider}**:\n${paymentLink}\n\nTus Service Credits se liberarán automáticamente después de la confirmación.`
        : "Envía el pago en el canal indicado por el equipo. Tus Service Credits se liberarán después de la confirmación manual.",
    ].join("\n");
  }

  return [
    "# 🛒 Service Credits Checkout",
    "**Your order was created successfully.**",
    SERVICE_CREDITS_NOTE,
    "",
    "## Order Summary",
    uiLine("Order ID", `\`${request.id}\``),
    uiLine("Package", formatTokenAmount(request.amount)),
    uiLine("Price", uiMoney(priceLabel)),
    uiLine("Status", "Awaiting payment"),
    purchaseExpirationLine(request),
    "",
    "## Secure Payment",
    paymentLink
      ? `Pay securely with **${paymentProvider}**:\n${paymentLink}\n\nYour Service Credits will be released automatically after confirmation.`
      : "Send the payment in the channel indicated by the team. Your Service Credits will be released after manual confirmation.",
  ].join("\n");
}

function formatAffiliateMessage(profile) {
  return [
    "# Velvet Affiliate",
    "Share your invite, bring new customers and earn commission for Velvet services.",
    "",
    uiLine("Code", `\`${profile.code}\``),
    uiLine("Invite", profile.inviteUrl || "Not registered yet"),
    uiLine("Service package purchases", `${(AFFILIATE_WALLET_PURCHASE_RATE * 100).toFixed(0)}%`),
    uiLine("AI remake services", `${(AFFILIATE_SERVICE_RATE * 100).toFixed(0)}%`),
    uiLine("Subscriptions", `${(AFFILIATE_SUBSCRIPTION_RATE * 100).toFixed(0)}% base, ${(AFFILIATE_SUBSCRIPTION_BOOST_RATE * 100).toFixed(0)}% after ${AFFILIATE_SUBSCRIPTION_BOOST_CLIENTS} new subscribers/month`),
    uiLine("Pending commission", formatTokenAmount(profile.affiliateBalance)),
    "",
    "## Actions",
    "Register your invite with `/affiliate_register`.",
    "Convert commission into Service Credits with `/affiliate_redeem`.",
    "Service Credits are only usable for Velvet services and cannot be withdrawn or transferred.",
  ].join("\n");
}

function formatSubscriptionMessage({ plan, provider, email, link, orderId = null, priceLabel = null, expiresAt = null }) {
  const isPrepaid = provider === "Mercado Pago Pix";
  const displayedPrice = priceLabel || (isPrepaid
    ? formatCurrencyFromBrl(plan.brl, "BRL")
    : formatCurrencyFromBrl(plan.brl, DEFAULT_CURRENCY));
  return [
    `# ⭐ Velvet ${plan.label}`,
    plan.lifetime
      ? "Your lifetime access checkout is ready."
      : isPrepaid
      ? `Your prepaid ${PREPAID_SUBSCRIPTION_DAYS}-day subscription checkout is ready.`
      : "Your subscription checkout is ready.",
    "",
    uiLine("Price", plan.lifetime ? `${displayedPrice} one-time` : isPrepaid ? `${displayedPrice} / ${PREPAID_SUBSCRIPTION_DAYS} days` : `${displayedPrice}/month`),
    uiLine("Provider", provider),
    orderId ? uiLine("Order ID", `\`${orderId}\``) : null,
    expiresAt ? uiLine("Expires", new Date(expiresAt).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })) : null,
    uiLine("Email", email),
    "",
    link
      ? `Complete your subscription here:\n${link}`
      : "The checkout was created, but no payment link was returned. The team can review this manually.",
  ].join("\n");
}

function formatInsufficientBalanceMessage({ service, price, balance, language = "en" }) {
  if (language === "pt-BR") {
    return [
      "# ⚠️ Saldo insuficiente",
      "Você precisa de mais Service Credits para continuar.",
      "",
      uiLine("Serviço", service),
      uiLine("Preço", formatTokenAmount(price)),
      uiLine("Seu saldo", formatTokenAmount(balance)),
      "",
      "Use `/buy` para adicionar Service Credits.",
    ].join("\n");
  }
  if (language === "es") {
    return [
      "# ⚠️ Saldo insuficiente",
      "Necesitas mas Service Credits para continuar.",
      "",
      uiLine("Servicio", service),
      uiLine("Precio", formatTokenAmount(price)),
      uiLine("Tu saldo", formatTokenAmount(balance)),
      "",
      "Usa `/buy` para agregar Service Credits.",
    ].join("\n");
  }
  return [
    "# ⚠️ Insufficient Balance",
    "You need more Service Credits to continue.",
    "",
    uiLine("Service", service),
    uiLine("Price", formatTokenAmount(price)),
    uiLine("Your balance", formatTokenAmount(balance)),
    "",
    "Use `/buy` to add Service Credits.",
  ].join("\n");
}

async function replyOrEditInteraction(interaction, options) {
  if (interaction.deferred || interaction.replied) {
    if (typeof options === "string") return interaction.editReply(options);
    const editOptions = { ...options };
    delete editOptions.flags;
    return interaction.editReply(editOptions);
  }
  return interaction.reply(options);
}

function formatOfficialGuide(language) {
  if (language === "pt-BR") {
    return [
      "# ✨ Como utilizar a Velvet UGC",
      "Bem-vindo. Este canal mostra o passo a passo oficial para usar o bot com segurança, rapidez e clareza.",
      "",
      "## 1. Configure sua conta",
      "Use `/settings` para escolher idioma e moeda de preferência.",
      "Use `/balance` para consultar seu saldo de Service Credits.",
      "",
      "## 2. Compre Service Credits",
      "Use `/buy` e escolha a quantidade de Service Credits.",
      "O bot cria um checkout seguro. Assim que o pagamento for confirmado, o saldo é liberado automaticamente.",
      "",
      "## 3. Copiar um UGC original",
      "Use `/steal id:ID_DO_UGC` para receber os arquivos originais do item.",
      "Use `/steal id:ID_OU_LINK` para copiar UGCs ou templates de roupas clássicas automaticamente.",
      "Use `/bulk_steal_clothing ids:IDS` para copiar várias roupas clássicas de uma vez.",
      "Usuários sem assinatura têm limite grátis diário. Basic tem limite maior. Premium tem cópias ilimitadas com cooldown.",
      "",
      "## 4. Refazer um modelo com IA",
      "Use `/price` antes de comprar para ver o valor final.",
      "Use `/remake` para refazer por ID usando uma imagem de referência renderizada pelo bot.",
      "Use `/multiview` quando tiver imagens de frente, direita, costas e esquerda. Esse modo costuma dar resultado melhor.",
      "",
      "## 5. Escolhas disponíveis",
      "**Texture:** sem textura ou padrão.",
      "**Enhancement:** sem melhoria, economy, standard ou premium.",
      "**Triangles:** limite opcional para deixar o modelo mais leve e compatível.",
      "",
      "## 6. Planos",
      "**Basic:** melhora preço e limites diários.",
      "**Premium:** melhor preço, cópias ilimitadas e acesso a recursos em lote.",
      "",
      "## 7. Afiliados",
      "Afiliados autorizados podem usar `/affiliate` e cadastrar um convite com `/affiliate_register`.",
      "Quando clientes entram ou compram usando o afiliado, a comissão é registrada automaticamente quando possível.",
      "",
      "## Suporte",
      "Se algo falhar, envie o ID do pedido, o ID do UGC e um print do erro para a equipe.",
      "Não feche tickets antes de baixar seus arquivos finais.",
    ].join("\n");
  }

  return [
    "# ✨ How to Use Velvet UGC",
    "Welcome. This channel explains the official workflow for using the bot safely, quickly and clearly.",
    "",
    "## 1. Set up your account",
    "Use `/settings` to choose your language and preferred currency.",
    "Use `/balance` to check your Service Credits balance.",
    "",
    "## 2. Buy Service Credits",
    "Use `/buy` and choose how many Service Credits you want.",
    "The bot creates a secure checkout. Once payment is confirmed, your balance is released automatically.",
    "",
    "## 3. Copy an original UGC",
    "Use `/steal id:UGC_ID` to receive the original files.",
    "Use `/steal id:ID_OR_LINK` to copy UGC assets or classic clothing templates automatically.",
    "Use `/bulk_steal_clothing ids:IDS` to copy several classic clothing templates at once.",
    "Free users have a daily free limit. Basic gets a higher limit. Premium gets unlimited copies with cooldown.",
    "",
    "## 4. Remake a model with AI",
    "Use `/price` before ordering to preview the final price.",
    "Use `/remake` to remake by ID using a reference image rendered by the bot.",
    "Use `/multiview` when you have front, right, back and left images. This usually gives better results.",
    "",
    "## 5. Available choices",
    "**Texture:** no texture or standard.",
    "**Enhancement:** none, economy, standard or premium.",
    "**Triangles:** optional limit to make the model lighter and more compatible.",
    "",
    "## 6. Plans",
    "**Basic:** better pricing and higher daily limits.",
    "**Premium:** best pricing, unlimited copies and bulk features.",
    "",
    "## 7. Affiliates",
    "Approved affiliates can use `/affiliate` and register an invite with `/affiliate_register`.",
    "When customers join or purchase through an affiliate, commission is tracked automatically when possible.",
    "",
    "## Support",
    "If anything fails, send the order ID, UGC ID and a screenshot of the error to the team.",
    "Do not close tickets before downloading your final files.",
  ].join("\n");
}

function formatOfficialTerms(language) {
  if (language === "pt-BR") {
    return [
      "# Termos de Compra e Servico",
      "Ao comprar um pacote, assinar um plano ou solicitar um servico, voce concorda com estes termos.",
      "",
      "## Pagamentos e Service Credits",
      "Service Credits sao creditos internos usados apenas para pagar servicos digitais dentro da Velvet UGC.",
      "Eles nao sao dinheiro, Robux, moeda virtual ou saldo transferivel.",
      "Service Credits nao podem ser sacados, transferidos entre usuarios ou trocados por dinheiro/Robux.",
      "A compra mostra o preco do pacote de servicos, nao uma taxa de cambio ou valor de resgate.",
      "O saldo e liberado apos confirmacao do pagamento. Pagamentos em analise, pendentes ou contestados nao liberam saldo ate confirmacao final.",
      "",
      "## Entrega dos servicos",
      "Copias de UGC entregam arquivos originais disponiveis para o item informado.",
      "Modelos refeitos com IA dependem da qualidade das referencias, do ID enviado e das opcoes escolhidas pelo cliente.",
      "Resultados de IA podem variar. A equipe pode orientar ajustes quando necessario.",
      "",
      "## Responsabilidade do cliente",
      "Confira IDs, imagens, vistas multiview e opcoes antes de confirmar.",
      "Em multiview, envie apenas frente, direita, costas e esquerda, com nomes corretos e boa qualidade.",
      "",
      "## Reembolsos",
      "Pedidos ja processados, arquivos ja entregues ou creditos ja utilizados normalmente nao sao reembolsaveis.",
      "Casos de erro tecnico podem ser revisados manualmente pela equipe.",
      "",
      "## Assinaturas",
      "Planos sao cobrados mensalmente. Caso o pagamento falhe ou a assinatura seja cancelada, os beneficios e cargos podem ser removidos.",
      "",
      "## Afiliados",
      "Comissoes sao registradas conforme as regras do programa e podem ser convertidas em Service Credits para uso nos servicos Velvet.",
      "Saques, transferencias ou resgates nao sao oferecidos pelo bot.",
      "",
      "## Uso adequado",
      "Nao use o bot para fraude, spam, abuso de pagamentos, chargeback indevido ou violacao das regras do Discord, Roblox ou da comunidade.",
      "A equipe pode limitar, pausar ou bloquear acesso em caso de abuso.",
    ].join("\n");
  }

  return [
    "# Purchase and Service Terms",
    "By buying a package, subscribing to a plan or ordering a service, you agree to these terms.",
    "",
    "## Payments and Service Credits",
    "Service Credits are internal credits used only to pay for Velvet UGC digital services.",
    "They are not money, Robux, virtual currency or transferable stored value.",
    "Service Credits cannot be withdrawn, transferred between users or exchanged for cash/Robux.",
    "The checkout shows the service package price, not an exchange rate or redemption value.",
    "Balance is released after payment confirmation. Pending, under-review or disputed payments do not release balance until final confirmation.",
    "",
    "## Service delivery",
    "UGC copies deliver the original files available for the provided item.",
    "AI remakes depend on reference quality, submitted ID and the options selected by the customer.",
    "AI results may vary. The team may guide adjustments when needed.",
    "",
    "## Customer responsibility",
    "Check IDs, images, multiview sides and options before confirming.",
    "For multiview, send only front, right, back and left, with correct names and good quality.",
    "",
    "## Refunds",
    "Processed orders, delivered files or already used credits are normally non-refundable.",
    "Technical error cases may be reviewed manually by the team.",
    "",
    "## Subscriptions",
    "Plans are billed monthly. If payment fails or the subscription is canceled, benefits and roles may be removed.",
    "",
    "## Affiliates",
    "Commissions are tracked according to the affiliate program rules and may be converted into Service Credits for Velvet services.",
    "Withdrawals, transfers or redemptions are not offered by the bot.",
    "",
    "## Fair use",
    "Do not use the bot for fraud, spam, payment abuse, wrongful chargebacks or violations of Discord, Roblox or community rules.",
    "The team may limit, pause or block access in case of abuse.",
  ].join("\n");
}

function officialMessagesFor(kind, language) {
  const formatter = kind === "terms" ? formatOfficialTerms : formatOfficialGuide;
  if (language === "both") return [formatter("pt-BR"), formatter("en")];
  return [formatter(language)];
}

function formatOfficialInfoMessage(kind) {
  const e = VELVET_EMOJIS;
  const messages = {
    rules: [
      `# ${e.shield} Rules`,
      "Welcome to **Velvet Tech**.",
      "",
      "To keep the server safe, organized and professional, all members must follow the rules below.",
      "",
      `## ${e.shield} 1. Respect`,
      "Treat members, clients and staff with respect. Harassment, threats, hate speech, racism, discrimination or personal attacks are not allowed.",
      "",
      `## ${e.alert} 2. No Spam`,
      "Do not flood channels, mass ping, advertise without permission or send unrelated links.",
      "",
      `## ${e.alert} 3. No Scam Activity`,
      "Scamming, impersonation, fake payment proof, chargeback abuse or attempting to exploit the bot will result in a permanent ban.",
      "",
      `## ${e.bot} 4. Use The Correct Channels`,
      "Support, purchases, bot usage and questions must stay in the correct channels.",
      "",
      `## ${e.coin} 5. Digital Service Policy`,
      "Velvet provides digital services and file delivery. Results may vary depending on the item, reference quality and selected options.",
      "",
      `## ${e.star} 6. Staff Decisions`,
      "The team may limit, pause or remove access if a user abuses the service, violates rules or creates risk for the community.",
      "",
      "By using this server and our bot, you agree to follow these rules.",
    ],
    terms: [
      `# ${e.shield} Terms Of Service`,
      "By purchasing or using any Velvet service, you agree to these terms.",
      "",
      `## ${e.coin} Service Credits`,
      "**Service Credits** are internal credits used only for Velvet digital services.",
      "",
      "They are not money, Robux, virtual currency or stored value.",
      "",
      "Service Credits cannot be withdrawn, transferred, exchanged for cash, exchanged for Robux, or resold as balance.",
      "",
      "The checkout price represents a **digital service package**, not a cash exchange rate.",
      "",
      `## ${e.cart} Orders`,
      "Customers are responsible for checking IDs, files, references and selected options before confirming an order.",
      "",
      "Once a service has been processed or files have been delivered, the order is normally not refundable.",
      "",
      `## ${e.bot} Digital Results`,
      "Some services may involve automated processing. Results can vary depending on input quality, reference images, asset complexity and selected settings.",
      "",
      "The team may review issues manually when needed.",
      "",
      `## ${e.star} Subscriptions`,
      "Subscriptions give access to plan benefits while the plan is active. If payment fails, is canceled or is disputed, benefits and roles may be removed.",
      "",
      "Lifetime plans are one-time purchases for lifetime access to the selected plan benefits, unless the user violates server rules or payment terms.",
      "",
      `## ${e.alert} Abuse`,
      "Fraud, chargeback abuse, bot exploitation or attempts to bypass pricing may result in account restriction or permanent removal.",
    ],
    subscriptions: [
      `# ${e.star} Velvet Subscriptions`,
      "Unlock better pricing, higher limits and private workflow options with a Velvet plan.",
      "",
      `## ${e.coin} Basic - $19/month`,
      "Best for casual users who want better daily limits and lower service costs.",
      "",
      "**Includes:**",
      "- Higher free copy limits",
      "- Lower copy prices after free limits",
      "- Access to member pricing",
      "- Better support priority than free users",
      "",
      `## ${e.star} Premium - $39/month`,
      "Best for active users and creators who order frequently.",
      "",
      "**Includes:**",
      "- Unlimited UGC copies with cooldown",
      "- Unlimited clothing copies with cooldown",
      "- Bulk copy features",
      "- Lower remake prices",
      "- Private generation channel access",
      "- Better support priority",
      "",
      `## ${e.shield} Elite - $69/month`,
      "Best for serious users, resellers and high-volume clients.",
      "",
      "**Includes:**",
      "- Best pricing",
      "- Premium bulk access",
      "- Highest priority support",
      "- Private generation channel access",
      "- Strongest remake discounts",
      "- Advanced workflow options where available",
      "",
      `## ${e.cart} Lifetime Plans`,
      "For users who want long-term access without monthly renewal.",
      "",
      "**Premium Lifetime:** $299 one-time",
      "**Elite Lifetime:** $599 one-time",
      "",
      "Use `/subscribe` to generate your checkout.",
    ],
    how_to_buy: [
      `# ${e.cart} How To Buy`,
      "**Buying from Velvet is simple: add Service Credits, choose a service, and let the bot guide the delivery.**",
      "",
      `## ${e.bot} 1. Choose The Service`,
      "Use the command that matches what you need:",
      "",
      "- `/generate3d` create a guided 3D model request",
      "- `/views` render clean references from a UGC ID",
      "- `/steal` copy supported UGC files or classic clothing templates",
      "- `/buy` purchase Service Credits",
      "- `/subscribe` buy Basic, Premium, Elite or Lifetime access",
      "",
      `## ${e.coin} 2. Pay Securely`,
      "The bot will generate a checkout link.",
      "",
      "Depending on your region and selected gateway, payment may be available through Stripe, Mercado Pago or Pix when available.",
      "",
      `## ${e.star} 3. Receive Your Service`,
      "After payment confirmation, your Service Credits, role or delivery will be processed automatically when supported.",
      "",
      "If something fails, open a support ticket with:",
      "- Order ID",
      "- Discord username",
      "- Screenshot",
      "- Command used",
    ],
    credits: [
      `# ${e.coin} How Service Credits Work`,
      "**Service Credits** are Velvet's internal unit for using digital services.",
      "",
      "They help you pay for services inside the bot without creating a new checkout every time.",
      "",
      `## ${e.alert} Important`,
      "Service Credits are not money, Robux or virtual currency.",
      "",
      "They cannot be withdrawn, transferred, exchanged for cash, exchanged for Robux, or sold to another user.",
      "",
      `## ${e.cart} Reference Value`,
      "A package of **1,000 Service Credits** is sold as a **$5.45 USD service package**.",
      "",
      "This is only a service package reference, not a cash exchange rate.",
      "",
      `## ${e.bot} What You Can Use Them For`,
      "- UGC copy services",
      "- Clothing template copy",
      "- Bulk copy",
      "- Model remake",
      "- Multiview generation",
      "- Image/reference cleanup",
      "- Selected bot tools",
      "",
      "Use `/balance` to check your available Service Credits.",
    ],
    bot_instructions: [
      `# ${e.bot} Bot Instructions`,
      "**Use the commands below for the cleanest Velvet workflow.**",
      "",
      `## ${e.star} Recommended Flow`,
      "`/views` - render clean references from a UGC ID.",
      "`/generate3d` - create the final model with guided review.",
      "`/steal` - copy supported asset files or classic clothing templates.",
      "",
      `## ${e.shield} Account`,
      "`/balance` - check your Service Credits.",
      "`/buy` - purchase Service Credits.",
      "`/subscribe` - buy Basic, Premium, Elite or Lifetime access.",
      "`/settings` - update currency, language and render defaults.",
      "",
      `## ${e.cart} Bulk Tools`,
      "`/bulk_steal_clothing` - bulk copy classic clothing templates.",
      "`/bulk_steal` - premium bulk copy for UGC assets.",
      "",
      `## ${e.alert} Support`,
      "If a command fails, send the error screenshot and order ID to the team.",
    ],
    announcements: [
      `# ${e.alert} Velvet Tech Update`,
      "**Velvet Tech is upgrading the full service system.**",
      "",
      "We improved the bot, pricing structure, subscriptions and Service Credits flow to make orders faster, safer and easier to understand.",
      "",
      `## ${e.star} What Changed`,
      "- New Service Credits system",
      "- USD pricing by default",
      "- Stripe checkout support",
      "- Mercado Pago / Pix support where available",
      "- Premium and Elite Lifetime plans",
      "- Bulk clothing copy improvements",
      "- Reset Template buttons for copied clothing",
      "- Improved private workflow for paid users",
      "- Better delivery and balance messages",
      "",
      "Use `/commands` to view the available tools.",
      "",
      "More updates are coming soon.",
    ],
    update_log: [
      `# ${e.bot} Velvet Bot Update Log`,
      "We released a new service update focused on payments, subscriptions and clothing workflows.",
      "",
      `## ${e.star} Added`,
      "- Premium Lifetime plan",
      "- Elite Lifetime plan",
      "- Service Credits package language",
      "- USD pricing by default",
      "- Mercado Pago BRL handling",
      "- Reset buttons for bulk clothing templates",
      "",
      `## ${e.shield} Improved`,
      "- Subscription checkout flow",
      "- Service Credits messaging",
      "- Stripe compliance wording",
      "- Bulk clothing delivery",
      "- Admin purchase review text",
      "",
      `## ${e.alert} Fixed`,
      "- Bulk clothing templates now support Reset Template buttons",
      "- Lifetime roles now count as Premium/Elite benefits",
      "- Bot responses are now primarily English",
      "",
      "Use `/commands` to see all available commands.",
    ],
    results: [
      `# ${e.star} Our Results`,
      "Welcome to **Velvet Results**.",
      "",
      "This channel showcases examples of completed deliveries, previews and successful outputs created through Velvet services.",
      "",
      `## ${e.bot} What You May See Here`,
      "- Copied asset files",
      "- Clothing templates",
      "- Remade models",
      "- Reference previews",
      "- Customer-ready deliveries",
      "- Service quality examples",
      "",
      "Results may vary depending on the original item, selected options and reference quality.",
      "",
      "For private orders, use the proper purchase or support channels.",
    ],
  };

  return (messages[kind] || messages.bot_instructions).join("\n");
}

function imageEnhancementIsReady(enhancement) {
  const enhancementConfig = IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none;
  if (enhancement === "ai") return Boolean(OPENAI_API_KEY);
  return enhancementConfig.model === null || Boolean(GEMINI_API_KEY || NANO_BANANA_PRO_ENDPOINT);
}

function formatPriceQuote({ mode, texture, triangles, enhancement, quote }) {
  texture = normalizeTextureOption(texture);
  const textureLabel = texture === "none" ? "No texture" : "Standard";
  const enhancementLabel = (IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none).label;
  const effectiveTriangles = triangles || ROBLOX_SAFE_TRIANGLE_LIMIT;

  return [
    "## 💎 Orçamento do Refazer",
    `**Modo:** ${mode === "multiview" ? "Multiview" : "Imagem única"}`,
    `**Texture:** ${textureLabel}`,
    `**Enhancement:** ${enhancementLabel}`,
    `**Triangles:** ${effectiveTriangles} (Roblox safe default)`,
    "",
    ...quote.lines,
    "",
    `### Total: **${formatTokenAmount(quote.walletAmount)}**`,
  ].join("\n");
}

formatPriceQuote = function formatPriceQuoteClean({ mode, texture, triangles, enhancement, quote }) {
  texture = normalizeTextureOption(texture);
  const textureLabel = texture === "none" ? "No texture" : "Standard";
  const enhancementLabel = (IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none).label;
  const effectiveTriangles = triangles || ROBLOX_SAFE_TRIANGLE_LIMIT;

  return [
    "## Remake Quote",
    `**Plan:** ${quote.planLabel}`,
    `**Mode:** ${mode === "multiview" ? "Multiview" : "Single image"}`,
    `**Texture:** ${textureLabel}`,
    `**Enhancement:** ${enhancementLabel}`,
    `**Triangles:** ${effectiveTriangles} (Roblox safe default)`,
    "",
    ...quote.lines,
    "",
    `### Total: **${formatTokenAmount(quote.walletAmount)}**`,
  ].join("\n");
};

function newestDirectory(parentDir) {
  if (!fs.existsSync(parentDir)) return null;

  return fs.readdirSync(parentDir)
    .map(name => path.join(parentDir, name))
    .filter(file => fs.statSync(file).isDirectory())
    .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file || null;
}

function newestImportedTripoModel() {
  const refazerDir = path.join(__dirname, "temp", "refazer");
  const runDirs = fs.existsSync(refazerDir)
    ? fs.readdirSync(refazerDir)
      .map(name => path.join(refazerDir, name))
      .filter(file => fs.statSync(file).isDirectory())
    : [];

  const models = [];

  for (const runDir of runDirs) {
    const tripoDir = path.join(runDir, "tripo_ai");
    if (!fs.existsSync(tripoDir)) continue;

    for (const file of fs.readdirSync(tripoDir)) {
      if (!file.startsWith("tripo_real.")) continue;

      const modelPath = path.join(tripoDir, file);
      models.push({
        modelPath,
        runDir,
        mtime: fs.statSync(modelPath).mtimeMs,
      });
    }
  }

  return models.sort((a, b) => b.mtime - a.mtime)[0] || null;
}

function hasRole(interaction, roleId) {
  return interaction.member.roles.cache.has(roleId);
}

function memberHasRole(member, roleId) {
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function userIsPremium(interaction) {
  return hasRole(interaction, PREMIUM_ROLE) || hasRole(interaction, PREMIUM_LIFETIME_ROLE);
}

function userIsElite(interaction) {
  return hasRole(interaction, ELITE_ROLE) || hasRole(interaction, ELITE_LIFETIME_ROLE);
}

function userHasPremiumAccess(interaction) {
  return userIsPremium(interaction) || userIsElite(interaction);
}

function userIsAdmin(interaction) {
  return hasRole(interaction, ADMIN_ROLE);
}

function userIsAffiliate(interaction) {
  return userIsAdmin(interaction) || hasRole(interaction, AFFILIATE_ROLE);
}

function userIsAllowed(interaction) {
  return userIsAdmin(interaction) || hasRole(interaction, ELITE_ROLE) || hasRole(interaction, ELITE_LIFETIME_ROLE) || hasRole(interaction, PREMIUM_ROLE) || hasRole(interaction, PREMIUM_LIFETIME_ROLE) || hasRole(interaction, NORMAL_ROLE) || hasRole(interaction, FREE_ROLE) || hasRole(interaction, AFFILIATE_ROLE);
}

function commandChannelIsAllowed(interaction) {
  if (!COMMAND_CHANNEL_IDS.size) return true;
  if (COMMAND_CHANNEL_ADMIN_BYPASS && userIsAdmin(interaction)) return true;
  return COMMAND_CHANNEL_IDS.has(interaction.channelId);
}

function formatAllowedCommandChannelsMessage(language = "en") {
  const channels = [...COMMAND_CHANNEL_IDS].map(id => `<#${id}>`).join(", ");
  if (language === "pt-BR") {
    return [
      "## Canal incorreto",
      `Use o bot em: ${channels || "o canal oficial do bot"}.`,
    ].join("\n");
  }
  if (language === "es") {
    return [
      "## Canal incorrecto",
      `Usa el bot en: ${channels || "el canal oficial del bot"}.`,
    ].join("\n");
  }
  return [
    "## Commands are limited to specific channels",
    `Please use the bot in: ${channels || "the official bot channel"}.`,
  ].join("\n");
}

function formatCooldownMessage(seconds, language = "en") {
  if (language === "pt-BR") return `⏳ Aguarde ${seconds}s antes de usar outro comando.`;
  if (language === "es") return `⏳ Espera ${seconds}s antes de usar otro comando.`;
  return `⏳ Wait ${seconds}s before using another command.`;
}

async function checkCooldown(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const last = cooldowns.get(userId) || 0;

  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);

    await interaction.reply({
      content: formatCooldownMessage(wait, languageFor(interaction)),
      flags: 64,
    }).catch(() => {});

    return false;
  }

  cooldowns.set(userId, now);
  return true;
}

async function downloadBuffer(url) {
  assertRobloxSafeModeAvailable();

  const headers = {};

  if (ROBLOSECURITY) {
    headers.Cookie = `.ROBLOSECURITY=${ROBLOSECURITY}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Nao consegui processar esse item. Talvez seja bundle, cabeca dinamica, emote, corpo ou roupa 3D ainda nao suportado.");
    }

    if (res.status === 401 || res.status === 403) {
      markRobloxAuthProblem({
        status: res.status,
        url,
        message: "Roblox denied access with the current cookie/account.",
      });
      throw new Error("Nao tenho permissao para acessar esse item.");
    }

    throw new Error(`Falha ao processar o item. Codigo: ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function downloadRobloxAsset(assetId) {
  assertRobloxSafeModeAvailable();

  const url = `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`;
  const headers = {};
  if (ROBLOSECURITY) {
    headers.Cookie = `.ROBLOSECURITY=${ROBLOSECURITY}`;
  }

  const res = await fetch(url, { headers });
  if (res.ok) {
    return Buffer.from(await res.arrayBuffer());
  }

  if (res.status === 404) {
    throw new Error("Nao consegui processar esse item. Talvez seja bundle, cabeca dinamica, emote, corpo ou roupa 3D ainda nao suportado.");
  }

  const source = await fetchRobloxAssetSource(assetId);
  return source.buffer;
}

function robloxHeaders(extra = {}, cookie = ROBLOX_COOKIES[0]) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
    ...extra,
  };

  if (cookie) {
    headers.Cookie = `.ROBLOSECURITY=${cookie}`;
  }

  return headers;
}

const ROBLOX_ASSET_SOURCE_CACHE_TTL_MS = 10 * 60 * 1000;
const ROBLOX_REQUEST_INTERVAL_MS = Number(process.env.REFAZER_ROBLOX_REQUEST_INTERVAL_MS || 1200);
const ROBLOX_RATE_LIMIT_PAUSE_MS = Number(process.env.REFAZER_ROBLOX_RATE_LIMIT_PAUSE_MS || 120000);
const ROBLOX_AUTH_PAUSE_MS = Number(process.env.REFAZER_ROBLOX_AUTH_PAUSE_MS || 15 * 60 * 1000);
const robloxAssetSourceCache = new Map();
let nextRobloxRequestAt = 0;
let robloxRateLimitedUntil = 0;
let nextRobloxPublicRequestAt = 0;
let robloxPublicRateLimitedUntil = 0;
const robloxHealth = {
  pausedUntil: 0,
  lastError: "",
  lastStatus: 0,
  lastUrl: "",
  lastAt: null,
};
const sniperCatalogCache = new Map();
const sniperInFlightScans = new Map();
let lastSniperDebug = null;
const SNIPER_CACHE_VERSION = "typed-v2-manual-keyword-only";
const SNIPER_CATALOG_CACHE_TTL_MS = Number(process.env.REFAZER_SNIPER_CACHE_TTL_MS || 45 * 1000);
const SNIPER_CATALOG_STALE_CACHE_TTL_MS = Number(process.env.REFAZER_SNIPER_STALE_CACHE_TTL_MS || 5 * 60 * 1000);
const SNIPER_CATALOG_CACHE_ENABLED = cleanEnv(process.env.REFAZER_SNIPER_CACHE_ENABLED, "true") !== "false";
const SNIPER_COMMAND_TIMEOUT_MS = Number(process.env.REFAZER_SNIPER_COMMAND_TIMEOUT_MS || 70000);
const SNIPER_DETAIL_LIMIT = Number(process.env.REFAZER_SNIPER_DETAIL_LIMIT || 8);
const SNIPER_SEARCH_LIMIT = Number(process.env.REFAZER_SNIPER_SEARCH_LIMIT || 10);
const SNIPER_MAX_PAGES_WITH_AGE = Number(process.env.REFAZER_SNIPER_MAX_PAGES_WITH_AGE || 12);
const SNIPER_NORMAL_SCAN_ROWS = Number(process.env.REFAZER_SNIPER_NORMAL_SCAN_ROWS || 600);
const SNIPER_DEEP_SCAN_ROWS = Number(process.env.REFAZER_SNIPER_DEEP_SCAN_ROWS || 1000);
const SNIPER_LIMITED_DETAIL_SCAN_LIMIT = Number(process.env.REFAZER_SNIPER_LIMITED_DETAIL_SCAN_LIMIT || 90);
const SNIPER_LIMITED_DEEP_DETAIL_SCAN_LIMIT = Number(process.env.REFAZER_SNIPER_LIMITED_DEEP_DETAIL_SCAN_LIMIT || 180);
const SNIPER_PUBLIC_WAIT_LIMIT_MS = Number(process.env.REFAZER_SNIPER_PUBLIC_WAIT_LIMIT_MS || 15000);
const SNIPER_PAGE_DELAY_MS = Number(process.env.REFAZER_SNIPER_PAGE_DELAY_MS || 1600);
const SNIPER_CATEGORY_DELAY_MS = Number(process.env.REFAZER_SNIPER_CATEGORY_DELAY_MS || 2500);
const SNIPER_QUEUE_WAIT_LIMIT_MS = Number(process.env.REFAZER_SNIPER_QUEUE_WAIT_LIMIT_MS || 30000);
const SNIPER_HISTORY_ENABLED = cleanEnv(process.env.REFAZER_SNIPER_HISTORY_ENABLED, "true") !== "false";
const SNIPER_HISTORY_DEPTH = Number(process.env.REFAZER_SNIPER_HISTORY_DEPTH || 1000);
const SNIPER_HISTORY_INTERVAL_MS = Number(process.env.REFAZER_SNIPER_HISTORY_INTERVAL_MS || 30 * 60 * 1000);
const SNIPER_HISTORY_START_DELAY_MS = Number(process.env.REFAZER_SNIPER_HISTORY_START_DELAY_MS || 60 * 1000);
const SNIPER_HISTORY_PAGE_DELAY_MS = Number(process.env.REFAZER_SNIPER_HISTORY_PAGE_DELAY_MS || 6000);
const SNIPER_HISTORY_CATEGORY_DELAY_MS = Number(process.env.REFAZER_SNIPER_HISTORY_CATEGORY_DELAY_MS || 30000);
const SNIPER_HISTORY_STALE_MS = Number(process.env.REFAZER_SNIPER_HISTORY_STALE_MS || 2 * 60 * 60 * 1000);
const SNIPER_HISTORY_RETENTION_DAYS = Number(process.env.REFAZER_SNIPER_HISTORY_RETENTION_DAYS || 7);
const SNIPER_HISTORY_CATEGORIES = parseIdListEnv(
  process.env.REFAZER_SNIPER_HISTORY_CATEGORIES || "hair,hats,face_accessories,back_accessories"
);
const SNIPER_HISTORY_WINDOWS = parseIdListEnv(
  process.env.REFAZER_SNIPER_HISTORY_WINDOWS || "yesterday,week"
);
const SNIPER_ALERT_CHANNEL_ID = cleanEnv(process.env.REFAZER_SNIPER_ALERT_CHANNEL_ID, "1531516456452231228");
const SNIPER_ALERT_MIN_RANK_GAIN = Number(process.env.REFAZER_SNIPER_ALERT_MIN_RANK_GAIN || 150);
const SNIPER_ALERT_MAX_CURRENT_RANK = Number(process.env.REFAZER_SNIPER_ALERT_MAX_CURRENT_RANK || 250);
const SNIPER_ALERT_MAX_AGE_DAYS = Number(process.env.REFAZER_SNIPER_ALERT_MAX_AGE_DAYS || 90);
const SNIPER_ALERT_MAX_PER_SCAN = Number(process.env.REFAZER_SNIPER_ALERT_MAX_PER_SCAN || 5);
const ROBLOX_PUBLIC_MIRROR_ENABLED = cleanEnv(process.env.REFAZER_ROBLOX_PUBLIC_MIRROR_ENABLED, "true") !== "false";
let sniperBusyUntil = 0;
let sniperHistoryWorkerRunning = false;
let sniperHistoryWorkerTimer = null;
let sniperHistoryLastRun = null;
let sniperHistoryLastError = "";
let sniperHistoryLastSummary = null;
const SNIPER_HISTORY_CURRENT_PATH = path.join(__dirname, "data", "sniper_history_current.json");
const SNIPER_HISTORY_SNAPSHOTS_PATH = path.join(__dirname, "data", "sniper_history_snapshots.jsonl");

const SNIPER_ACCESSORY_SUBCATEGORIES = [
  "hats",
  "hair",
  "face_accessories",
  "neck_accessories",
  "shoulder_accessories",
  "front_accessories",
  "back_accessories",
  "waist_accessories",
];

function sniperSearchCategoriesFor(category) {
  if (category === "accessories") return SNIPER_ACCESSORY_SUBCATEGORIES;
  return [
    category,
    ...(SNIPER_CATEGORY_FALLBACKS[category] || []),
  ].filter((item, index, list) => item && list.indexOf(item) === index);
}

function isRobloxRateLimitError(err) {
  const message = String(err?.message || err || "");
  return message.includes("rate-limiting") || message.includes("Too many requests") || message.includes("(429)");
}

function robloxCatalogSearchLimit(preferWide = false) {
  if (preferWide) return "30";
  const requested = Number(SNIPER_SEARCH_LIMIT);
  if (requested <= 10) return "10";
  if (requested <= 28) return "28";
  return "30";
}

function sniperCanUseCatalogV2(category) {
  return Array.isArray(SNIPER_CATEGORY_ASSET_TYPES[category]) && SNIPER_CATEGORY_ASSET_TYPES[category].length > 0;
}

function sniperWindowParamsForSearch(attemptParams, useV2Search) {
  if (!useV2Search) return attemptParams;
  const params = {};
  if (attemptParams.SortType !== undefined) params.sortType = attemptParams.SortType;
  if (attemptParams.SortAggregation !== undefined) params.sortAggregation = attemptParams.SortAggregation;
  return params;
}

function robloxPauseRemainingMs() {
  return Math.max(0, robloxHealth.pausedUntil - Date.now());
}

function robloxSafeModeIsPaused() {
  return robloxPauseRemainingMs() > 0;
}

function markRobloxAuthProblem({ status, url, message }) {
  robloxHealth.pausedUntil = Date.now() + ROBLOX_AUTH_PAUSE_MS;
  robloxHealth.lastError = message || "Roblox auth/access problem";
  robloxHealth.lastStatus = status || 0;
  robloxHealth.lastUrl = url || "";
  robloxHealth.lastAt = new Date().toISOString();
}

function clearRobloxSafePause() {
  robloxHealth.pausedUntil = 0;
  robloxHealth.lastError = "";
  robloxHealth.lastStatus = 0;
}

function assertRobloxSafeModeAvailable() {
  if (!robloxSafeModeIsPaused()) return;
  const minutes = Math.ceil(robloxPauseRemainingMs() / 60000);
  throw new Error(
    `Roblox Safe Mode is active for about ${minutes} more minute(s). ` +
    "Roblox access was paused after an auth/access failure. Use /multiview or /image_model with uploaded images."
  );
}

function robloxStatusMessage() {
  const paused = robloxSafeModeIsPaused();
  const lines = [
    "## Roblox Access Status",
    `**Safe Mode:** ${paused ? "Paused" : "Ready"}`,
    `**Pause remaining:** ${paused ? `${Math.ceil(robloxPauseRemainingMs() / 60000)} min` : "none"}`,
    `**Configured cookies:** ${ROBLOX_COOKIES.length}`,
    `**Request interval:** ${ROBLOX_REQUEST_INTERVAL_MS}ms`,
    `**Rate-limit pause:** ${Math.ceil(ROBLOX_RATE_LIMIT_PAUSE_MS / 60000)} min`,
    `**Auth/access pause:** ${Math.ceil(ROBLOX_AUTH_PAUSE_MS / 60000)} min`,
  ];

  if (robloxHealth.lastAt) {
    lines.push(
      "",
      "### Last Roblox issue",
      `**At:** ${robloxHealth.lastAt}`,
      `**Status:** ${robloxHealth.lastStatus || "unknown"}`,
      `**Error:** ${robloxHealth.lastError || "none"}`,
      `**URL:** ${robloxHealth.lastUrl || "unknown"}`
    );
  }

  lines.push(
    "",
    "When Safe Mode is paused, Roblox-dependent commands like `/views`, `/steal` and bulk copy should wait. AI commands with uploaded images still work."
  );

  return lines.join("\n");
}

function formatAdminSystemStatusMessage() {
  const paused = robloxSafeModeIsPaused();
  const pendingActions = Array.from(pendingMultiviewActions.values());
  const generating = pendingActions.filter(action => ["generating", "generated", "delivered_pending_charge"].includes(action.status)).length;
  const needsReview = pendingActions.filter(action =>
    ["delivery_failed", "delivered_charge_failed", "interrupted", "insufficient_balance_before_delivery"].includes(action.status)
  ).length;
  const db = readWalletDb();
  const pendingPurchases = (db.purchaseRequests || []).filter(item => item.status === "pending").length;
  const pendingWithdrawals = (db.withdrawalRequests || []).filter(item => item.status === "pending").length;
  const sniperCooldownMs = Math.max(0, sniperBusyUntil - Date.now());

  return [
    "# 🛡️ Velvet Admin Status",
    "**Operational snapshot for the bot, APIs and pending queues.**",
    "",
    "## 🤖 AI Engines",
    uiLine("Model provider", activeModelEngineLabel()),
    uiLine("Hyper3D key", HYPER3D_API_KEY ? "configured" : "missing"),
    uiLine("OpenAI image key", OPENAI_API_KEY ? "configured" : "missing"),
    uiLine("Tripo fallback", TRIPO_API_KEY || TRIPO_AI_ENDPOINT ? "configured" : "missing"),
    "",
    "## 🧱 Roblox Access",
    uiLine("Safe Mode", paused ? "paused" : "ready"),
    uiLine("Pause remaining", paused ? `${Math.ceil(robloxPauseRemainingMs() / 60000)} min` : "none"),
    uiLine("Configured cookies", ROBLOX_COOKIES.length),
    uiLine("Last issue", robloxHealth.lastError || "none"),
    "",
    "## 📦 Queues",
    uiLine("Pending model actions", pendingMultiviewActions.size),
    uiLine("Generating / finalizing", generating),
    uiLine("Needs review", needsReview),
    uiLine("Pending purchases", pendingPurchases),
    uiLine("Pending withdrawals", pendingWithdrawals),
    "",
    "## 🎯 Sniper",
    uiLine("Cooldown", sniperCooldownMs ? `${Math.ceil(sniperCooldownMs / 1000)}s` : "ready"),
    uiLine("Cache entries", sniperCatalogCache.size),
    uiLine("History worker", SNIPER_HISTORY_ENABLED ? (sniperHistoryWorkerRunning ? "running" : "enabled") : "disabled"),
    uiLine("History depth", SNIPER_HISTORY_DEPTH),
    uiLine("History categories", SNIPER_HISTORY_CATEGORIES.join(", ") || "none"),
    uiLine("History windows", SNIPER_HISTORY_WINDOWS.join(", ") || "none"),
    uiLine("Last history run", sniperHistoryLastRun || "never"),
    uiLine("Last history error", sniperHistoryLastError || "none"),
    uiLine("Alert channel", SNIPER_ALERT_CHANNEL_ID ? `<#${SNIPER_ALERT_CHANNEL_ID}>` : "disabled"),
    uiLine("Alert threshold", `+${SNIPER_ALERT_MIN_RANK_GAIN} ranks into top ${SNIPER_ALERT_MAX_CURRENT_RANK}`),
    "",
    "Use `/admin_roblox_status` for detailed Roblox cookie diagnostics.",
  ].join("\n");
}

async function waitForRobloxSlot() {
  const now = Date.now();
  const waitUntil = Math.max(nextRobloxRequestAt, robloxRateLimitedUntil);
  if (waitUntil > now) {
    await wait(waitUntil - now);
  }

  nextRobloxRequestAt = Date.now() + ROBLOX_REQUEST_INTERVAL_MS;
}

async function waitForRobloxPublicSlot(maxWaitMs = null) {
  const now = Date.now();
  const waitUntil = Math.max(nextRobloxPublicRequestAt, robloxPublicRateLimitedUntil);
  if (waitUntil > now) {
    const delay = waitUntil - now;
    if (Number.isFinite(maxWaitMs) && delay > maxWaitMs) {
      throw new Error(`Roblox catalog is cooling down for about ${Math.ceil(delay / 1000)}s after rate-limiting.`);
    }
    await wait(delay);
  }

  nextRobloxPublicRequestAt = Date.now() + Math.max(2000, ROBLOX_REQUEST_INTERVAL_MS);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelayFromResponse(res, attempt) {
  const retryAfter = Number(res.headers.get("retry-after") || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 30000);
  }

  return Math.min(1500 * 2 ** attempt, 12000);
}

async function fetchRobloxWithRetry(url, options = {}, attempts = 4) {
  assertRobloxSafeModeAvailable();

  let lastText = "";
  let lastStatus = 0;
  const cookies = ROBLOX_COOKIES.length ? ROBLOX_COOKIES : [""];
  const originalHeaders = options.headers || {};

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let retryDelay = 0;

    for (let cookieIndex = 0; cookieIndex < cookies.length; cookieIndex += 1) {
      await waitForRobloxSlot();

      const headers = { ...originalHeaders };
      if (headers.Cookie && cookies[cookieIndex]) {
        headers.Cookie = `.ROBLOSECURITY=${cookies[cookieIndex]}`;
      }

      const res = await fetch(url, { ...options, headers });

      if ((res.status === 401 || res.status === 403) && cookieIndex < cookies.length - 1) {
        lastStatus = res.status;
        lastText = await res.text().catch(() => "");
        console.warn(`Roblox request returned ${res.status} with cookie ${cookieIndex + 1}/${cookies.length}; trying next cookie.`);
        continue;
      }

      if (res.status !== 429) {
        return res;
      }

      lastStatus = res.status;
      lastText = await res.text().catch(() => "");
      retryDelay = retryDelayFromResponse(res, attempt);
      robloxRateLimitedUntil = Date.now() + retryDelay;
      break;
    }

    if (retryDelay && attempt < attempts - 1) {
      await wait(retryDelay);
    }
  }

  throw new Error(
    "Roblox is rate-limiting requests right now. Wait a few minutes and try again. " +
    `Last response (${lastStatus}): ${lastText.slice(0, 300)}`
  );
}

async function fetchRobloxJson(url) {
  const res = await fetchRobloxWithRetry(url, { headers: robloxHeaders() });
  const text = await res.text();

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      markRobloxAuthProblem({
        status: res.status,
        url,
        message: `Roblox denied JSON/API access with the current cookie/account: ${text.slice(0, 180)}`,
      });
    }
    throw new Error(`Roblox request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return JSON.parse(text);
}

async function fetchRobloxAssetDeliveryV2(assetId) {
  const url = `https://assetdelivery.roblox.com/v2/asset/?id=${encodeURIComponent(assetId)}`;
  const formats = ["source", "rbxm", "rbxmx", ""];
  let lastStatus = 0;
  let lastText = "";

  for (const format of formats) {
    const extraHeaders = format ? { "Roblox-AssetFormat": format } : {};
    const res = await fetchRobloxWithRetry(url, { headers: robloxHeaders(extraHeaders) });
    const text = await res.text();

    if (res.ok) {
      console.log(`Roblox assetdelivery v2 accepted ${assetId} with format=${format || "default"}`);
      return JSON.parse(text);
    }

    lastStatus = res.status;
    lastText = text;

    if (![400, 401, 403, 415].includes(res.status)) {
      throw new Error(`Roblox assetdelivery v2 failed (${res.status}): ${text.slice(0, 300)}`);
    }
  }

  if (lastStatus === 401 || lastStatus === 403) {
    markRobloxAuthProblem({
      status: lastStatus,
      url,
      message: `Roblox denied assetdelivery v2 access with every asset format: ${lastText.slice(0, 180)}`,
    });
  }

  throw new Error(`Roblox request failed (${lastStatus}): ${lastText.slice(0, 300)}`);
}

function robloxPublicUrlVariants(url) {
  const variants = [url];
  if (!ROBLOX_PUBLIC_MIRROR_ENABLED) return variants;

  const mirrorUrl = url
    .replace("https://catalog.roblox.com/", "https://catalog.roproxy.com/")
    .replace("https://economy.roblox.com/", "https://economy.roproxy.com/");

  if (mirrorUrl !== url) variants.push(mirrorUrl);
  return variants;
}

async function fetchRobloxPublicJson(url, options = {}) {
  const variants = robloxPublicUrlVariants(url);
  let lastError = null;
  let lastRateLimitDelay = 0;

  for (let index = 0; index < variants.length; index += 1) {
    const targetUrl = variants[index];
    const isMirror = index > 0;

    if (!isMirror) {
      try {
        await waitForRobloxPublicSlot(options.maxWaitMs ?? null);
      } catch (err) {
        lastError = err;
        if (index < variants.length - 1) {
          console.warn(`Roblox public catalog cooldown active; trying mirror for ${url}`);
          continue;
        }
        throw err;
      }
    }

    const res = await fetch(targetUrl, {
      headers: robloxHeaders({}, ""),
    });
    const text = await res.text();

    if (res.status === 429) {
      const retryDelay = retryDelayFromResponse(res, 0);
      lastRateLimitDelay = Math.max(lastRateLimitDelay, retryDelay);
      lastError = new Error(`Roblox catalog is rate-limiting public searches right now. Last response (429): ${text.slice(0, 300)}`);
      if (index < variants.length - 1) {
        console.warn(`Roblox public catalog returned 429; trying mirror for ${url}`);
        continue;
      }
      robloxPublicRateLimitedUntil = Date.now() + Math.max(lastRateLimitDelay, ROBLOX_RATE_LIMIT_PAUSE_MS);
      throw lastError;
    }

    if (!res.ok) {
      lastError = new Error(`Roblox public catalog request failed (${res.status}): ${text.slice(0, 300)}`);
      if (index < variants.length - 1) continue;
      throw lastError;
    }

    if (isMirror) {
      console.log(`Roblox public mirror served: ${targetUrl}`);
    }
    return JSON.parse(text);
  }

  throw lastError || new Error("Roblox public catalog request failed.");
}

const SNIPER_CATEGORY_PARAMS = {
  all: {},
  accessories: { Category: "11" },
  hats: { Category: "11", AssetTypes: "8" },
  hair: { Category: "11", AssetTypes: "41" },
  face_accessories: { Category: "11", AssetTypes: "42" },
  neck_accessories: { Category: "11", AssetTypes: "43" },
  shoulder_accessories: { Category: "11", AssetTypes: "44" },
  front_accessories: { Category: "11", AssetTypes: "45" },
  back_accessories: { Category: "11", AssetTypes: "46" },
  waist_accessories: { Category: "11", AssetTypes: "47" },
  faces: { Category: "4", AssetTypes: "18" },
  heads: { Category: "4", AssetTypes: "17,79" },
  bundles: { Category: "17", BundleTypes: "1,2,3" },
  classic_shirts: { Category: "3", AssetTypes: "11" },
  classic_pants: { Category: "3", AssetTypes: "12" },
  tshirts: { Category: "3", AssetTypes: "2" },
  layered_clothing: { Category: "3", AssetTypes: "64,65,66,67,68,69,70,71,72" },
  clothing: { Category: "3" },
  collectibles: { SalesTypeFilter: "2" },
};

const SNIPER_TAXONOMY_CATEGORIES = new Set(
  Object.entries(SNIPER_CATEGORY_PARAMS)
    .filter(([, params]) => params.taxonomy)
    .map(([category]) => category)
);

const SNIPER_CATEGORY_LABELS = {
  all: "All",
  accessories: "Accessories",
  hats: "Hats",
  hair: "Hair",
  face_accessories: "Face accessories",
  neck_accessories: "Neck accessories",
  shoulder_accessories: "Shoulder accessories",
  front_accessories: "Front accessories",
  back_accessories: "Back accessories",
  waist_accessories: "Waist accessories",
  faces: "Faces",
  heads: "Heads",
  bundles: "Bundles",
  classic_shirts: "Classic shirts",
  classic_pants: "Classic pants",
  tshirts: "T-shirts",
  layered_clothing: "Layered clothing",
  clothing: "Clothing",
  collectibles: "Collectibles",
};

const SNIPER_WINDOW_LABELS = {
  today: "Best today",
  yesterday: "Best yesterday",
  recent: "Recently published",
  week: "Best this week",
  total: "Best all time",
};

const SNIPER_CATEGORY_ASSET_TYPES = {
  accessories: [8, 41, 42, 43, 44, 45, 46, 47],
  hats: [8],
  hair: [41],
  face_accessories: [42],
  neck_accessories: [43],
  shoulder_accessories: [44],
  front_accessories: [45],
  back_accessories: [46],
  waist_accessories: [47],
  faces: [18],
  heads: [17, 79],
  classic_shirts: [11],
  classic_pants: [12],
  tshirts: [2],
  layered_clothing: [64, 65, 66, 67, 68, 69, 70, 71, 72],
  clothing: [2, 11, 12, 64, 65, 66, 67, 68, 69, 70, 71, 72],
};

function sniperCategoryFromAssetType(assetTypeId) {
  const value = Number(assetTypeId);
  for (const [category, assetTypes] of Object.entries(SNIPER_CATEGORY_ASSET_TYPES)) {
    if (category === "accessories" || category === "clothing") continue;
    if (assetTypes.includes(value)) return category;
  }
  return null;
}

const SNIPER_CATEGORY_FALLBACKS = {
  hats: ["accessories", "all"],
  hair: ["all"],
  face_accessories: ["accessories", "all"],
  neck_accessories: ["accessories", "all"],
  shoulder_accessories: ["accessories", "all"],
  front_accessories: ["accessories", "all"],
  back_accessories: ["accessories", "all"],
  waist_accessories: ["accessories", "all"],
  faces: ["all"],
  heads: ["all"],
  bundles: ["all"],
  classic_shirts: ["clothing", "all"],
  classic_pants: ["clothing", "all"],
  tshirts: ["clothing", "all"],
  layered_clothing: ["clothing", "all"],
  clothing: ["all"],
  accessories: ["all"],
  collectibles: ["all"],
};

const ROBLOX_ASSET_TYPE_NAME_TO_ID = {
  tshirt: 2,
  t_shirt: 2,
  hat: 8,
  shirt: 11,
  pants: 12,
  head: 17,
  face: 18,
  hairaccessory: 41,
  hair: 41,
  faceaccessory: 42,
  neckaccessory: 43,
  shoulderaccessory: 44,
  frontaccessory: 45,
  backaccessory: 46,
  waistaccessory: 47,
  tshirtaccessory: 64,
  shirtaccessory: 65,
  pantsaccessory: 66,
  jacketaccessory: 67,
  sweateraccessory: 68,
  shortsaccessory: 69,
  leftshoeaccessory: 70,
  rightshoeaccessory: 71,
  dressskirtaccessory: 72,
  dynamichead: 79,
};

const SNIPER_CATEGORY_NAME_HINTS = {
  hats: ["hat", "cap", "helmet", "crown", "chapeu", "chapéu", "bone", "boné", "capacete", "coroa"],
  hair: ["hair", "cabelo", "cabelos", "penteado"],
  face_accessories: ["face accessory", "face", "rosto", "mask", "mascara", "máscara", "glasses", "oculos", "óculos"],
  neck_accessories: ["neck", "collar", "chain", "necklace", "pescoço", "pescoco", "colar", "corrente"],
  shoulder_accessories: ["shoulder", "ombro"],
  front_accessories: ["front", "chest", "frente", "peito"],
  back_accessories: ["back", "costas", "asa", "wings", "mochila", "backpack"],
  waist_accessories: ["waist", "belt", "cintura", "cinto"],
  faces: ["face", "rosto", "smile", "sorriso"],
  heads: ["head", "cabeça", "cabeca"],
  classic_shirts: ["shirt", "camisa"],
  classic_pants: ["pants", "calca", "calça"],
  tshirts: ["t-shirt", "tshirt", "camiseta"],
  layered_clothing: ["jacket", "sweater", "shorts", "dress", "skirt", "jaqueta", "vestido", "saia"],
};

const SNIPER_FORBIDDEN_TYPE_HINTS = [
  "emote",
  "animation",
  "pose",
  "walk",
  "run",
  "jump",
  "idle",
  "swim",
  "climb",
];

const SNIPER_WINDOW_PARAMS = {
  today: [
    { SortType: "2", SortAggregation: "1" },
    { SortType: "1", SortAggregation: "1" },
    { SortType: "2", SortAggregation: "3" },
  ],
  yesterday: [
    { SortType: "2", SortAggregation: "2" },
    { SortType: "1", SortAggregation: "2" },
    { SortType: "2", SortAggregation: "3" },
  ],
  recent: [
    { SortType: "3" },
    { SortType: "0" },
  ],
  week: [
    { SortType: "2", SortAggregation: "3" },
    { SortType: "1", SortAggregation: "3" },
    { SortType: "2" },
  ],
  total: [
    { SortType: "2", SortAggregation: "5" },
    { SortType: "1", SortAggregation: "5" },
    { SortType: "2" },
  ],
};

function catalogItemId(item) {
  return item.id || item.assetId || item.itemTargetId || item.item?.id || null;
}

function catalogAssetTypeId(item, details = {}) {
  const candidates = [
    item.assetType,
    item.assetTypeId,
    item.assetTypeID,
    item.item?.assetType,
    item.item?.assetTypeId,
    details.AssetTypeId,
    details.AssetTypeID,
    details.AssetType,
  ];
  for (const candidate of candidates) {
    const number = Number(candidate);
    if (Number.isFinite(number)) return number;

    const key = String(candidate || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (ROBLOX_ASSET_TYPE_NAME_TO_ID[key]) return ROBLOX_ASSET_TYPE_NAME_TO_ID[key];
  }

  return null;
}

function catalogItemKind(item, details = {}) {
  return String(item.itemType || item.item?.itemType || details.ItemType || details.AssetType || "").toLowerCase();
}

function normalizeSniperText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sniperNameSuggestsCategory(category, item, details = {}) {
  if (!category || ["all", "accessories", "clothing", "collectibles"].includes(category)) return true;

  const hints = SNIPER_CATEGORY_NAME_HINTS[category];
  if (!hints?.length) return true;

  const text = normalizeSniperText([
    item.name,
    item.item?.name,
    item.assetType,
    item.assetTypeId,
    item.item?.assetType,
    details.Name,
    details.AssetType,
  ].filter(Boolean).join(" "));

  return hints.some(hint => text.includes(normalizeSniperText(hint)));
}

function sniperLooksForbiddenForSpecificCategory(category, item, details = {}) {
  if (!category || ["all", "accessories", "clothing", "collectibles"].includes(category)) return false;

  const text = normalizeSniperText([
    item.name,
    item.item?.name,
    item.assetType,
    item.item?.assetType,
    item.itemType,
    details.Name,
    details.AssetType,
    details.ItemType,
  ].filter(Boolean).join(" "));

  return SNIPER_FORBIDDEN_TYPE_HINTS.some(hint => text.includes(hint));
}

function sniperCategoryMatches(category, item, details = {}) {
  if (!category || category === "all" || category === "collectibles") return true;

  if (category === "bundles") {
    return catalogItemKind(item, details).includes("bundle");
  }

  const allowedTypes = SNIPER_CATEGORY_ASSET_TYPES[category];
  if (!allowedTypes) return true;

  const assetTypeId = catalogAssetTypeId(item, details);
  return assetTypeId !== null && allowedTypes.includes(assetTypeId);
}

function sniperCategoryCanBeVerified(category, item, details = {}) {
  if (!category || category === "all" || category === "collectibles") return true;
  if (category === "bundles") return Boolean(catalogItemKind(item, details));
  return catalogAssetTypeId(item, details) !== null;
}

function catalogItemPrice(item, details = {}) {
  const candidates = [
    item.price,
    item.lowestPrice,
    item.lowestResalePrice,
    item.purchasePrice,
    details.PriceInRobux,
    details.Price,
    details.LowestPrice,
  ];
  const value = candidates.find(number => Number.isFinite(Number(number)));
  return value === undefined ? null : Number(value);
}

function sniperPriceMatchesFilter(item, details = {}, minPrice = null, maxPrice = null) {
  const price = catalogItemPrice(item, details);

  if (Number.isFinite(minPrice) && (price === null || price < minPrice)) return false;
  if (Number.isFinite(maxPrice) && (price === null || price > maxPrice)) return false;

  return true;
}

function catalogLimitedSignals(item, details = {}) {
  const restrictions = [
    ...(item.itemRestrictions || []),
    ...(item.item?.itemRestrictions || []),
    ...(details.itemRestrictions || []),
    ...(details.ItemRestrictions || []),
  ].map(value => String(value || "").toLowerCase());
  const collectibleId = item.collectibleItemId
    || item.item?.collectibleItemId
    || details.collectibleItemId
    || details.CollectibleItemId
    || "";
  const hasResellers = Boolean(item.hasResellers || item.item?.hasResellers || details.hasResellers || details.HasResellers);
  const resalePrice = normalizeCatalogNumber(
    item.lowestResalePrice,
    item.item?.lowestResalePrice,
    details.lowestResalePrice,
    details.LowestResalePrice
  );
  const totalQuantity = normalizeCatalogNumber(
    item.totalQuantity,
    item.item?.totalQuantity,
    details.totalQuantity,
    details.TotalQuantity
  );
  const available = normalizeCatalogNumber(
    item.unitsAvailableForConsumption,
    item.item?.unitsAvailableForConsumption,
    details.unitsAvailableForConsumption,
    details.UnitsAvailableForConsumption
  );
  const isCollectible = restrictions.some(value => value.includes("collectible") || value.includes("limited"))
    || Boolean(collectibleId)
    || hasResellers
    || resalePrice > 0
    || totalQuantity > 0;

  return {
    isCollectible,
    restrictions,
    collectibleId,
    hasResellers,
    resalePrice: resalePrice || null,
    totalQuantity: totalQuantity || null,
    available: available || null,
  };
}

function sniperLimitedMatchesFilter(item, details = {}, limitedOnly = false) {
  if (!limitedOnly) return true;
  return catalogLimitedSignals(item, details).isCollectible;
}

function parseRobloxDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
}

function catalogItemCreatedAt(item, details = {}) {
  return item.itemCreatedUtc
    || item.createdUtc
    || item.created
    || item.createdAt
    || item.item?.itemCreatedUtc
    || item.item?.createdUtc
    || item.item?.created
    || item.item?.createdAt
    || details.itemCreatedUtc
    || details.createdUtc
    || details.Created
    || details.created
    || null;
}

function daysSince(time) {
  if (!time) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}

function defaultSniperMaxAgeDays(window) {
  // Sales windows mean "sold during this period", not "published during this period".
  // Keep age filtering opt-in so best-selling older items are not discarded.
  return null;
}

function sniperAgeMatchesFilter(item, details = {}, maxAgeDays = null) {
  if (!Number.isFinite(maxAgeDays)) return true;
  const createdAt = parseRobloxDate(catalogItemCreatedAt(item, details));
  if (!createdAt) return false;
  return daysSince(createdAt) <= maxAgeDays;
}

function normalizeCatalogNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function sniperScore(item, details = {}) {
  return sniperScoreBreakdown(item, details).score;
}

function sniperScoreBreakdown(item, details = {}) {
  const price = catalogItemPrice(item, details);
  const favorites = normalizeCatalogNumber(item.favoriteCount, item.favorites, details.FavoritedCount, details.Favorites);
  const sales = normalizeCatalogNumber(item.saleCount, item.sales, item.unitsSold, details.Sales, details.SalesCount);
  const createdAt = parseRobloxDate(catalogItemCreatedAt(item, details));
  const ageDays = daysSince(createdAt);
  const restrictions = [
    ...(item.itemRestrictions || []),
    ...(details.ItemRestrictions || []),
  ].map(value => String(value).toLowerCase());

  let score = 0;
  const reasons = [];
  const favoriteScore = Math.min(35, Math.log10(favorites + 1) * 12);
  const salesScore = Math.min(35, Math.log10(sales + 1) * 14);
  score += favoriteScore;
  score += salesScore;

  if (favoriteScore >= 1) reasons.push(`favorites +${Math.round(favoriteScore)}`);
  if (salesScore >= 1) reasons.push(`sales +${Math.round(salesScore)}`);

  if (price !== null) {
    if (price <= 25) {
      score += 18;
      reasons.push("low price +18");
    } else if (price <= 75) {
      score += 12;
      reasons.push("fair price +12");
    } else if (price <= 150) {
      score += 7;
      reasons.push("mid price +7");
    }
  }

  if (ageDays !== null) {
    if (ageDays <= 2) {
      score += 18;
      reasons.push("fresh item +18");
    } else if (ageDays <= 7) {
      score += 12;
      reasons.push("this week +12");
    } else if (ageDays <= 30) {
      score += 6;
      reasons.push("this month +6");
    }
  }

  if (restrictions.some(value => value.includes("limited") || value.includes("collectible"))) {
    score += 12;
    reasons.push("collectible signal +12");
  }

  return {
    score: Math.round(score),
    reasons,
  };
}

async function fetchCatalogDetailsSafe(itemId, options = {}) {
  try {
    return await fetchRobloxPublicJson(`https://economy.roblox.com/v2/assets/${encodeURIComponent(itemId)}/details`, options);
  } catch {
    return {};
  }
}

async function fetchCatalogItemDetailsSafe(itemId, options = {}) {
  try {
    return await fetchRobloxPublicJson(`https://catalog.roblox.com/v1/catalog/items/${encodeURIComponent(itemId)}/details`, options);
  } catch {
    return {};
  }
}

function buildSniperCandidate(item, details = {}, category = "all", categoryVerified = false, options = {}) {
  const id = catalogItemId(item);
  const breakdown = sniperScoreBreakdown(item, details);
  const limitedSignals = catalogLimitedSignals(item, details);
  return {
    item,
    details,
    id,
    name: item.name || details.Name || `Item ${id}`,
    creator: item.creatorName || item.creator?.name || details.Creator?.Name || "Unknown",
    assetTypeId: catalogAssetTypeId(item, details),
    price: catalogItemPrice(item, details),
    favorites: normalizeCatalogNumber(item.favoriteCount, item.favorites, details.FavoritedCount, details.Favorites),
    sales: normalizeCatalogNumber(item.saleCount, item.sales, item.unitsSold, details.Sales, details.SalesCount),
    createdAt: catalogItemCreatedAt(item, details),
    limited: limitedSignals.isCollectible,
    resalePrice: limitedSignals.resalePrice,
    totalQuantity: limitedSignals.totalQuantity,
    available: limitedSignals.available,
    hasResellers: limitedSignals.hasResellers,
    marketplaceRank: Number.isFinite(options.marketplaceRank) ? options.marketplaceRank : null,
    sourceCategory: options.sourceCategory || category,
    score: breakdown.score,
    reasons: [
      ...breakdown.reasons,
      categoryVerified ? "category verified" : category !== "all" ? "category inferred from search" : null,
    ].filter(Boolean),
    categoryVerified,
  };
}

function readSniperHistoryCurrent() {
  try {
    if (!fs.existsSync(SNIPER_HISTORY_CURRENT_PATH)) return { version: 1, scans: {} };
    const parsed = JSON.parse(fs.readFileSync(SNIPER_HISTORY_CURRENT_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object") return { version: 1, scans: {} };
    parsed.scans ||= {};
    return parsed;
  } catch (err) {
    console.warn("Could not read sniper history cache:", err.message || err);
    return { version: 1, scans: {} };
  }
}

function writeSniperHistoryCurrent(data) {
  try {
    fs.mkdirSync(path.dirname(SNIPER_HISTORY_CURRENT_PATH), { recursive: true });
    fs.writeFileSync(SNIPER_HISTORY_CURRENT_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn("Could not write sniper history cache:", err.message || err);
  }
}

function appendSniperHistorySnapshot(entry) {
  try {
    fs.mkdirSync(path.dirname(SNIPER_HISTORY_SNAPSHOTS_PATH), { recursive: true });
    fs.appendFileSync(SNIPER_HISTORY_SNAPSHOTS_PATH, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.warn("Could not append sniper history snapshot:", err.message || err);
  }
}

function compactSniperHistoryItem(item, category, window, marketplaceRank) {
  const id = catalogItemId(item);
  if (!id) return null;
  return {
    id,
    name: item.name || item.item?.name || `Item ${id}`,
    creatorName: item.creatorName || item.creator?.name || item.item?.creatorName || "Unknown",
    price: catalogItemPrice(item, {}),
    favoriteCount: normalizeCatalogNumber(item.favoriteCount, item.favorites),
    saleCount: normalizeCatalogNumber(item.saleCount, item.sales, item.unitsSold),
    itemCreatedUtc: catalogItemCreatedAt(item, {}),
    assetTypeId: catalogAssetTypeId(item, {}),
    assetType: catalogAssetTypeId(item, {}),
    itemType: item.itemType || item.item?.itemType || "Asset",
    itemRestrictions: item.itemRestrictions || item.item?.itemRestrictions || [],
    collectibleItemId: item.collectibleItemId || item.item?.collectibleItemId || null,
    hasResellers: Boolean(item.hasResellers || item.item?.hasResellers),
    lowestResalePrice: normalizeCatalogNumber(item.lowestResalePrice, item.item?.lowestResalePrice) || null,
    totalQuantity: normalizeCatalogNumber(item.totalQuantity, item.item?.totalQuantity) || null,
    unitsAvailableForConsumption: normalizeCatalogNumber(item.unitsAvailableForConsumption, item.item?.unitsAvailableForConsumption) || null,
    marketplaceRank,
    sourceCategory: category,
    sourceWindow: window,
  };
}

function sniperHistoryScanKey(window, category) {
  return `${window}:${category}`;
}

function latestSniperHistoryScansFor(category, window) {
  const current = readSniperHistoryCurrent();
  const exact = current.scans?.[sniperHistoryScanKey(window, category)];
  if (exact) return [exact];

  if (category === "accessories") {
    return SNIPER_ACCESSORY_SUBCATEGORIES
      .map(subcategory => current.scans?.[sniperHistoryScanKey(window, subcategory)])
      .filter(Boolean);
  }

  if (category === "all") {
    return Object.entries(current.scans || {})
      .filter(([key]) => key.startsWith(`${window}:`))
      .map(([, scan]) => scan);
  }

  return [];
}

function candidateFromSniperHistoryItem(item, requestedCategory, scan = {}) {
  const sourceCategory = item.sourceCategory || sniperCategoryFromAssetType(catalogAssetTypeId(item, {})) || requestedCategory;
  const candidate = buildSniperCandidate(item, {}, requestedCategory, true, {
    marketplaceRank: Number.isFinite(Number(item.marketplaceRank)) ? Number(item.marketplaceRank) : null,
    sourceCategory,
  });
  candidate.reasons = [
    ...(candidate.reasons || []),
    "history cache",
    scan.collectedAt ? `cached ${Math.max(0, Math.round((Date.now() - Date.parse(scan.collectedAt)) / 60000))}m ago` : null,
  ].filter(Boolean);
  return candidate;
}

function getSniperHistoryCandidates({ window, category, keyword, minPrice, maxPrice, maxAgeDays, limit = 5, limitedOnly = false }) {
  if (!SNIPER_HISTORY_ENABLED) return null;
  const scans = latestSniperHistoryScansFor(category, window);
  if (!scans.length) return null;

  const normalizedKeyword = normalizeSniperText(keyword || "");
  const rows = [];
  const seen = new Set();
  let newestScanAt = 0;
  let totalRows = 0;

  for (const scan of scans) {
    const collectedAt = Date.parse(scan.collectedAt || "");
    if (Number.isFinite(collectedAt)) newestScanAt = Math.max(newestScanAt, collectedAt);
    const items = Array.isArray(scan.items) ? scan.items : [];
    totalRows += items.length;

    for (const item of items) {
      const id = catalogItemId(item);
      if (!id || seen.has(String(id))) continue;
      seen.add(String(id));
      if (normalizedKeyword && !normalizeSniperText(`${item.name || ""} ${item.creatorName || ""}`).includes(normalizedKeyword)) continue;
      if (!sniperPriceMatchesFilter(item, {}, minPrice, maxPrice)) continue;
      if (!sniperLimitedMatchesFilter(item, {}, limitedOnly)) continue;
      if (!sniperAgeMatchesFilter(item, {}, maxAgeDays)) continue;
      if (!sniperCategoryMatches(category, item, {})) continue;
      rows.push(candidateFromSniperHistoryItem(item, category, scan));
    }
  }

  const isStale = newestScanAt > 0 && Date.now() - newestScanAt > SNIPER_HISTORY_STALE_MS;
  const candidates = rows
    .sort((a, b) => {
      const aRank = Number.isFinite(a.marketplaceRank) ? a.marketplaceRank : Number.POSITIVE_INFINITY;
      const bRank = Number.isFinite(b.marketplaceRank) ? b.marketplaceRank : Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;
      return b.score - a.score;
    })
    .slice(0, Math.max(50, limit * 3));

  lastSniperDebug = {
    fromHistory: true,
    staleHistory: isStale,
    request: { window, category, keyword, minPrice, maxPrice, maxAgeDays, limitedOnly },
    scannedRows: totalRows,
    uniqueRows: seen.size,
    candidates: candidates.length,
    historyCollectedAt: newestScanAt ? new Date(newestScanAt).toISOString() : null,
    worker: {
      enabled: SNIPER_HISTORY_ENABLED,
      running: sniperHistoryWorkerRunning,
      lastRun: sniperHistoryLastRun,
      lastError: sniperHistoryLastError,
      lastSummary: sniperHistoryLastSummary,
    },
  };

  return candidates.length ? candidates : null;
}

function buildSniperRankAlerts({ previousScan, scan }) {
  if (!previousScan?.items?.length || !scan?.items?.length) return [];

  const previousById = new Map(
    previousScan.items
      .filter(item => item?.id && Number.isFinite(Number(item.marketplaceRank)))
      .map(item => [String(item.id), Number(item.marketplaceRank)])
  );
  const alerts = [];

  for (const item of scan.items) {
    const id = String(item.id || "");
    if (!id || !previousById.has(id)) continue;
    const previousRank = previousById.get(id);
    const currentRank = Number(item.marketplaceRank);
    const rankGain = previousRank - currentRank;
    if (!Number.isFinite(currentRank) || !Number.isFinite(rankGain)) continue;
    if (rankGain < SNIPER_ALERT_MIN_RANK_GAIN) continue;
    if (currentRank > SNIPER_ALERT_MAX_CURRENT_RANK) continue;
    if (SNIPER_ALERT_MAX_AGE_DAYS && !sniperAgeMatchesFilter(item, {}, SNIPER_ALERT_MAX_AGE_DAYS)) continue;

    alerts.push({
      item,
      previousRank,
      currentRank,
      rankGain,
      window: scan.window,
      category: scan.category,
      collectedAt: scan.collectedAt,
    });
  }

  return alerts
    .sort((a, b) => {
      if (b.rankGain !== a.rankGain) return b.rankGain - a.rankGain;
      return a.currentRank - b.currentRank;
    })
    .slice(0, Math.max(1, SNIPER_ALERT_MAX_PER_SCAN));
}

function formatSniperAlert(alert) {
  const item = alert.item;
  const candidate = buildSniperCandidate(item, {}, alert.category, true, {
    marketplaceRank: alert.currentRank,
    sourceCategory: alert.category,
  });
  const age = daysSince(parseRobloxDate(catalogItemCreatedAt(item, {})));
  const ageText = age === null ? "unknown age" : `${age}d old`;
  const favorites = candidate.favorites ? `${candidate.favorites.toLocaleString("en-US")} favorites` : "favorites unavailable";
  const price = candidate.price === null ? "unknown price" : `${candidate.price} Robux`;

  return [
    "# 🎯 Fast-Rising UGC Alert",
    `**${String(candidate.name || `Item ${candidate.id}`).slice(0, 80)}**`,
    `**Creator:** ${String(candidate.creator || "Unknown").slice(0, 60)}`,
    "",
    `**Window:** ${SNIPER_WINDOW_LABELS[alert.window] || alert.window}`,
    `**Category:** ${SNIPER_CATEGORY_LABELS[alert.category] || alert.category}`,
    `**Rank movement:** #${alert.previousRank} → #${alert.currentRank} (**+${alert.rankGain}**)`,
    `**Signals:** ${favorites} | ${price} | ${ageText}`,
    `**Score:** ${candidate.score}/100`,
    "",
    `https://www.roblox.com/catalog/${candidate.id}`,
    `Copy views: \`${sniperViewsCommand(candidate.id)}\``,
  ].join("\n");
}

async function sendSniperRankAlerts(alerts) {
  if (!SNIPER_ALERT_CHANNEL_ID || !alerts?.length) return;
  const channel = await client.channels.fetch(SNIPER_ALERT_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.warn(`[sniper_history] alert channel not found or not text: ${SNIPER_ALERT_CHANNEL_ID}`);
    return;
  }

  for (const alert of alerts) {
    await channel.send({ content: formatSniperAlert(alert) }).catch(err => {
      console.warn("[sniper_history] could not send alert:", err.message || err);
    });
    await wait(750);
  }
}

function addSniperDebugSample(reason, item, details = {}) {
  if (!lastSniperDebug?.samples || lastSniperDebug.samples.length >= 8) return;

  lastSniperDebug.samples.push({
    reason,
    id: catalogItemId(item),
    name: item.name || item.item?.name || details.Name || null,
    price: catalogItemPrice(item, details),
    assetTypeId: catalogAssetTypeId(item, details),
    assetType: item.assetType || item.item?.assetType || details.AssetType || null,
    itemType: item.itemType || item.item?.itemType || details.ItemType || null,
    creator: item.creatorName || item.creator?.name || details.Creator?.Name || null,
    createdAt: catalogItemCreatedAt(item, details),
  });
}

function getSniperCachedCandidates(cacheKey, ttlMs = SNIPER_CATALOG_CACHE_TTL_MS) {
  if (!SNIPER_CATALOG_CACHE_ENABLED) return null;
  const cached = sniperCatalogCache.get(cacheKey);
  if (!cached || Date.now() - cached.savedAt > ttlMs) return null;
  return cached.candidates || [];
}

function sniperScanKey({ window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly = false }) {
  return JSON.stringify({ version: SNIPER_CACHE_VERSION, window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly });
}

async function runSniperScanOnce(scanKey, scanFn) {
  const existing = sniperInFlightScans.get(scanKey);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(scanFn)
    .finally(() => sniperInFlightScans.delete(scanKey));
  sniperInFlightScans.set(scanKey, promise);
  return promise;
}

function sniperDeadlineExceeded(deadlineAt) {
  return Number.isFinite(deadlineAt) && deadlineAt > 0 && Date.now() > deadlineAt;
}

function assertSniperDeadline(deadlineAt) {
  if (!sniperDeadlineExceeded(deadlineAt)) return;
  const err = new Error("Sniper scan timed out before Roblox returned enough catalog data.");
  err.code = "SNIPER_TIMEOUT";
  throw err;
}

async function fetchSniperCandidates({ window, category, keyword, minPrice, maxPrice, maxAgeDays, limit = 5, depth = "normal", limitedOnly = false, deadlineAt = 0 }) {
  const historyCandidates = getSniperHistoryCandidates({ window, category, keyword, minPrice, maxPrice, maxAgeDays, limit, limitedOnly });
  if (historyCandidates?.length >= Math.min(limit, 3)) {
    return historyCandidates;
  }

  const windowAttempts = SNIPER_WINDOW_PARAMS[window] || SNIPER_WINDOW_PARAMS.recent;
  const cacheKey = sniperScanKey({ window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly });
  const cached = getSniperCachedCandidates(cacheKey);
  if (cached) {
    lastSniperDebug = {
      fromCache: true,
      request: { window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly },
      candidates: cached.length,
    };
    return cached;
  }
  const staleCached = getSniperCachedCandidates(cacheKey, SNIPER_CATALOG_STALE_CACHE_TTL_MS);

  if (robloxPublicRateLimitedUntil > Date.now() && staleCached?.length) {
    lastSniperDebug = {
      fromCache: true,
      staleCache: true,
      request: { window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly },
      cooldownSeconds: Math.ceil((robloxPublicRateLimitedUntil - Date.now()) / 1000),
      candidates: staleCached.length,
    };
    return staleCached;
  }

  lastSniperDebug = {
    fromCache: false,
    request: { window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly },
    attempts: [],
    rawRows: 0,
    uniqueRows: 0,
    rejected: {
      duplicate: 0,
      missingId: 0,
      price: 0,
      limited: 0,
      category: 0,
      nameHint: 0,
      age: 0,
    },
    samples: [],
    enriched: 0,
    inferred: 0,
    candidates: 0,
    partial: false,
    partialReason: "",
  };

  const categoriesToTry = sniperSearchCategoriesFor(category);
  const aggregateCategoryScan = categoriesToTry.length > 1 && ["accessories"].includes(category);
  const pageSize = Number(robloxCatalogSearchLimit(true)) || 30;
  const targetRawRows = Math.max(
    limit * 8,
    depth === "deep" ? SNIPER_DEEP_SCAN_ROWS : SNIPER_NORMAL_SCAN_ROWS
  );
  const depthPages = Math.max(1, Math.ceil(targetRawRows / pageSize));
  lastSniperDebug.targetRawRows = targetRawRows;
  lastSniperDebug.targetPages = depthPages;
  const queryVariants = [
    { keyword, minPrice, maxPrice, reason: "requested filters" },
    keyword ? { keyword: "", minPrice, maxPrice, reason: "without keyword" } : null,
  ].filter(Boolean);
  let data = [];
  let lastError = null;
  let searchFallbackReason = "";
  let stopScanning = false;
  const startedAt = Date.now();

  for (const queryVariant of queryVariants) {
    for (let categoryIndex = 0; categoryIndex < categoriesToTry.length; categoryIndex += 1) {
      const searchCategory = categoriesToTry[categoryIndex];
      if (sniperDeadlineExceeded(deadlineAt)) {
        if (data.length) {
          lastSniperDebug.partial = true;
          lastSniperDebug.partialReason = "Stopped scan after reaching the command deadline with partial catalog data.";
          stopScanning = true;
          break;
        }
        assertSniperDeadline(deadlineAt);
      }
      if (categoryIndex > 0 && SNIPER_CATEGORY_DELAY_MS > 0) {
        await wait(SNIPER_CATEGORY_DELAY_MS);
      }
      const useV2Search = sniperCanUseCatalogV2(searchCategory);
      const categoryParams = SNIPER_CATEGORY_PARAMS[searchCategory] || SNIPER_CATEGORY_PARAMS.all;
      const baseParams = useV2Search
        ? {
            limit: robloxCatalogSearchLimit(Number.isFinite(maxAgeDays)),
            salesTypeFilter: "1",
            assetTypeIds: SNIPER_CATEGORY_ASSET_TYPES[searchCategory].join(","),
          }
        : {
            CurrencyType: "3",
            Limit: robloxCatalogSearchLimit(Number.isFinite(maxAgeDays)),
            salesTypeFilter: "1",
            ...categoryParams,
          };

      if (queryVariant.keyword) baseParams[useV2Search ? "keyword" : "Keyword"] = queryVariant.keyword;
      if (Number.isFinite(queryVariant.minPrice)) baseParams[useV2Search ? "minPrice" : "pxMin"] = String(queryVariant.minPrice);
      if (Number.isFinite(queryVariant.maxPrice)) baseParams[useV2Search ? "maxPrice" : "pxMax"] = String(queryVariant.maxPrice);
      if (!useV2Search && Number.isFinite(queryVariant.minPrice)) baseParams.MinPrice = String(queryVariant.minPrice);
      if (!useV2Search && Number.isFinite(queryVariant.maxPrice)) baseParams.MaxPrice = String(queryVariant.maxPrice);

      for (const attemptParams of windowAttempts) {
        if (sniperDeadlineExceeded(deadlineAt)) {
          if (data.length) {
            lastSniperDebug.partial = true;
            lastSniperDebug.partialReason = "Stopped scan after reaching the command deadline with partial catalog data.";
            stopScanning = true;
            break;
          }
          assertSniperDeadline(deadlineAt);
        }
        const normalizedAttemptParams = sniperWindowParamsForSearch(attemptParams, useV2Search);
        const debugAttempt = {
          category: searchCategory,
          reason: queryVariant.reason,
          endpoint: useV2Search ? "v2" : "v1",
          params: new URLSearchParams({ ...baseParams, ...normalizedAttemptParams }).toString(),
          rows: 0,
          pages: 0,
          error: null,
        };
        lastSniperDebug.attempts.push(debugAttempt);
        const collected = [];
        try {
          let cursor = "";
          const maxPages = Math.max(
            depthPages,
            Number.isFinite(maxAgeDays) ? SNIPER_MAX_PAGES_WITH_AGE : 1
          );

          for (let page = 0; page < maxPages; page += 1) {
            if (sniperDeadlineExceeded(deadlineAt)) {
              lastSniperDebug.partial = true;
              lastSniperDebug.partialReason = "Stopped scan after reaching the command deadline with partial catalog data.";
              break;
            }
            if (page > 0 && SNIPER_PAGE_DELAY_MS > 0) {
              await wait(SNIPER_PAGE_DELAY_MS);
            }
            const params = new URLSearchParams({ ...baseParams, ...normalizedAttemptParams });
            if (cursor) params.set("Cursor", cursor);
            const endpoint = useV2Search ? "v2" : "v1";
            const response = await fetchRobloxPublicJson(`https://catalog.roblox.com/${endpoint}/search/items/details?${params.toString()}`, {
              maxWaitMs: SNIPER_PUBLIC_WAIT_LIMIT_MS,
            });
            const rows = Array.isArray(response.data) ? response.data : [];
            collected.push(...rows);
            debugAttempt.rows = collected.length;
            debugAttempt.pages = page + 1;
            cursor = response.nextPageCursor || "";
            if (!cursor || !rows.length) break;
          }

          data.push(...collected);
          if (collected.length) {
            lastError = null;
            searchFallbackReason = queryVariant.reason === "requested filters" ? "" : queryVariant.reason;
            if (data.length >= targetRawRows) break;
            if (sniperDeadlineExceeded(deadlineAt)) {
              stopScanning = true;
              break;
            }
          }
        } catch (err) {
          if (collected.length) {
            data.push(...collected);
          }
          lastError = err;
          debugAttempt.error = String(err.message || err).slice(0, 300);
          if (isRobloxRateLimitError(err) || err.code === "SNIPER_TIMEOUT") {
            lastSniperDebug.partial = true;
            lastSniperDebug.partialReason = String(err.message || err).slice(0, 300);
          }
          if (data.length && (isRobloxRateLimitError(err) || err.code === "SNIPER_TIMEOUT")) {
            break;
          }
          if (isRobloxRateLimitError(err) || err.code === "SNIPER_TIMEOUT") break;
        }
      }

      const softFailure = isRobloxRateLimitError(lastError) || lastError?.code === "SNIPER_TIMEOUT";
      if (stopScanning || data.length >= targetRawRows || (softFailure && data.length)) {
        break;
      }
    }

    const softFailure = isRobloxRateLimitError(lastError) || lastError?.code === "SNIPER_TIMEOUT";
    if (stopScanning || data.length >= targetRawRows || (softFailure && data.length)) {
      break;
    }
  }

  if (!data.length && lastError) {
    if (staleCached?.length) {
      lastSniperDebug = {
        ...(lastSniperDebug || {}),
        fromCache: true,
        staleCache: true,
        fallbackError: String(lastError.message || lastError).slice(0, 300),
        candidates: staleCached.length,
      };
      return staleCached;
    }
    throw lastError;
  }
  lastSniperDebug.rawRows = data.length;

  const unique = [];
  const seen = new Set();
  const marketplaceRankById = new Map();
  const limitedDetailScanLimit = Math.max(
    limit * 4,
    Math.min(
      depth === "deep" ? SNIPER_LIMITED_DEEP_DETAIL_SCAN_LIMIT : SNIPER_LIMITED_DETAIL_SCAN_LIMIT,
      data.length || SNIPER_LIMITED_DETAIL_SCAN_LIMIT
    )
  );
  const uniqueTarget = limitedOnly
    ? limitedDetailScanLimit
    : Number.isFinite(maxAgeDays)
      ? data.length
    : Math.max(limit * 3, SNIPER_DETAIL_LIMIT);
  for (const [index, item] of data.entries()) {
    const id = catalogItemId(item);
    if (!id) {
      lastSniperDebug.rejected.missingId += 1;
      addSniperDebugSample("missingId", item);
      continue;
    }
    if (seen.has(String(id))) {
      lastSniperDebug.rejected.duplicate += 1;
      addSniperDebugSample("duplicate", item);
      continue;
    }
    if (!sniperPriceMatchesFilter(item, {}, minPrice, maxPrice)) {
      lastSniperDebug.rejected.price += 1;
      addSniperDebugSample("price", item);
      continue;
    }
    seen.add(String(id));
    marketplaceRankById.set(String(id), index + 1);
    unique.push(item);
    if (unique.length >= uniqueTarget) break;
  }
  lastSniperDebug.uniqueRows = unique.length;

  const shouldFetchDetailsForCategory = limitedOnly || (category && !["all", "collectibles"].includes(category));
  const enriched = [];
  const inferred = [];
  const detailsLimit = limitedOnly
    ? Math.min(unique.length, limitedDetailScanLimit)
    : Number.isFinite(maxAgeDays)
      ? unique.length
    : Math.max(limit, Math.min(SNIPER_DETAIL_LIMIT, unique.length));
  for (const item of unique.slice(0, detailsLimit)) {
    if (sniperDeadlineExceeded(deadlineAt)) break;
    const id = catalogItemId(item);
    const detailOptions = { maxWaitMs: SNIPER_PUBLIC_WAIT_LIMIT_MS };
    const hasCategorySignal = sniperCategoryCanBeVerified(category, item, {}) || sniperNameSuggestsCategory(category, item, {});
    const hasAgeSignal = Boolean(catalogItemCreatedAt(item, {}));
    const economyDetails = shouldFetchDetailsForCategory && !hasCategorySignal ? await fetchCatalogDetailsSafe(id, detailOptions) : {};
    const catalogDetails = limitedOnly || (Number.isFinite(maxAgeDays) && !hasAgeSignal) ? await fetchCatalogItemDetailsSafe(id, detailOptions) : {};
    const details = { ...economyDetails, ...catalogDetails };
    const canVerify = sniperCategoryCanBeVerified(category, item, details);
    const matches = sniperCategoryMatches(category, item, details);

    if (!sniperPriceMatchesFilter(item, details, minPrice, maxPrice)) {
      lastSniperDebug.rejected.price += 1;
      addSniperDebugSample("price", item, details);
      continue;
    }
    if (!sniperLimitedMatchesFilter(item, details, limitedOnly)) {
      lastSniperDebug.rejected.limited += 1;
      addSniperDebugSample("limited", item, details);
      continue;
    }
    if (!sniperAgeMatchesFilter(item, details, maxAgeDays)) {
      lastSniperDebug.rejected.age += 1;
      addSniperDebugSample("age", item, details);
      continue;
    }
    if (canVerify && !matches) {
      lastSniperDebug.rejected.category += 1;
      addSniperDebugSample("category", item, details);
      continue;
    }

    if (!canVerify && !sniperNameSuggestsCategory(category, item, details)) {
      lastSniperDebug.rejected.nameHint += 1;
      addSniperDebugSample("nameHint", item, details);
      continue;
    }

    const candidate = buildSniperCandidate(item, details, category, canVerify && matches, {
      marketplaceRank: marketplaceRankById.get(String(id)),
      sourceCategory: category === "accessories" ? sniperCategoryFromAssetType(catalogAssetTypeId(item, details)) || category : category,
    });
    if (candidate.categoryVerified || category === "all" || category === "collectibles") enriched.push(candidate);
    else inferred.push(candidate);
    if (enriched.length + inferred.length >= Math.max(limit, 3)) break;
  }

  if (!enriched.length && category !== "all" && category !== "collectibles") {
    for (const item of unique.slice(0, detailsLimit)) {
      if (sniperDeadlineExceeded(deadlineAt)) break;
      const id = catalogItemId(item);
      const hasCategorySignal = sniperCategoryCanBeVerified(category, item, {}) || sniperNameSuggestsCategory(category, item, {});
      const hasAgeSignal = Boolean(catalogItemCreatedAt(item, {}));
      const economyDetails = !hasCategorySignal
        ? await fetchCatalogDetailsSafe(id, { maxWaitMs: SNIPER_PUBLIC_WAIT_LIMIT_MS })
        : {};
      const catalogDetails = limitedOnly || (Number.isFinite(maxAgeDays) && !hasAgeSignal)
        ? await fetchCatalogItemDetailsSafe(id, { maxWaitMs: SNIPER_PUBLIC_WAIT_LIMIT_MS })
        : {};
      const details = { ...economyDetails, ...catalogDetails };
      if (!sniperPriceMatchesFilter(item, details, minPrice, maxPrice)) continue;
      if (!sniperLimitedMatchesFilter(item, details, limitedOnly)) continue;
      if (!sniperAgeMatchesFilter(item, details, maxAgeDays)) continue;
      if (!sniperCategoryMatches(category, item, details)) continue;
      enriched.push(buildSniperCandidate(item, details, category, true, {
        marketplaceRank: marketplaceRankById.get(String(id)),
        sourceCategory: category === "accessories" ? sniperCategoryFromAssetType(catalogAssetTypeId(item, details)) || category : category,
      }));
      if (enriched.length >= Math.max(limit, 3)) break;
    }
  }

  if (!enriched.length && !inferred.length) {
    for (const item of unique.slice(0, 10)) {
      if (!sniperPriceMatchesFilter(item, {}, minPrice, maxPrice)) continue;
      if (!sniperLimitedMatchesFilter(item, {}, limitedOnly)) continue;
      if (!sniperAgeMatchesFilter(item, {}, maxAgeDays)) continue;
      if (!sniperNameSuggestsCategory(category, item, {})) continue;
      const id = catalogItemId(item);
      inferred.push(buildSniperCandidate(item, {}, category, false, {
        marketplaceRank: marketplaceRankById.get(String(id)),
        sourceCategory: category === "accessories" ? sniperCategoryFromAssetType(catalogAssetTypeId(item, {})) || category : category,
      }));
    }
  }

  if (!enriched.length && !inferred.length && ["all", "accessories", "clothing", "collectibles"].includes(category)) {
    const deadlineFallback = sniperDeadlineExceeded(deadlineAt);
    const fallbackLimit = sniperDeadlineExceeded(deadlineAt)
      ? Math.max(limit * 3, 15)
      : 5;
    for (const item of unique.slice(0, fallbackLimit)) {
      if (!sniperPriceMatchesFilter(item, {}, minPrice, maxPrice)) continue;
      if (!sniperLimitedMatchesFilter(item, {}, limitedOnly)) continue;
      if (!sniperAgeMatchesFilter(item, {}, maxAgeDays)) continue;
      const id = catalogItemId(item);
      const candidate = buildSniperCandidate(item, {}, category, false, {
        marketplaceRank: marketplaceRankById.get(String(id)),
        sourceCategory: category === "accessories" ? sniperCategoryFromAssetType(catalogAssetTypeId(item, {})) || category : category,
      });
      candidate.reasons.push(deadlineFallback
        ? "deadline fallback: raw catalog signal"
        : "broad fallback: category not confirmed");
      inferred.push(candidate);
      if (inferred.length >= Math.max(limit, 5)) break;
    }
    if (deadlineFallback && inferred.length) {
      lastSniperDebug.partial = true;
      lastSniperDebug.partialReason = "Built raw candidates after the detail scan deadline was reached.";
    }
  }

  if (searchFallbackReason) {
    for (const candidate of [...enriched, ...inferred]) {
      candidate.reasons.push(`fallback: ${searchFallbackReason}`);
    }
  }

  const finalPool = enriched.length ? enriched : inferred;
  const candidates = finalPool.sort((a, b) => {
    const aRank = Number.isFinite(a.marketplaceRank) ? a.marketplaceRank : Number.POSITIVE_INFINITY;
    const bRank = Number.isFinite(b.marketplaceRank) ? b.marketplaceRank : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return b.score - a.score;
  }).slice(0, Math.max(15, limit * 3));
  lastSniperDebug.enriched = enriched.length;
  lastSniperDebug.inferred = inferred.length;
  lastSniperDebug.candidates = candidates.length;
  lastSniperDebug.elapsedMs = Date.now() - startedAt;
  if (SNIPER_CATALOG_CACHE_ENABLED && candidates.length) {
    sniperCatalogCache.set(cacheKey, { savedAt: Date.now(), candidates });
  }
  return candidates;
}

async function collectSniperHistoryRows({ window, category, depth = SNIPER_HISTORY_DEPTH }) {
  const windowAttempts = SNIPER_WINDOW_PARAMS[window] || SNIPER_WINDOW_PARAMS.week;
  const attemptParams = windowAttempts[0] || {};
  const useV2Search = sniperCanUseCatalogV2(category);
  const categoryParams = SNIPER_CATEGORY_PARAMS[category] || SNIPER_CATEGORY_PARAMS.all;
  const pageSize = Number(robloxCatalogSearchLimit(true)) || 30;
  const maxPages = Math.max(1, Math.ceil(depth / pageSize));
  const baseParams = useV2Search
    ? {
        limit: String(pageSize),
        salesTypeFilter: "1",
        assetTypeIds: SNIPER_CATEGORY_ASSET_TYPES[category].join(","),
      }
    : {
        CurrencyType: "3",
        Limit: String(pageSize),
        salesTypeFilter: "1",
        ...categoryParams,
      };
  const normalizedAttemptParams = sniperWindowParamsForSearch(attemptParams, useV2Search);
  const rows = [];
  let cursor = "";
  let partialReason = "";

  for (let page = 0; page < maxPages; page += 1) {
    if (page > 0 && SNIPER_HISTORY_PAGE_DELAY_MS > 0) {
      await wait(SNIPER_HISTORY_PAGE_DELAY_MS);
    }

    try {
      const params = new URLSearchParams({ ...baseParams, ...normalizedAttemptParams });
      if (cursor) params.set("Cursor", cursor);
      const endpoint = useV2Search ? "v2" : "v1";
      const response = await fetchRobloxPublicJson(`https://catalog.roblox.com/${endpoint}/search/items/details?${params.toString()}`, {
        maxWaitMs: SNIPER_PUBLIC_WAIT_LIMIT_MS,
      });
      const pageRows = Array.isArray(response.data) ? response.data : [];
      rows.push(...pageRows);
      cursor = response.nextPageCursor || "";
      if (!cursor || !pageRows.length || rows.length >= depth) break;
    } catch (err) {
      if (rows.length && isRobloxRateLimitError(err)) {
        partialReason = String(err.message || err).slice(0, 300);
        console.warn(`[sniper_history] partial ${window}/${category}: saved ${rows.length} rows after rate limit on page ${page + 1}`);
        break;
      }
      throw err;
    }
  }

  return {
    rows: rows.slice(0, depth),
    partialReason,
  };
}

function saveSniperHistoryScan({ window, category, rows, partialReason = "" }) {
  const current = readSniperHistoryCurrent();
  const collectedAt = new Date().toISOString();
  const compactItems = [];
  const seen = new Set();

  for (const [index, row] of rows.entries()) {
    const compact = compactSniperHistoryItem(row, category, window, index + 1);
    if (!compact?.id || seen.has(String(compact.id))) continue;
    seen.add(String(compact.id));
    compactItems.push(compact);
  }

  const scan = {
    window,
    category,
    collectedAt,
    depth: SNIPER_HISTORY_DEPTH,
    rows: rows.length,
    uniqueRows: compactItems.length,
    partial: Boolean(partialReason),
    partialReason,
    items: compactItems,
  };

  current.version = 1;
  current.updatedAt = collectedAt;
  current.scans ||= {};
  const scanKey = sniperHistoryScanKey(window, category);
  const previousScan = current.scans[scanKey] || null;
  const alerts = buildSniperRankAlerts({ previousScan, scan });
  current.scans[scanKey] = scan;
  writeSniperHistoryCurrent(current);
  appendSniperHistorySnapshot({
    type: "scan",
    window,
    category,
    collectedAt,
    rows: rows.length,
    uniqueRows: compactItems.length,
    topIds: compactItems.slice(0, 50).map(item => item.id),
  });
  return { scan, alerts };
}

function pruneSniperHistorySnapshots() {
  try {
    if (!fs.existsSync(SNIPER_HISTORY_SNAPSHOTS_PATH)) return;
    const cutoff = Date.now() - Math.max(1, SNIPER_HISTORY_RETENTION_DAYS) * 86400000;
    const lines = fs.readFileSync(SNIPER_HISTORY_SNAPSHOTS_PATH, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter(line => {
        try {
          const item = JSON.parse(line);
          const time = Date.parse(item.collectedAt || item.at || "");
          return Number.isFinite(time) ? time >= cutoff : true;
        } catch {
          return false;
        }
      });
    fs.writeFileSync(SNIPER_HISTORY_SNAPSHOTS_PATH, lines.length ? `${lines.join("\n")}\n` : "");
  } catch (err) {
    console.warn("Could not prune sniper history snapshots:", err.message || err);
  }
}

async function runSniperHistoryWorkerCycle() {
  if (!SNIPER_HISTORY_ENABLED || sniperHistoryWorkerRunning) return;
  sniperHistoryWorkerRunning = true;
  const startedAt = Date.now();
  const summary = { scans: 0, rows: 0, alerts: 0, categories: [], windows: [], startedAt: new Date(startedAt).toISOString() };

  try {
    for (const window of SNIPER_HISTORY_WINDOWS) {
      if (!SNIPER_WINDOW_PARAMS[window]) continue;
      summary.windows.push(window);

      for (const category of SNIPER_HISTORY_CATEGORIES) {
        if (!SNIPER_CATEGORY_LABELS[category] || !sniperCanUseCatalogV2(category)) continue;
        if (summary.scans > 0 && SNIPER_HISTORY_CATEGORY_DELAY_MS > 0) {
          await wait(SNIPER_HISTORY_CATEGORY_DELAY_MS);
        }

        const collected = await collectSniperHistoryRows({ window, category });
        const { scan, alerts } = saveSniperHistoryScan({
          window,
          category,
          rows: collected.rows,
          partialReason: collected.partialReason,
        });
        summary.scans += 1;
        summary.rows += scan.uniqueRows;
        summary.alerts += alerts.length;
        summary.categories.push(category);
        console.log(`[sniper_history] ${window}/${category} rows=${scan.rows} unique=${scan.uniqueRows} alerts=${alerts.length}${scan.partial ? " partial=yes" : ""}`);
        await sendSniperRankAlerts(alerts);
      }
    }

    pruneSniperHistorySnapshots();
    sniperHistoryLastRun = new Date().toISOString();
    sniperHistoryLastError = "";
    sniperHistoryLastSummary = {
      ...summary,
      elapsedMs: Date.now() - startedAt,
      categories: [...new Set(summary.categories)],
      windows: [...new Set(summary.windows)],
    };
  } catch (err) {
    sniperHistoryLastError = String(err.message || err).slice(0, 500);
    sniperHistoryLastSummary = {
      ...summary,
      elapsedMs: Date.now() - startedAt,
      error: sniperHistoryLastError,
    };
    console.warn("[sniper_history] cycle failed:", sniperHistoryLastError);
  } finally {
    sniperHistoryWorkerRunning = false;
  }
}

function scheduleSniperHistoryWorker(delayMs = SNIPER_HISTORY_INTERVAL_MS) {
  if (!SNIPER_HISTORY_ENABLED) return;
  clearTimeout(sniperHistoryWorkerTimer);
  sniperHistoryWorkerTimer = setTimeout(async () => {
    await runSniperHistoryWorkerCycle();
    scheduleSniperHistoryWorker(SNIPER_HISTORY_INTERVAL_MS);
  }, Math.max(5000, delayMs));
}

function sniperSeenIdsFor(user) {
  user.sniperSeenIds ||= [];
  if (!Array.isArray(user.sniperSeenIds)) user.sniperSeenIds = [];
  return user.sniperSeenIds;
}

function pickSniperCandidates(candidates, userId, count = 1) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const seenIds = new Set(sniperSeenIdsFor(user).map(String));
  const fresh = candidates.filter(candidate => !seenIds.has(String(candidate.id)));
  const seenFallback = candidates.filter(candidate => seenIds.has(String(candidate.id)));
  const pool = [...fresh, ...seenFallback].slice(0, Math.max(10, count * 3));
  const selected = [];

  while (pool.length && selected.length < count) {
    const totalWeight = pool.reduce((sum, candidate, index) => {
      return sum + Math.max(1, candidate.score) + Math.max(0, 10 - index);
    }, 0);
    let cursor = Math.random() * totalWeight;
    let chosenIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      cursor -= Math.max(1, pool[index].score) + Math.max(0, 10 - index);
      if (cursor <= 0) {
        chosenIndex = index;
        break;
      }
    }

    selected.push(pool.splice(chosenIndex, 1)[0]);
  }

  return selected;
}

function markSniperCandidatesSeen(userId, candidates) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const seenIds = sniperSeenIdsFor(user);

  for (const candidate of candidates) {
    const id = String(candidate.id);
    const existingIndex = seenIds.indexOf(id);
    if (existingIndex >= 0) seenIds.splice(existingIndex, 1);
    seenIds.unshift(id);
  }

  user.sniperSeenIds = seenIds.slice(0, 100);
  writeWalletDb(db);
}

function sniperViewsCommand(itemId) {
  return `/views id: ${itemId} lighting: Flat inspection pov: Your default angles: Multiview 4 - front/right/back/left ior: 1 roughness: 1 exposure: 1 light_power: 0.20`;
}

function formatSniperReport({ candidates, quote, window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly = false, debug }) {
  const returnedCount = candidates.length;
  const qualifiedCount = Number(debug?.candidates) || 0;
  const fromHistory = Boolean(debug?.fromHistory);
  const rawRows = Number(debug?.rawRows ?? debug?.scannedRows) || 0;
  const uniqueRows = Number(debug?.uniqueRows) || 0;
  const filters = [
    limitedOnly ? "Mode: Limited / collectible only" : null,
    `Window: ${SNIPER_WINDOW_LABELS[window] || window}`,
    `Category: ${SNIPER_CATEGORY_LABELS[category] || category}`,
    `Depth: ${depth === "deep" ? "Deep" : "Normal"}`,
    keyword ? `Keyword: ${keyword}` : null,
    Number.isFinite(minPrice) ? `Min price: ${minPrice} Robux` : null,
    Number.isFinite(maxPrice) ? `Max price: ${maxPrice} Robux` : null,
    Number.isFinite(maxAgeDays) ? `Max age: ${maxAgeDays} days` : null,
  ].filter(Boolean).join("\n");

  const scanStats = [
    fromHistory ? "Source: Background history cache" : null,
    `Scanned rows: ${rawRows}`,
    `Unique rows: ${uniqueRows}`,
    `Qualified pool: ${qualifiedCount}`,
    `Returned: ${returnedCount}`,
    debug?.historyCollectedAt ? `Cache updated: ${debug.historyCollectedAt}` : null,
    debug?.staleHistory ? "Status: Stale cache - background scanner has not refreshed recently" : null,
    !fromHistory && debug?.partial ? "Status: Partial scan - Roblox rate-limited before the full scan finished" : null,
    !fromHistory && !debug?.partial ? "Status: Complete scan" : null,
  ].filter(Boolean).join("\n");

  const rows = candidates.map((candidate, index) => {
    const name = String(candidate.name || `Item ${candidate.id}`).slice(0, 55);
    const creator = String(candidate.creator || "Unknown").slice(0, 30);
    const price = candidate.price === null ? "unknown" : `${candidate.price} Robux`;
    const age = daysSince(parseRobloxDate(candidate.createdAt));
    const ageText = age === null ? "unknown age" : `${age}d old`;
    const rankText = Number.isFinite(candidate.marketplaceRank)
      ? `market rank #${candidate.marketplaceRank}`
      : null;
    const sourceCategoryText = candidate.sourceCategory && candidate.sourceCategory !== category
      ? SNIPER_CATEGORY_LABELS[candidate.sourceCategory] || candidate.sourceCategory
      : null;
    const limitedText = limitedOnly
      ? [
          candidate.resalePrice ? `resale ${candidate.resalePrice} Robux` : null,
          candidate.available !== null && candidate.totalQuantity !== null ? `${candidate.available}/${candidate.totalQuantity} left` : null,
          candidate.hasResellers ? "has resellers" : null,
        ].filter(Boolean).join(" | ")
      : "";
    const signals = [
      rankText,
      candidate.favorites ? `${candidate.favorites.toLocaleString("en-US")} favorites` : null,
      candidate.sales ? `${candidate.sales.toLocaleString("en-US")} sales` : null,
      price,
      ageText,
    ].filter(Boolean).join(" • ");

    return [
      `**${name}**`,
      `Score: **${candidate.score}/100** | Creator: **${creator}**`,
      [
        sourceCategoryText ? `subcategory: ${sourceCategoryText}` : null,
        rankText,
        limitedText || null,
        candidate.favorites ? `${candidate.favorites.toLocaleString("en-US")} favorites` : null,
        candidate.sales ? `${candidate.sales.toLocaleString("en-US")} sales` : "sales unavailable",
        price,
        ageText,
      ].filter(Boolean).join(" | "),
      `Why: ${candidate.reasons?.length ? candidate.reasons.slice(0, 4).join(" | ") : "public signal match"}`,
      `https://www.roblox.com/catalog/${candidate.id}`,
      `Copy views: \`${sniperViewsCommand(candidate.id)}\``,
    ].join("\n");
  }).join("\n\n");

  return [
    "# 🎯 Market Sniper Report",
    limitedOnly
      ? "Source: public Roblox catalog search plus collectible/resale signals. This ranks public limited candidates, not guaranteed profit."
      : "Source: public Roblox catalog search plus public asset signals. This is a review radar, not a profit guarantee.",
    "",
    `## Access`,
    `Plan: **${quote.planLabel}**`,
    quote.dailyLimit === null
      ? "Usage today: **unlimited**"
      : `Usage today: **${quote.usedToday + 1}/${quote.dailyLimit}**`,
    `Price: **${formatTokenAmount(quote.walletAmount)}**`,
    "",
    "## Filters",
    filters,
    "",
    "## Scan",
    scanStats,
    "",
    candidates.length > 1 ? "## Selected Signals" : "## Selected Signal",
    rows || "No strong candidates found for these filters.",
    "",
    "Review each item manually before investing, copying trends, or ordering a remake.",
  ].join("\n");
}

function splitDiscordMessage(content, limit = 1900) {
  const chunks = [];
  let remaining = String(content || "");

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n\n", limit);
    if (splitAt < 400) splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < 400) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendSniperReport(interaction, report) {
  const chunks = splitDiscordMessage(report);
  await interaction.editReply(chunks[0] || "## Market Sniper Report\nNo report content.");

  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({
      content: chunk,
      flags: 64,
    });
  }
}

async function fetchRobloxAssetSource(assetId) {
  const cacheKey = String(assetId);
  const cached = robloxAssetSourceCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < ROBLOX_ASSET_SOURCE_CACHE_TTL_MS) {
    return {
      buffer: Buffer.from(cached.buffer),
      contentType: cached.contentType,
    };
  }

  let directRes = null;
  try {
    directRes = await fetchRobloxWithRetry(
      `https://assetdelivery.roblox.com/v1/asset?id=${assetId}`,
      { headers: robloxHeaders() },
      3
    );
  } catch (err) {
    if (isRobloxRateLimitError(err)) {
      throw err;
    }
  }

  if (directRes?.ok) {
    const rawBuffer = Buffer.from(await directRes.arrayBuffer());
    let buffer = rawBuffer;

    try {
      buffer = zlib.gunzipSync(rawBuffer);
    } catch {
      buffer = rawBuffer;
    }

    const contentType = directRes.headers.get("content-type") || "";
    robloxAssetSourceCache.set(cacheKey, { buffer, contentType, savedAt: Date.now() });

    return { buffer, contentType };
  }

  const delivery = await fetchRobloxAssetDeliveryV2(assetId);
  const location = (delivery.locations || []).find(item => item.assetFormat === "source")?.location
    || delivery.locations?.[0]?.location;

  if (!location) {
    throw new Error("No downloadable source found for this asset.");
  }

  const res = await fetchRobloxWithRetry(location, { headers: robloxHeaders() });

  if (!res.ok) {
    throw new Error(`Roblox source download failed (${res.status}).`);
  }

  const rawBuffer = Buffer.from(await res.arrayBuffer());
  let buffer = rawBuffer;

  try {
    buffer = zlib.gunzipSync(rawBuffer);
  } catch {
    buffer = rawBuffer;
  }

  const contentType = res.headers.get("content-type") || "";
  robloxAssetSourceCache.set(cacheKey, { buffer, contentType, savedAt: Date.now() });

  return { buffer, contentType };
}

function parseRobloxNumericId(raw) {
  const text = String(raw || "").trim();
  const urlMatch = text.match(/(?:catalog|library|asset|bundles)\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  const idMatch = text.match(/\d{3,}/);
  return idMatch ? idMatch[0] : null;
}

function clothingTypeLabel(assetTypeId) {
  if (assetTypeId === 11) return "Shirt";
  if (assetTypeId === 12) return "Pants";
  if (assetTypeId === 2) return "T-Shirt";
  return "Classic clothing";
}

function isClassicClothingAssetType(assetTypeId) {
  return [2, 11, 12].includes(Number(assetTypeId));
}

async function classifyStealTarget(rawId) {
  const catalogId = parseRobloxNumericId(rawId);
  if (!catalogId) return { kind: "asset", catalogId: null, details: null };

  try {
    let details = await fetchCatalogItemDetailsSafe(catalogId);
    if (!Object.keys(details).length) {
      details = await fetchCatalogDetailsSafe(catalogId);
    }
    const assetTypeId = Number(details.assetType || details.AssetTypeId || 0);
    return {
      kind: isClassicClothingAssetType(assetTypeId) ? "clothing" : "asset",
      catalogId,
      details,
      assetTypeId,
    };
  } catch (err) {
    console.warn(`Could not classify /steal target ${catalogId}:`, err.message);
    return { kind: "asset", catalogId, details: null };
  }
}

function isLikelyImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";

  return isPng || isJpeg || isWebp;
}

function extractTemplateIdFromClothingXml(text) {
  const patterns = [
    /asset\/\?id=(\d+)/i,
    /<url>rbxassetid:\/\/(\d+)<\/url>/i,
    /rbxassetid:\/\/(\d+)/i,
    /Graphic[\s\S]{0,300}?id=(\d+)/i,
    /ShirtTemplate[\s\S]{0,300}?id=(\d+)/i,
    /PantsTemplate[\s\S]{0,300}?id=(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return null;
}

async function downloadClassicClothingTemplate(rawId) {
  const catalogId = parseRobloxNumericId(rawId);
  if (!catalogId) throw new Error("Invalid clothing ID or URL.");

  const tempDir = path.join(__dirname, "temp", "refazer", `clothing-${catalogId}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const source = await fetchRobloxAssetSource(catalogId);
  let templateId = catalogId;
  let templateBuffer = source.buffer;
  let assetTypeId = 2;

  if (!source.contentType.includes("image") && !isLikelyImageBuffer(source.buffer)) {
    const sourceText = source.buffer.toString("utf8");
    templateId = extractTemplateIdFromClothingXml(sourceText);
    assetTypeId = /PantsTemplate/i.test(sourceText) ? 12 : /ShirtTemplate/i.test(sourceText) ? 11 : 0;

    if (!templateId) {
      throw new Error("Could not find the clothing template image inside this item.");
    }

    const templateSource = await fetchRobloxAssetSource(templateId);
    templateBuffer = templateSource.buffer;
  }

  let details = {};
  try {
    details = await fetchRobloxJson(`https://economy.roblox.com/v2/assets/${catalogId}/details`);
    assetTypeId = Number(details.AssetTypeId || assetTypeId || 0);
  } catch (err) {
    console.warn(`Could not fetch clothing details for ${catalogId}:`, err.message);
  }

  const supportedTypes = new Set([0, 2, 11, 12]);
  if (!supportedTypes.has(assetTypeId)) {
    throw new Error(`Unsupported clothing type (${assetTypeId}). Only classic shirts, pants and t-shirts are supported.`);
  }

  const filePath = path.join(tempDir, `${catalogId}_template.png`);
  fs.writeFileSync(filePath, templateBuffer);

  return {
    catalogId,
    templateId,
    name: details.Name || `Classic clothing ${catalogId}`,
    creator: details.Creator?.Name || "Unknown",
    assetTypeId,
    typeLabel: clothingTypeLabel(assetTypeId),
    filePath,
  };
}

async function handleClassicClothingSteal(interaction, idInput, sourceCommand = "steal") {
  const lang = languageFor(interaction);
  const quote = calculateClothingCopyPrice(interaction);
  const allowanceText = formatClothingAllowance(quote, lang);
  const balanceBefore = walletAvailableBalance(interaction.user.id, "clothing");

  if (balanceBefore < quote.walletAmount) {
    await replyOrEditInteraction(interaction, {
      content: formatInsufficientBalanceMessage({
        service: lang === "pt-BR" ? "Copiar template de roupa" : lang === "es" ? "Copiar template de ropa" : "Copy clothing template",
        price: quote.walletAmount,
        balance: balanceBefore,
        language: lang,
      }),
      flags: 64,
    });
    return;
  }

  await replyOrEditInteraction(interaction,
    (lang === "pt-BR" ? "## Copiar roupa\n" : lang === "es" ? "## Copiar ropa\n" : "## Copy Clothing\n") +
    `**Input:** \`${idInput}\`\n` +
    `${allowanceText}\n` +
    `**${lang === "pt-BR" ? "Preço" : lang === "es" ? "Precio" : "Price"}:** ${formatTokenAmount(quote.walletAmount)}\n\n` +
    (lang === "pt-BR"
      ? "Preparando o template original da roupa..."
      : lang === "es"
        ? "Preparando el template original de la ropa..."
        : "Preparing the original clothing template...")
  );

  try {
    const result = await downloadClassicClothingTemplate(idInput);
    const debit = removeWalletBalance({
      userId: interaction.user.id,
      amount: quote.walletAmount,
      actorId: client.user.id,
      reason: "Classic clothing template copied",
      meta: {
        command: sourceCommand,
        serviceKey: "clothing",
        catalogId: result.catalogId,
        templateId: result.templateId,
        assetTypeId: result.assetTypeId,
        priceTokens: quote.walletAmount,
      },
    });
    const usage = addClothingUsage(interaction.user.id, 1);
    const finalQuote = calculateClothingCopyPrice(interaction, usage.count);
    const resetAction = createClothingTemplateAction({ userId: interaction.user.id, result });

    await interaction.editReply({
      content:
        (lang === "pt-BR" ? "## Template de roupa copiado\n" : lang === "es" ? "## Template de ropa copiado\n" : "## Clothing Template Copied\n") +
        `**${lang === "pt-BR" ? "Item" : lang === "es" ? "Item" : "Item"}:** ${result.name}\n` +
        `**Catalog ID:** \`${result.catalogId}\`\n` +
        `**Template ID:** \`${result.templateId}\`\n` +
        `**${lang === "pt-BR" ? "Tipo" : lang === "es" ? "Tipo" : "Type"}:** ${result.typeLabel}\n` +
        `**${lang === "pt-BR" ? "Criador" : lang === "es" ? "Creador" : "Creator"}:** ${result.creator}\n` +
        `${formatClothingAllowance(finalQuote, lang)}\n` +
        `**${lang === "pt-BR" ? "Preço" : lang === "es" ? "Precio" : "Price"}:** ${formatTokenAmount(quote.walletAmount)}\n` +
        `**${lang === "pt-BR" ? "Saldo restante" : lang === "es" ? "Saldo restante" : "Remaining balance"}:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
        (lang === "pt-BR"
          ? "O arquivo original do template está anexado abaixo.\n\nUse **Reset Template** para receber essa mesma roupa com o guia visível por cima."
          : lang === "es"
            ? "El archivo original del template está adjunto abajo.\n\nUsa **Reset Template** para recibir esta misma ropa con una guia visible encima."
            : "Original template file is attached below.\n\nUse **Reset Template** to receive this same clothing with a visible template guide on top."),
      files: [publicImageAttachment(result.filePath, `${result.catalogId}_template.png`)],
      components: [clothingResetButton(resetAction.id)],
    });
  } catch (err) {
    console.error(err);
    const message = String(err.message || err);
    const isRateLimited = message.includes("rate-limiting") || message.includes("Too many requests") || message.includes("(429)");

    await interaction.editReply(
      isRateLimited
        ? (lang === "pt-BR"
          ? "## Roblox está limitando downloads de roupas\nAguarde alguns minutos e tente `/steal` novamente. Nenhum Service Credit foi descontado."
          : lang === "es"
            ? "## Roblox está limitando descargas de ropa\nEspera unos minutos e intenta `/steal` otra vez. No se descontaron Service Credits."
            : "## Roblox is rate-limiting clothing downloads\nWait a few minutes and try `/steal` again. No charge was deducted.")
        : (lang === "pt-BR"
          ? "## Não consegui copiar este template de roupa\nApenas shirts, pants e t-shirts clássicas são suportadas agora. Confira o ID ou envie para a equipe revisar manualmente."
          : lang === "es"
            ? "## No pude copiar este template de ropa\nSolo shirts, pants y t-shirts clasicas son compatibles ahora. Verifica el ID o envialo al equipo para revision manual."
            : "## I could not copy this clothing template\nOnly classic shirts, pants and t-shirts are supported right now. Check the ID or send it to the team for manual review.")
    );

    if (userIsAdmin(interaction)) {
      await interaction.followUp({
        content:
          "## Admin diagnostic\n" +
          `\`\`\`\n${String(err.message || err).slice(0, 1500)}\n\`\`\``,
        flags: 64,
      }).catch(() => {});
    }
  }
}

function extractAssetId(text, names) {
  for (const name of names) {
    const regexes = [
      new RegExp(`<Content name="${name}">[\\s\\S]*?<url>[^<]*id=(\\d+)[^<]*<\\/url>`, "i"),
      new RegExp(`<string name="${name}">[^<]*?(\\d+)[^<]*<\\/string>`, "i"),
      new RegExp(`${name}[\\s\\S]{0,300}?id=(\\d+)`, "i"),
      new RegExp(`${name}[\\s\\S]{0,300}?rbxassetid:\\/\\/(\\d+)`, "i"),
    ];

    for (const regex of regexes) {
      const match = text.match(regex);
      if (match) return match[1];
    }
  }

  return null;
}

function writeObj(mesh, objPath) {
  const vertices = mesh.vertices;
  const normals = mesh.normals || [];
  const uvs = mesh.uvs || [];
  const faces = mesh.faces;
  const lods = mesh.lods || [0, faces.length / 3];
  const faceStart = (lods[0] || 0) * 3;
  const faceEnd = (lods[1] || faces.length / 3) * 3;

  if (!vertices?.length) throw new Error("Mesh sem vertices.");
  if (!faces?.length) throw new Error("Mesh sem faces.");

  let obj = "";
  let outIndex = 1;

  for (let i = faceStart; i < faceEnd; i += 3) {
    const faceVerts = [faces[i], faces[i + 1], faces[i + 2]];

    if (
      faceVerts.some(idx =>
        idx < 0 ||
        idx * 3 + 2 >= vertices.length ||
        (uvs.length && idx * 2 + 1 >= uvs.length) ||
        (normals.length && idx * 3 + 2 >= normals.length)
      )
    ) {
      continue;
    }

    for (const idx of faceVerts) {
      obj += `v ${vertices[idx * 3]} ${vertices[idx * 3 + 1]} ${vertices[idx * 3 + 2]}\n`;
    }

    if (uvs.length) {
      for (const idx of faceVerts) {
        obj += `vt ${uvs[idx * 2]} ${uvs[idx * 2 + 1]}\n`;
      }
    }

    if (normals.length) {
      for (const idx of faceVerts) {
        obj += `vn ${normals[idx * 3]} ${normals[idx * 3 + 1]} ${normals[idx * 3 + 2]}\n`;
      }
    }

    if (uvs.length && normals.length) {
      obj += `f ${outIndex}/${outIndex}/${outIndex} ${outIndex + 1}/${outIndex + 1}/${outIndex + 1} ${outIndex + 2}/${outIndex + 2}/${outIndex + 2}\n`;
    } else if (uvs.length) {
      obj += `f ${outIndex}/${outIndex} ${outIndex + 1}/${outIndex + 1} ${outIndex + 2}/${outIndex + 2}\n`;
    } else if (normals.length) {
      obj += `f ${outIndex}//${outIndex} ${outIndex + 1}//${outIndex + 1} ${outIndex + 2}//${outIndex + 2}\n`;
    } else {
      obj += `f ${outIndex} ${outIndex + 1} ${outIndex + 2}\n`;
    }

    outIndex += 3;
  }

  fs.writeFileSync(objPath, obj);
}

async function renderImages(objPath, texturePath, tempDir, renderSettings = DEFAULT_RENDER_SETTINGS) {
  const renderDir = path.join(tempDir, "renders");
  fs.mkdirSync(renderDir, { recursive: true });
  const normalizedRenderSettings = normalizeRenderSettings(renderSettings);
  const renderSettingsPath = path.join(tempDir, "render_settings.json");
  fs.writeFileSync(renderSettingsPath, JSON.stringify(normalizedRenderSettings, null, 2));

  await execFileAsync(BLENDER_PATH, [
    "--background",
    "--factory-startup",
    "--python",
    path.join(__dirname, "render_views.py"),
    "--",
    objPath,
    texturePath || "",
    renderDir,
    renderSettingsPath,
  ]);

  return renderDir;
}

function exportGlb(objPath, texturePath, glbPath) {
  execFileSync(
    BLENDER_PATH,
    [
      "--background",
      "--factory-startup",
      "--python",
      path.join(__dirname, "export_glb.py"),
      "--",
      objPath,
      texturePath || "",
      glbPath,
    ],
    { stdio: "inherit" }
  );
}

function textureToneConfig(textureTone = DEFAULT_TEXTURE_TONE, adjustments = DEFAULT_TEXTURE_ADJUSTMENTS) {
  const tone = TEXTURE_TONES[normalizeTextureTone(textureTone)] || TEXTURE_TONES[DEFAULT_TEXTURE_TONE];
  const normalizedAdjustments = normalizeTextureAdjustments(adjustments);

  return {
    label: tone.label,
    value: tone.value * normalizedAdjustments.value,
    saturation: tone.saturation * normalizedAdjustments.saturation,
    gamma: tone.gamma,
  };
}

function optimizeGlbForRoblox(
  modelPath,
  textureTone = DEFAULT_TEXTURE_TONE,
  textureAdjustments = DEFAULT_TEXTURE_ADJUSTMENTS,
  maxTextureSize = ROBLOX_MAX_TEXTURE_SIZE,
  exportImageFormat = "AUTO",
  jpegQuality = 75,
  materialMode = "PRESERVE"
) {
  if (!modelPath || !fs.existsSync(modelPath) || path.extname(modelPath).toLowerCase() !== ".glb") {
    return modelPath;
  }

  const tempOutputPath = modelPath.replace(/\.glb$/i, ".roblox_safe.glb");

  try {
    execFileSync(
      BLENDER_PATH,
      [
        "--background",
        "--factory-startup",
        "--python",
        path.join(__dirname, "optimize_glb_for_roblox.py"),
        "--",
        modelPath,
        tempOutputPath,
        String(maxTextureSize),
        normalizeTextureTone(textureTone),
        JSON.stringify(textureToneConfig(textureTone, textureAdjustments)),
        exportImageFormat,
        String(jpegQuality),
        materialMode,
      ],
      { stdio: "inherit" }
    );

    if (fs.existsSync(tempOutputPath)) {
      fs.copyFileSync(tempOutputPath, modelPath);
      fs.rmSync(tempOutputPath, { force: true });
    }
  } catch (err) {
    console.warn("Nao consegui otimizar texturas para Roblox:", err.message);
  }

  return modelPath;
}

function createRobloxBasicModelCopy(
  modelPath,
  textureTone = DEFAULT_TEXTURE_TONE,
  textureAdjustments = DEFAULT_TEXTURE_ADJUSTMENTS
) {
  if (!modelPath || !fs.existsSync(modelPath) || path.extname(modelPath).toLowerCase() !== ".glb") {
    return null;
  }

  const outputPath = modelPath.replace(/(?:_pbr)?\.glb$/i, "_roblox.glb");
  if (outputPath === modelPath) return null;

  fs.copyFileSync(modelPath, outputPath);
  optimizeGlbForRoblox(
    outputPath,
    textureTone,
    textureAdjustments,
    ROBLOX_MAX_TEXTURE_SIZE,
    "AUTO",
    75,
    "BASIC"
  );
  ensureModelFitsDiscord(outputPath, textureTone, textureAdjustments);
  return outputPath;
}

function ensureModelFitsDiscord(modelPath, textureTone = DEFAULT_TEXTURE_TONE, textureAdjustments = DEFAULT_TEXTURE_ADJUSTMENTS) {
  if (!modelPath || !fs.existsSync(modelPath)) return modelPath;

  let size = fs.statSync(modelPath).size;
  if (size <= DISCORD_MAX_ATTACHMENT_BYTES) return modelPath;

  const attempts = [
    { maxTextureSize: 1024, exportImageFormat: "AUTO", jpegQuality: 75 },
    { maxTextureSize: 512, exportImageFormat: "AUTO", jpegQuality: 75 },
    { maxTextureSize: 1024, exportImageFormat: "JPEG", jpegQuality: 78 },
    { maxTextureSize: 768, exportImageFormat: "JPEG", jpegQuality: 72 },
    { maxTextureSize: 512, exportImageFormat: "JPEG", jpegQuality: 68 },
  ];

  for (const attempt of attempts) {
    console.warn(
      `Final model is ${formatBytes(size)}, above Discord limit ${formatBytes(DISCORD_MAX_ATTACHMENT_BYTES)}. ` +
      `Retrying Roblox optimization with ${attempt.maxTextureSize}px textures and ${attempt.exportImageFormat} images.`
    );

    optimizeGlbForRoblox(
      modelPath,
      textureTone,
      textureAdjustments,
      attempt.maxTextureSize,
      attempt.exportImageFormat,
      attempt.jpegQuality
    );
    size = fs.statSync(modelPath).size;
    if (size <= DISCORD_MAX_ATTACHMENT_BYTES) return modelPath;
  }

  return modelPath;
}

function renderSettingsCacheKey(settings) {
  const normalized = normalizeRenderSettings(settings);
  return crypto
    .createHash("sha1")
    .update(JSON.stringify({ version: VIEW_RENDER_CACHE_VERSION, settings: normalized }))
    .digest("hex")
    .slice(0, 12);
}

function viewCachePath(ugcId, renderSettings = DEFAULT_RENDER_SETTINGS) {
  return path.join(VIEW_CACHE_DIR, String(ugcId), renderSettingsCacheKey(renderSettings));
}

function expectedViewFiles(renderDir) {
  return ["frente.png", "direita.png", "costas.png", "esquerda.png", "isometrica.png"]
    .map(file => path.join(renderDir, file));
}

function readViewCache(ugcId, renderSettings = DEFAULT_RENDER_SETTINGS) {
  const renderDir = viewCachePath(ugcId, renderSettings);
  const metadataPath = path.join(renderDir, "metadata.json");

  if (!fs.existsSync(metadataPath)) return null;
  if (!expectedViewFiles(renderDir).every(file => fs.existsSync(file))) return null;

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const createdAt = Date.parse(metadata.createdAt || 0);

  if (!createdAt || Date.now() - createdAt > VIEW_CACHE_MAX_AGE_MS) return null;

  return { ...metadata, renderDir, cached: true };
}

function writeViewCache(ugcId, renderDir, metadata, renderSettings = DEFAULT_RENDER_SETTINGS) {
  const cacheDir = viewCachePath(ugcId, renderSettings);
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  for (const file of expectedViewFiles(renderDir)) {
    if (!fs.existsSync(file)) continue;
    fs.copyFileSync(file, path.join(cacheDir, path.basename(file)));
  }

  fs.writeFileSync(
    path.join(cacheDir, "metadata.json"),
    JSON.stringify({ ...metadata, createdAt: new Date().toISOString() }, null, 2)
  );

  return cacheDir;
}

async function processUGC(ugcId, options = {}) {
  const shouldExportGlb = options.exportGlb !== false;
  const shouldRender = options.render !== false;
  const renderSettings = normalizeRenderSettings(options.renderSettings || DEFAULT_RENDER_SETTINGS);

  if (shouldRender && !shouldExportGlb && options.cacheViews) {
    const cached = readViewCache(ugcId, renderSettings);

    if (cached) {
      return {
        ugcId,
        tempDir: null,
        rbxmPath: null,
        objPath: null,
        glbPath: null,
        texturePath: null,
        hasTexture: Boolean(cached.textureId),
        renderDir: cached.renderDir,
        meshId: cached.meshId,
        textureId: cached.textureId,
        cached: true,
      };
    }
  }

  const tempDir = path.join(__dirname, "temp", "refazer", `${ugcId}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const rbxmPath = path.join(tempDir, `${ugcId}.rbxm`);
  const objPath = path.join(tempDir, `${ugcId}.obj`);
  const glbPath = path.join(tempDir, `${ugcId}.glb`);
  const texturePath = path.join(tempDir, `${ugcId}_texture.png`);

  const ugcBuffer = await downloadRobloxAsset(ugcId);
  fs.writeFileSync(rbxmPath, ugcBuffer);

  const ugcText = ugcBuffer.toString("utf8");
  const meshId = extractAssetId(ugcText, ["MeshId", "MeshID", "Mesh"]);
  const textureId = extractAssetId(ugcText, ["TextureId", "TextureID", "Texture"]);

  if (!meshId) {
    throw new Error(`Nao consegui encontrar MeshId no UGC ${ugcId}.`);
  }

  const meshPromise = downloadRobloxAsset(meshId);
  const texturePromise = textureId
    ? downloadRobloxAsset(textureId).catch(err => {
      console.warn("Nao consegui baixar textura:", err.message);
      return null;
    })
    : Promise.resolve(null);

  const meshBuffer = await meshPromise;
  const mesh = loadMeshParser().parse(meshBuffer);

  let hasTexture = false;
  const textureBuffer = await texturePromise;

  if (textureBuffer) {
    fs.writeFileSync(texturePath, textureBuffer);
    hasTexture = true;
  }

  writeObj(mesh, objPath);

  if (shouldExportGlb) {
    try {
      exportGlb(objPath, hasTexture ? texturePath : "", glbPath);
    } catch (err) {
      console.warn("Nao consegui exportar GLB original:", err.message);
    }
  }

  let renderDir = shouldRender
    ? await renderImages(objPath, hasTexture ? texturePath : "", tempDir, renderSettings)
    : null;

  if (renderDir && options.cacheViews) {
    renderDir = writeViewCache(ugcId, renderDir, {
      ugcId,
      meshId,
      textureId: hasTexture ? textureId : null,
      renderSettings,
    }, renderSettings);
  }

  return {
    ugcId,
    tempDir,
    rbxmPath,
    objPath,
    glbPath,
    texturePath,
    hasTexture,
    renderDir,
    meshId,
    textureId,
  };
}

function getRenderPaths(renderDir) {
  return ["frente.png", "direita.png", "costas.png", "esquerda.png", "isometrica.png"]
    .map(file => path.join(renderDir, file))
    .filter(file => fs.existsSync(file));
}

function copyFileToDir(filePath, outputDir, prefix = "") {
  const outputPath = path.join(outputDir, `${prefix}${path.basename(filePath)}`);
  fs.copyFileSync(filePath, outputPath);
  return outputPath;
}

function variationPrompt(difference) {
  if (difference <= 3) {
    return "Create a cleaner product reference image from this input. Keep the same accessory, camera angle, silhouette, proportions, colors, materials, lighting, shadows, and background. Improve only clarity, sharpness, compression artifacts, and texture readability. Do not redesign the object.";
  }

  if (difference <= 7) {
    return "Create a cleaner redesigned variation inspired by the original Roblox UGC, changing visible details while preserving the general category and silhouette.";
  }

  return "Create a strongly different Roblox-ready accessory concept inspired by the original only as a loose reference, with a new visual identity and clear modelable details.";
}

function imageEnhancementPrompts() {
  return [
    "Return only an edited image. Do not reply with text. Improve this image for use as a clean 3D modeling reference. Make it sharper, clearer, and easier to read while preserving the same object and view.",
  ];
}

function geminiImageModelFallbacks(preferredModel) {
  return [
    preferredModel,
    "gemini-3.1-flash-image",
  ].filter((model, index, list) => model && list.indexOf(model) === index);
}

async function writeResponseAsset(res, outputPath, fallbackJsonPath) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await res.json();
    fs.writeFileSync(fallbackJsonPath, JSON.stringify(json, null, 2));

    const imageUrl = json.image_url || json.imageUrl || json.url;
    const modelUrl = json.model_url || json.modelUrl || json.glb_url || json.glbUrl;
    const base64 = json.image_base64 || json.imageBase64 || json.model_base64 || json.modelBase64;

    if (imageUrl || modelUrl) {
      const assetBuffer = await downloadPublicUrl(imageUrl || modelUrl);
      fs.writeFileSync(outputPath, assetBuffer);
      return outputPath;
    }

    if (base64) {
      fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
      return outputPath;
    }

    return null;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

async function downloadPublicUrl(url) {
  let lastStatus = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());

    lastStatus = `${res.status} ${res.statusText}`;
    if (!isTransientHyper3dStatus(res.status) || attempt === 4) {
      break;
    }

    await wait(Math.min(30000, 3000 * (attempt + 1)));
  }

  throw new Error(`Nao consegui baixar retorno da IA. Codigo: ${lastStatus}`);
}

function getImageContentType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function extractGeminiOutputImage(json) {
  const direct =
    json?.output_image ||
    json?.outputImage ||
    json?.output?.image ||
    json?.response?.output_image ||
    json?.candidates?.[0]?.content?.parts?.find?.(part => part?.inlineData?.data || part?.inline_data?.data)?.inlineData ||
    json?.candidates?.[0]?.content?.parts?.find?.(part => part?.inlineData?.data || part?.inline_data?.data)?.inline_data;

  if (direct?.data) return direct;

  const candidates = [
    ...(Array.isArray(json?.steps) ? json.steps : []),
    ...(Array.isArray(json?.output) ? json.output : []),
    ...(Array.isArray(json?.outputs) ? json.outputs : []),
  ];

  for (const item of candidates) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const contentBlock of content) {
      if ((contentBlock?.type === "image" || contentBlock?.mime_type?.startsWith?.("image/")) && contentBlock?.data) {
        return contentBlock;
      }

      const nestedImage = contentBlock?.output_image || contentBlock?.outputImage || contentBlock?.image;
      if (nestedImage?.data) return nestedImage;
    }

    const image = item?.output_image || item?.outputImage || item?.image || item;
    if (image?.data) return image;
    if (image?.inlineData?.data) return image.inlineData;
    if (image?.inline_data?.data) return image.inline_data;
  }

  return null;
}

function normalizeGeminiModelForGenerateContent(model) {
  const normalized = cleanEnv(model);
  const aliases = {
    "gemini-3.1-flash-lite-image": "gemini-2.5-flash-image-preview",
    "gemini-3.1-flash-image": "gemini-2.5-flash-image-preview",
    "gemini-3-pro-image": "gemini-3-pro-image-preview",
  };

  return aliases[normalized] || normalized;
}

async function enhanceImageWithGeminiGenerateContent({ imagePath, outputPath, prompt, model }) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY nao configurado.");

  const imageBuffer = fs.readFileSync(imagePath);
  const finalOutputPath = outputPath.replace(/\.[^.]+$/i, ".jpg");
  const restModel = normalizeGeminiModelForGenerateContent(model);
  const base = GEMINI_API_BASE.replace(/\/+$/, "");
  const inlineImage = {
    mimeType: getImageContentType(imagePath),
    data: imageBuffer.toString("base64"),
  };
  const snakeInlineImage = {
    mime_type: getImageContentType(imagePath),
    data: imageBuffer.toString("base64"),
  };
  const payloads = [
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: inlineImage },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    },
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: snakeInlineImage },
          ],
        },
      ],
      generation_config: {
        response_modalities: ["IMAGE", "TEXT"],
      },
    },
  ];
  const errors = [];

  for (const payload of payloads) {
    const res = await fetch(`${base}/models/${encodeURIComponent(restModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      errors.push(`Gemini generateContent enhancement failed (${res.status}): ${text || res.statusText}`);
      continue;
    }

    const outputImage = extractGeminiOutputImage(json);
    if (!outputImage?.data) {
      fs.writeFileSync(finalOutputPath.replace(/\.jpe?g$/i, ".generate-content.json"), JSON.stringify(json, null, 2));
      errors.push("Gemini generateContent nao retornou imagem melhorada.");
      continue;
    }

    fs.writeFileSync(finalOutputPath, Buffer.from(outputImage.data, "base64"));
    return finalOutputPath;
  }

  throw new Error(errors.join(" | "));
}

async function enhanceImageWithGemini({ imagePath, outputPath, prompt, model }) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY nao configurado.");

  const imageBuffer = fs.readFileSync(imagePath);
  const finalOutputPath = outputPath.replace(/\.[^.]+$/i, ".jpg");
  const res = await fetch(`${GEMINI_API_BASE}/interactions`, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { type: "text", text: prompt },
        {
          type: "image",
          mime_type: getImageContentType(imagePath),
          data: imageBuffer.toString("base64"),
        },
      ],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        image_size: "1K",
      },
    }),
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Gemini image enhancement failed (${res.status}): ${text || res.statusText}`);
  }

  const outputImage = extractGeminiOutputImage(json);
  if (!outputImage?.data) {
    fs.writeFileSync(finalOutputPath.replace(/\.jpe?g$/i, ".json"), JSON.stringify(json, null, 2));
    throw new Error("Gemini nao retornou imagem melhorada.");
  }

  fs.writeFileSync(finalOutputPath, Buffer.from(outputImage.data, "base64"));
  return finalOutputPath;
}

async function enhanceImageWithGeminiFallbacks({ imagePath, outputPath, model }) {
  const errors = [];

  for (const candidateModel of geminiImageModelFallbacks(model)) {
    for (const prompt of imageEnhancementPrompts()) {
      try {
        return await enhanceImageWithGemini({
          imagePath,
          outputPath,
          prompt,
          model: candidateModel,
        });
      } catch (err) {
        errors.push(`${candidateModel}: ${String(err.message || err).slice(0, 220)}`);
      }
    }
  }

  throw new Error(`All image enhancement attempts failed. ${errors.join(" | ")}`);
}

function guidedAiEnhancementPrompt({ objectType, view }) {
  const side = publicViewName(view).toLowerCase();
  const baseRules = [
    "Edit the provided image as a conservative 3D-model reference cleanup.",
    "Return only the edited image.",
    "Preserve the exact object identity, outline, silhouette, proportions, camera angle, pose, colors, material categories, style, background and lighting direction.",
    "Keep every visible part in the same position and do not invent hidden areas.",
    "Do not add, remove, replace, restyle, reinterpret, crop, rotate, mirror, warp or redesign any element.",
    "Improve only reference readability: sharper edges, clearer small details, cleaner texture readability, less compression blur and better separation between dark shapes.",
    "Keep the image suitable as a faithful multiview input for generating a Roblox-ready 3D model.",
  ];

  if (objectType === "person") {
    return [
      ...baseRules,
      "This is a floating head or head accessory reference, not a full-body portrait.",
      "Preserve the exact face, expression, skin tone, hair shape, hair placement and accessories.",
      "Do not add a neck, shoulders, body, clothes, new facial features, new hair, makeup, jewelry or realistic redesigns.",
      side.includes("back")
        ? "For the back view, keep it as a true back view. Do not reveal eyes, mouth or a front-facing face."
        : "Keep the same visible face angle. Do not beautify, age, gender-swap or change facial structure.",
    ].join(" ");
  }

  if (objectType === "character") {
    return [
      ...baseRules,
      "This is a stylized character or avatar item reference.",
      "Keep the same cartoon or game-style look. Do not make it photorealistic.",
      "Sharpen readable features, seams, symbols and material detail while preserving the original geometry and colors.",
    ].join(" ");
  }

  return [
    ...baseRules,
    "This is a wearable accessory or product-style asset, not a human character.",
    "Keep the exact cartoon or stylized look when present. Do not make it realistic unless the original already is realistic.",
    "Enhance material readability with subtle depth, edge clarity and ambient-occlusion-like separation without changing the shape.",
    side.includes("back")
      ? "For the back view, keep it as a true back view. Do not convert it into a front view."
      : "",
  ].filter(Boolean).join(" ");
}

async function enhanceImageWithOpenAI({ imagePath, outputPath, prompt }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

  const finalOutputPath = outputPath.replace(/\.[^.]+$/i, ".png");
  const imageBuffer = fs.readFileSync(imagePath);
  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("image", new Blob([imageBuffer], { type: getImageContentType(imagePath) }), path.basename(imagePath));
  form.append("size", OPENAI_IMAGE_SIZE);
  form.append("quality", OPENAI_IMAGE_QUALITY);
  form.append("response_format", "b64_json");

  let res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });

  let text = await res.text();
  if (!res.ok && /response_format|unknown parameter|unsupported/i.test(text)) {
    const retryForm = new FormData();
    retryForm.append("model", OPENAI_IMAGE_MODEL);
    retryForm.append("prompt", prompt);
    retryForm.append("image", new Blob([imageBuffer], { type: getImageContentType(imagePath) }), path.basename(imagePath));
    retryForm.append("size", OPENAI_IMAGE_SIZE);
    retryForm.append("quality", OPENAI_IMAGE_QUALITY);

    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: retryForm,
    });
    text = await res.text();
  }

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`OpenAI image enhancement failed (${res.status}): ${text || res.statusText}`);
  }

  const item = json?.data?.[0];
  if (item?.b64_json) {
    fs.writeFileSync(finalOutputPath, Buffer.from(item.b64_json, "base64"));
    return finalOutputPath;
  }

  if (item?.url) {
    const imageRes = await fetch(item.url);
    if (!imageRes.ok) throw new Error(`OpenAI image URL download failed (${imageRes.status})`);
    fs.writeFileSync(finalOutputPath, Buffer.from(await imageRes.arrayBuffer()));
    return finalOutputPath;
  }

  fs.writeFileSync(finalOutputPath.replace(/\.png$/i, ".openai.json"), JSON.stringify(json, null, 2));
  throw new Error("OpenAI did not return an enhanced image.");
}

async function enhanceImageLocally({ imagePath, outputPath }) {
  const finalOutputPath = outputPath.replace(/\.[^.]+$/i, ".png");
  const scriptPath = path.join(path.dirname(finalOutputPath), "local_image_enhance.py");
  const script = [
    "import bpy, sys, shutil",
    "src = sys.argv[-2]",
    "dst = sys.argv[-1]",
    "try:",
    "    img = bpy.data.images.load(src)",
    "    w, h = img.size",
    "    target = 2048",
    "    scale = min(2.0, target / max(w, h)) if max(w, h) else 1.0",
    "    if scale > 1.0:",
    "        img.scale(max(1, int(w * scale)), max(1, int(h * scale)))",
    "    img.save_render(dst)",
    "except Exception:",
    "    shutil.copyfile(src, dst)",
  ].join("\n");

  fs.writeFileSync(scriptPath, script);

  try {
    await execFileAsync(BLENDER_PATH, ["--background", "--python", scriptPath, "--", imagePath, finalOutputPath], {
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 4,
    });
  } catch (err) {
    console.warn(`Local image enhancement fallback copied original: ${err.message}`);
    fs.copyFileSync(imagePath, finalOutputPath);
  }

  return finalOutputPath;
}

async function generateImageWithGemini({ prompt, outputPath, model, imageSize = "1K", aspectRatio = "1:1" }) {
  if (!GEMINI_API_KEY) throw new Error("Image generation is not configured.");

  const res = await fetch(`${GEMINI_API_BASE}/interactions`, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          type: "text",
          text:
            "Create a clean product-style reference image for a Roblox UGC accessory. " +
            "Use a simple background, clear silhouette, visible material details, no text, no watermark. " +
            `Prompt: ${prompt}`,
        },
      ],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        image_size: imageSize,
        aspect_ratio: aspectRatio,
      },
    }),
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status}): ${text || res.statusText}`);
  }

  const outputImage = extractGeminiOutputImage(json);
  if (!outputImage?.data) {
    fs.writeFileSync(outputPath.replace(/\.jpe?g$/i, ".json"), JSON.stringify(json, null, 2));
    throw new Error("Image generation finished without an image.");
  }

  fs.writeFileSync(outputPath, Buffer.from(outputImage.data, "base64"));
  return outputPath;
}

async function tripoRequest(endpoint, options = {}) {
  if (!TRIPO_API_KEY) {
    throw new Error("TRIPO_API_KEY nao configurado no .env");
  }

  const res = await fetch(`${TRIPO_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TRIPO_API_KEY}`,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Tripo API falhou (${res.status}): ${text || res.statusText}`);
  }

  if (json && json.code !== undefined && json.code !== 0) {
    throw new Error(`Tripo API retornou erro ${json.code}: ${json.message || text}`);
  }

  return json;
}

async function uploadImageToTripo(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const form = new FormData();
  const blob = new Blob([buffer], { type: getImageContentType(imagePath) });

  form.append("file", blob, path.basename(imagePath));

  const json = await tripoRequest("/upload/sts", {
    method: "POST",
    body: form,
  });

  const imageToken = json?.data?.image_token;
  if (!imageToken) {
    throw new Error("Upload do Tripo nao retornou image_token.");
  }

  return imageToken;
}

async function downloadAttachmentToFile(attachment, outputPath) {
  const res = await fetch(attachment.url);

  if (!res.ok) {
    throw new Error(`Nao consegui baixar a imagem ${attachment.name}.`);
  }

  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
  return outputPath;
}

async function createTripoTask(payload) {
  const json = await tripoRequest("/task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const taskId = json?.data?.task_id;
  if (!taskId) {
    throw new Error("Tripo nao retornou task_id.");
  }

  return taskId;
}

async function pollTripoTask(taskId, onProgress) {
  let lastProgressKey = "";

  for (let attempt = 0; attempt < 180; attempt++) {
    const json = await tripoRequest(`/task/${taskId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = json?.data || {};
    const status = data.status;
    const progress = data.progress ?? 0;
    const progressKey = `${status}:${progress}`;

    if (onProgress && progressKey !== lastProgressKey && (attempt % 5 === 0 || progress >= 95 || status === "success")) {
      lastProgressKey = progressKey;
      await onProgress({ status, progress, consumedCredit: data.consumed_credit });
    }

    if (status === "success") return data;

    if (["failed", "banned", "expired", "cancelled", "unknown"].includes(status)) {
      throw new Error(`Task Tripo terminou com status ${status}.`);
    }

    const waitMs = progress >= 95 ? 5000 : 2000;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  throw new Error("Tempo limite aguardando task do Tripo.");
}

function selectBestTripoModelUrl(output) {
  return output?.model || output?.pbr_model || output?.base_model;
}

function tripoModelSupportsSmartOptions() {
  return !/^P1(?:-|$)/i.test(TRIPO_MODEL_VERSION);
}

function applyTripoGenerationOptions(payload) {
  if (!tripoModelSupportsSmartOptions()) return payload;

  if (TRIPO_GEOMETRY_QUALITY) {
    payload.geometry_quality = TRIPO_GEOMETRY_QUALITY;
  }

  if (TRIPO_SMART_LOW_POLY) {
    payload.smart_low_poly = true;
  }

  if (TRIPO_QUAD) {
    payload.quad = true;
  }

  return payload;
}

function selectImageForTripo(imagePaths, preferredView) {
  if (preferredView) {
    const preferred = imagePaths.find(file =>
      path.basename(file).toLowerCase().includes(preferredView.toLowerCase())
    );

    if (preferred) return preferred;
  }

  return imagePaths.find(file => path.basename(file).toLowerCase().includes("isometrica")) ||
    imagePaths.find(file => path.basename(file).toLowerCase().includes("frente")) ||
    imagePaths[0];
}

function viewPathsFromRenderedImages(imagePaths) {
  const viewPaths = {};

  for (const view of MULTIVIEW_VIEW_ORDER) {
    const file = imagePaths.find(item => {
      const base = path.basename(item).toLowerCase();
      return base === `${view}.png` ||
        base === `${view}.jpg` ||
        base === `${view}.jpeg` ||
        base.startsWith(`${view}_`) ||
        base.startsWith(`${view}-`);
    });

    if (file) viewPaths[view] = file;
  }

  return MULTIVIEW_VIEW_ORDER.every(view => viewPaths[view]) ? viewPaths : null;
}

function modelGenerationIsConfigured() {
  if (MODEL_PROVIDER === "hyper3d") return Boolean(HYPER3D_API_KEY);
  if (MODEL_PROVIDER === "tripo") return Boolean(TRIPO_API_KEY || TRIPO_AI_ENDPOINT);
  return Boolean(HYPER3D_API_KEY || TRIPO_API_KEY || TRIPO_AI_ENDPOINT);
}

function shouldUseHyper3d() {
  return MODEL_PROVIDER === "hyper3d" || (MODEL_PROVIDER === "auto" && Boolean(HYPER3D_API_KEY));
}

function shouldUseTripo() {
  return MODEL_PROVIDER === "tripo" || (MODEL_PROVIDER === "auto" && !HYPER3D_API_KEY && Boolean(TRIPO_API_KEY || TRIPO_AI_ENDPOINT));
}

function activeModelEngineLabel() {
  if (MODEL_PROVIDER === "hyper3d") {
    return HYPER3D_API_KEY
      ? `Hyper3D locked (${HYPER3D_TIER}, ${HYPER3D_MATERIAL}, ${HYPER3D_MESH_MODE})`
      : "Hyper3D locked but HYPER3D_API_KEY is missing";
  }
  if (MODEL_PROVIDER === "tripo") {
    if (TRIPO_API_KEY) return `Tripo locked (${TRIPO_MODEL_VERSION})`;
    if (TRIPO_AI_ENDPOINT) return "Legacy custom endpoint locked";
    return "Tripo locked but TRIPO_API_KEY is missing";
  }
  if (HYPER3D_API_KEY) return `Hyper3D auto (${HYPER3D_TIER}, ${HYPER3D_MATERIAL}, ${HYPER3D_MESH_MODE})`;
  if (TRIPO_API_KEY) return `Tripo auto fallback (${TRIPO_MODEL_VERSION})`;
  if (TRIPO_AI_ENDPOINT) return "Legacy custom endpoint auto fallback";
  return "not configured";
}

async function generateModelWithOfficialTripo({ imagePaths, texture, triangles, tempDir, preferredView, textureTone, textureAdjustments, onProgress }) {
  const tripoDir = path.join(tempDir, "tripo_ai");
  fs.mkdirSync(tripoDir, { recursive: true });

  const imagePath = selectImageForTripo(imagePaths, preferredView);
  if (!imagePath) throw new Error("Nao encontrei imagem para enviar ao Tripo.");

  const imageToken = await uploadImageToTripo(imagePath);

  const payload = {
    type: "image_to_model",
    file: {
      type: "image",
      file_token: imageToken,
    },
    model_version: TRIPO_MODEL_VERSION,
    texture: texture !== "none",
    pbr: texture !== "none",
  };

  if (triangles) payload.face_limit = triangles;
  applyTripoGenerationOptions(payload);

  fs.writeFileSync(path.join(tripoDir, "tripo_payload.json"), JSON.stringify({
    ...payload,
    file: { type: "image", file_token: "[hidden]" },
    source_image: path.basename(imagePath),
    preferred_view: preferredView || "auto",
  }, null, 2));

  const taskId = await createTripoTask(payload);
  fs.writeFileSync(path.join(tripoDir, "tripo_task_id.txt"), taskId);

  const task = await pollTripoTask(taskId, onProgress);
  fs.writeFileSync(path.join(tripoDir, "tripo_result.json"), JSON.stringify(task, null, 2));

  const modelUrl = selectBestTripoModelUrl(task.output);
  if (!modelUrl) {
    throw new Error("Tripo finalizou, mas nao retornou URL de modelo.");
  }

  const modelBuffer = await downloadPublicUrl(modelUrl);
  const modelPath = path.join(tripoDir, "tripo_real.glb");
  fs.writeFileSync(modelPath, modelBuffer);
  if (onProgress) await onProgress({ status: "finalizing", progress: 100 });
  optimizeGlbForRoblox(modelPath, textureTone, textureAdjustments);
  ensureModelFitsDiscord(modelPath, textureTone, textureAdjustments);

  return {
    skipped: false,
    official: true,
    taskId,
    consumedCredit: task.consumed_credit,
    sourceImage: path.basename(imagePath),
    outputDir: tripoDir,
    modelPath,
  };
}

async function generateMultiviewWithOfficialTripo({ viewPaths, texture, triangles, tempDir, textureTone, textureAdjustments, onProgress }) {
  const tripoDir = path.join(tempDir, "tripo_ai");
  fs.mkdirSync(tripoDir, { recursive: true });

  const viewOrder = MULTIVIEW_UPLOAD_ORDER;
  const files = [];

  for (const view of viewOrder) {
    const imagePath = viewPaths[view];
    if (!imagePath) throw new Error(`Imagem ${view} nao encontrada.`);
    const imageToken = await uploadImageToTripo(imagePath);
    files.push({ type: "image", file_token: imageToken });
  }

  const payload = {
    type: "multiview_to_model",
    files,
    model_version: TRIPO_MODEL_VERSION,
    texture: texture !== "none",
    pbr: texture !== "none",
  };

  if (triangles) payload.face_limit = triangles;
  applyTripoGenerationOptions(payload);

  fs.writeFileSync(path.join(tripoDir, "tripo_payload.json"), JSON.stringify({
    ...payload,
    review_order: MULTIVIEW_VIEW_ORDER,
    upload_order: viewOrder,
    files: viewOrder.map(view => ({ type: "image", file_token: "[hidden]", view, file: path.basename(viewPaths[view]) })),
  }, null, 2));

  const taskId = await createTripoTask(payload);
  fs.writeFileSync(path.join(tripoDir, "tripo_task_id.txt"), taskId);

  const task = await pollTripoTask(taskId, onProgress);
  fs.writeFileSync(path.join(tripoDir, "tripo_result.json"), JSON.stringify(task, null, 2));

  const modelUrl = selectBestTripoModelUrl(task.output);
  if (!modelUrl) {
    throw new Error("A geracao finalizou, mas nao retornou o modelo.");
  }

  const modelBuffer = await downloadPublicUrl(modelUrl);
  const modelPath = path.join(tripoDir, "tripo_real.glb");
  fs.writeFileSync(modelPath, modelBuffer);
  if (onProgress) await onProgress({ status: "finalizing", progress: 100 });
  optimizeGlbForRoblox(modelPath, textureTone, textureAdjustments);
  ensureModelFitsDiscord(modelPath, textureTone, textureAdjustments);

  return {
    skipped: false,
    official: true,
    taskId,
    consumedCredit: task.consumed_credit,
    sourceViews: viewOrder.map(view => path.basename(viewPaths[view])),
    outputDir: tripoDir,
    modelPath,
  };
}

async function generatePromptModelWithOfficialTripo({ prompt, texture, triangles, tempDir, textureTone, textureAdjustments, onProgress }) {
  const tripoDir = path.join(tempDir, "text_model");
  fs.mkdirSync(tripoDir, { recursive: true });

  const payload = {
    type: "text_to_model",
    prompt,
    model_version: TRIPO_MODEL_VERSION,
    texture: texture !== "none",
    pbr: texture !== "none",
  };

  if (triangles) payload.face_limit = triangles;
  applyTripoGenerationOptions(payload);

  fs.writeFileSync(path.join(tripoDir, "model_payload.json"), JSON.stringify(payload, null, 2));

  const taskId = await createTripoTask(payload);
  fs.writeFileSync(path.join(tripoDir, "model_task_id.txt"), taskId);

  const task = await pollTripoTask(taskId, onProgress);
  fs.writeFileSync(path.join(tripoDir, "model_result.json"), JSON.stringify(task, null, 2));

  const modelUrl = selectBestTripoModelUrl(task.output);
  if (!modelUrl) {
    throw new Error("The generation finished without a model file.");
  }

  const modelBuffer = await downloadPublicUrl(modelUrl);
  const modelPath = path.join(tripoDir, "velvet_model.glb");
  fs.writeFileSync(modelPath, modelBuffer);
  if (onProgress) await onProgress({ status: "finalizing", progress: 100 });
  optimizeGlbForRoblox(modelPath, textureTone, textureAdjustments);
  ensureModelFitsDiscord(modelPath, textureTone, textureAdjustments);

  return {
    taskId,
    consumedCredit: task.consumed_credit,
    outputDir: tripoDir,
    modelPath,
  };
}

function isTransientHyper3dStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(Number(status));
}

async function hyper3dRequest(endpoint, options = {}) {
  if (!HYPER3D_API_KEY) {
    throw new Error("HYPER3D_API_KEY nao configurado no .env");
  }

  const attempts = options.retryAttempts || 5;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let res;
    try {
      res = await fetch(`${HYPER3D_API_BASE}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${HYPER3D_API_KEY}`,
          ...(options.headers || {}),
        },
      });
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) {
        await wait(Math.min(45000, 3000 * (attempt + 1)));
        continue;
      }
      throw err;
    }

    const text = await res.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      lastError = new Error(`Hyper3D API failed (${res.status}): ${text || res.statusText}`);
      if (isTransientHyper3dStatus(res.status) && attempt < attempts - 1) {
        const retryAfter = Number(res.headers.get("retry-after") || 0);
        await wait(retryAfter > 0 ? Math.min(retryAfter * 1000, 45000) : Math.min(45000, 4000 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }

    if (json?.error && json.error !== "OK") {
      throw new Error(`Hyper3D API error ${json.error}: ${json.message || text}`);
    }

    return json;
  }

  throw lastError || new Error("Hyper3D API failed after retries.");
}

function hyper3dTriangleTarget(triangles) {
  const requested = Number(triangles) || ROBLOX_SAFE_TRIANGLE_LIMIT;
  const clamped = Math.max(500, Math.min(4000, requested));
  const presets = [500, 800, 1100, 1400, 1700, 2000, 4000];
  return presets.reduce((best, value) => {
    const bestDistance = Math.abs(best - clamped);
    const valueDistance = Math.abs(value - clamped);
    if (valueDistance < bestDistance) return value;
    if (valueDistance === bestDistance && value > best) return value;
    return best;
  }, presets[0]);
}

function shouldSendHyper3dTriangleTarget(triangles) {
  return HYPER3D_USE_QUALITY_OVERRIDE || Boolean(Number(triangles));
}

function appendHyper3dOptions(form, { prompt, texture, triangles, useAlpha = HYPER3D_USE_ORIGINAL_ALPHA, modelQuality = null }) {
  const geometryInstructMode = HYPER3D_GEOMETRY_INSTRUCT_MODE.toLowerCase();
  const qualityConfig = modelQuality ? modelQualityConfig(modelQuality) : { label: HYPER3D_QUALITY, hyper3dQuality: HYPER3D_QUALITY };
  const sentOptions = {
    site_like: HYPER3D_SITE_LIKE_MODE,
    tier: HYPER3D_TIER,
    geometry_file_format: "glb",
    material: texture === "none" ? "None" : HYPER3D_MATERIAL,
    quality: qualityConfig.hyper3dQuality,
  };
  form.append("tier", HYPER3D_TIER);
  form.append("geometry_file_format", "glb");
  form.append("material", texture === "none" ? "None" : HYPER3D_MATERIAL);
  form.append("quality", qualityConfig.hyper3dQuality);

  if (!HYPER3D_SITE_LIKE_MODE && HYPER3D_MESH_MODE) {
    form.append("mesh_mode", HYPER3D_MESH_MODE);
    sentOptions.mesh_mode = HYPER3D_MESH_MODE;
  }
  if (shouldSendHyper3dTriangleTarget(triangles)) {
    const target = hyper3dTriangleTarget(triangles);
    form.append("quality_override", String(target));
    sentOptions.quality_override = target;
  }

  if (!HYPER3D_SITE_LIKE_MODE) {
    form.append("preview_render", String(HYPER3D_PREVIEW_RENDER));
    form.append("hd_texture", "false");
    form.append("texture_mode", HYPER3D_TEXTURE_MODE);
    form.append("texture_delight", String(HYPER3D_TEXTURE_DELIGHT));
    sentOptions.preview_render = HYPER3D_PREVIEW_RENDER;
    sentOptions.hd_texture = false;
    sentOptions.texture_mode = HYPER3D_TEXTURE_MODE;
    sentOptions.texture_delight = HYPER3D_TEXTURE_DELIGHT;
  }
  if (
    HYPER3D_GEOMETRY_INSTRUCT_MODE &&
    !["off", "none", "default", "auto", "false", "0"].includes(geometryInstructMode)
  ) {
    form.append("geometry_instruct_mode", HYPER3D_GEOMETRY_INSTRUCT_MODE);
    sentOptions.geometry_instruct_mode = HYPER3D_GEOMETRY_INSTRUCT_MODE;
  }

  if (useAlpha || !HYPER3D_SITE_LIKE_MODE) {
    form.append("use_original_alpha", String(Boolean(useAlpha)));
    sentOptions.use_original_alpha = Boolean(useAlpha);
  }

  if (prompt) {
    form.append("prompt", prompt);
    sentOptions.prompt = true;
  }
  if (HYPER3D_HIGH_PACK) {
    form.append("addons", "HighPack");
    sentOptions.addons = ["HighPack"];
  }

  return sentOptions;
}

async function createHyper3dTask({ imagePaths = [], prompt = "", texture = "standard", triangles = null, outputDir, useAlpha = HYPER3D_USE_ORIGINAL_ALPHA, modelQuality = null }) {
  const form = new FormData();
  const qualityConfig = modelQuality ? modelQualityConfig(modelQuality) : { label: HYPER3D_QUALITY, hyper3dQuality: HYPER3D_QUALITY };

  for (const imagePath of imagePaths.slice(0, 5)) {
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBlob = new Blob([imageBuffer], { type: getImageContentType(imagePath) });
    form.append("images", imageBlob, path.basename(imagePath));
  }

  const sentOptions = appendHyper3dOptions(form, { prompt, texture, triangles, useAlpha, modelQuality });

  const json = await hyper3dRequest("/rodin", {
    method: "POST",
    body: form,
  });

  if (!json?.uuid || !json?.jobs?.subscription_key) {
    throw new Error("Hyper3D did not return uuid/subscription_key.");
  }

  console.log(
    `[Hyper3D] task created uuid=${json.uuid} mode=${imagePaths.length ? "image" : "prompt"} ` +
    `images=${imagePaths.length} tier=${HYPER3D_TIER} material=${texture === "none" ? "None" : HYPER3D_MATERIAL} ` +
    `quality=${qualityConfig.hyper3dQuality} site_like=${HYPER3D_SITE_LIKE_MODE ? "yes" : "no"} mesh=${sentOptions.mesh_mode || "site-default"} triangles=${shouldSendHyper3dTriangleTarget(triangles) ? hyper3dTriangleTarget(triangles) : "auto"} ` +
    `geometry_instruct=${HYPER3D_GEOMETRY_INSTRUCT_MODE || "none"} alpha=${useAlpha ? "yes" : "no"} ` +
    `prompt=${prompt ? "yes" : "no"}`
  );

  fs.writeFileSync(path.join(outputDir, "hyper3d_task.json"), JSON.stringify({
    uuid: json.uuid,
    subscription_key: json.jobs.subscription_key,
    image_count: imagePaths.length,
    image_order: imagePaths.map(file => path.basename(file)),
    expected_multiview_order: imagePaths.length > 1 ? MULTIVIEW_UPLOAD_ORDER.map(publicViewName) : null,
    prompt: prompt || null,
    texture,
    triangles: shouldSendHyper3dTriangleTarget(triangles) ? hyper3dTriangleTarget(triangles) : null,
    quality_override_enabled: shouldSendHyper3dTriangleTarget(triangles),
    sent_options: sentOptions,
  }, null, 2));

  return {
    taskId: json.uuid,
    subscriptionKey: json.jobs.subscription_key,
  };
}

async function pollHyper3dTask(subscriptionKey, onProgress) {
  let lastProgressKey = "";

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const json = await hyper3dRequest("/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_key: subscriptionKey }),
    });

    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    const statuses = jobs.map(job => job.status || "Waiting");
    const allDone = statuses.length > 0 && statuses.every(status => status === "Done");
    const anyFailed = statuses.some(status => status === "Failed");
    const status = allDone ? "success" : anyFailed ? "failed" : statuses.includes("Generating") ? "running" : "waiting";
    const progress = allDone
      ? 100
      : anyFailed
        ? 100
        : statuses.includes("Generating")
          ? Math.min(95, 10 + Math.floor(attempt * 1.5))
          : Math.min(10, attempt);
    const progressKey = `${status}:${progress}`;

    if (onProgress && progressKey !== lastProgressKey && (attempt % 2 === 0 || allDone || anyFailed || progress >= 95)) {
      lastProgressKey = progressKey;
      await onProgress({ status, progress });
    }

    if (allDone) return json;
    if (anyFailed) throw new Error("Hyper3D generation failed.");

    await wait(5000);
  }

  throw new Error("Timeout waiting for Hyper3D task.");
}

function selectHyper3dModelItem(items) {
  return items.find(item => /\.glb(?:$|\?)/i.test(item.name || item.url || "")) ||
    items.find(item => /\.(zip|fbx|obj)(?:$|\?)/i.test(item.name || item.url || "")) ||
    items.find(item => !/preview\.webp/i.test(item.name || ""));
}

function hyper3dModelItems(items) {
  const modelItems = items.filter(item => /\.glb(?:$|\?)/i.test(item.name || item.url || ""));
  if (modelItems.length) {
    return modelItems.sort((a, b) => {
      const aName = String(a.name || a.url || "").toLowerCase();
      const bName = String(b.name || b.url || "").toLowerCase();
      const score = name => name.includes("pbr") ? 0 : name.includes("shaded") ? 1 : 2;
      return score(aName) - score(bName);
    });
  }

  const selected = selectHyper3dModelItem(items);
  return selected ? [selected] : [];
}

async function downloadHyper3dResults({ taskId, outputDir }) {
  const json = await hyper3dRequest("/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_uuid: taskId }),
  });

  const items = Array.isArray(json?.list) ? json.list : [];
  fs.writeFileSync(path.join(outputDir, "hyper3d_download.json"), JSON.stringify(json, null, 2));

  const selectedItems = hyper3dModelItems(items).filter(item => item?.url);
  if (!selectedItems.length) {
    throw new Error("Hyper3D finished without a downloadable model file.");
  }

  const modelPaths = [];
  for (const [index, selected] of selectedItems.slice(0, 3).entries()) {
    const safeName = path.basename(selected.name || `velvet_model_${index + 1}.glb`).replace(/[^\w.-]+/g, "_");
    const extension = path.extname(safeName) || ".glb";
    const lowerName = safeName.toLowerCase();
    const outputName = extension.toLowerCase() === ".glb"
      ? lowerName.includes("shaded")
        ? "velvet_model_shaded.glb"
        : lowerName.includes("pbr")
          ? "velvet_model_pbr.glb"
          : index === 0 && HYPER3D_MATERIAL.toLowerCase() === "pbr"
            ? "velvet_model_pbr.glb"
          : index === 0 && HYPER3D_MATERIAL.toLowerCase() === "shaded"
            ? "velvet_model_shaded.glb"
          : index === 0
            ? "velvet_model.glb"
            : `velvet_model_${index + 1}.glb`
      : safeName;
    const modelPath = path.join(outputDir, outputName);
    fs.writeFileSync(modelPath, await downloadPublicUrl(selected.url));
    modelPaths.push(modelPath);
  }

  return {
    modelPath: modelPaths[0],
    modelPaths,
    items,
    selected: selectedItems[0],
  };
}

async function generateTextureOnlyWithHyper3d({ modelPath, imagePath, texture, resolution, tempDir, textureTone, textureAdjustments, onProgress }) {
  if (!modelPath || !fs.existsSync(modelPath)) throw new Error("Advanced texture requires a generated model file.");
  if (!imagePath || !fs.existsSync(imagePath)) throw new Error("Advanced texture requires a selected reference image.");

  const outputDir = path.join(tempDir, "hyper3d_texture_only");
  fs.mkdirSync(outputDir, { recursive: true });

  const form = new FormData();
  form.append("image", new Blob([fs.readFileSync(imagePath)], { type: getImageContentType(imagePath) }), path.basename(imagePath));
  form.append("model", new Blob([fs.readFileSync(modelPath)], { type: "model/gltf-binary" }), path.basename(modelPath));
  form.append("geometry_file_format", "glb");
  form.append("material", texture === "none" ? "None" : HYPER3D_MATERIAL);
  form.append("resolution", resolution || "Basic");
  form.append("reference_scale", "1");

  const json = await hyper3dRequest("/rodin_texture_only", {
    method: "POST",
    body: form,
  });

  if (!json?.uuid || !json?.jobs?.subscription_key) {
    throw new Error("Hyper3D texture pass did not return uuid/subscription_key.");
  }

  console.log(
    `[Hyper3D] texture task created uuid=${json.uuid} source=${path.basename(imagePath)} ` +
    `resolution=${resolution || "Basic"} material=${texture === "none" ? "None" : HYPER3D_MATERIAL}`
  );

  fs.writeFileSync(path.join(outputDir, "hyper3d_texture_task.json"), JSON.stringify({
    uuid: json.uuid,
    subscription_key: json.jobs.subscription_key,
    source_image: path.basename(imagePath),
    source_model: path.basename(modelPath),
    resolution: resolution || "Basic",
    material: texture === "none" ? "None" : HYPER3D_MATERIAL,
  }, null, 2));

  if (onProgress) await onProgress({ status: "texturing", progress: 96 });
  await pollHyper3dTask(json.jobs.subscription_key, onProgress);
  const downloaded = await downloadHyper3dResults({ taskId: json.uuid, outputDir });

  const modelPaths = downloaded.modelPaths?.length ? [...downloaded.modelPaths] : [downloaded.modelPath];
  for (const outputModelPath of modelPaths) {
    if (path.extname(outputModelPath).toLowerCase() === ".glb") {
      optimizeGlbForRoblox(outputModelPath, textureTone, textureAdjustments, ROBLOX_MAX_TEXTURE_SIZE, "AUTO", 75);
      ensureModelFitsDiscord(outputModelPath, textureTone, textureAdjustments);
    }
  }

  const hasPbrModel = modelPaths.some(file => /pbr/i.test(path.basename(file || "")));
  const hasRobloxBasicModel = modelPaths.some(file => /(shaded|roblox|basic)/i.test(path.basename(file || "")));
  if (texture !== "none" && hasPbrModel && !hasRobloxBasicModel) {
    const pbrPath = modelPaths.find(file => /pbr/i.test(path.basename(file || ""))) || modelPaths[0];
    const robloxPath = createRobloxBasicModelCopy(pbrPath, textureTone, textureAdjustments);
    if (robloxPath) modelPaths.push(robloxPath);
  }

  return {
    modelPath: modelPaths[0],
    modelPaths,
    taskId: json.uuid,
    subscriptionKey: json.jobs.subscription_key,
  };
}

async function generateWithOfficialHyper3d({ imagePaths = [], prompt = "", texture, triangles, tempDir, textureTone, textureAdjustments, onProgress, mode = "image", useAlpha = HYPER3D_USE_ORIGINAL_ALPHA, modelQuality = null, textureSourceImagePath = null, advancedTexture = "none" }) {
  const outputDir = path.join(tempDir, "hyper3d_ai");
  fs.mkdirSync(outputDir, { recursive: true });
  const advancedTextureCfg = advancedTextureConfig(advancedTexture);

  const task = await createHyper3dTask({
    imagePaths,
    prompt,
    texture,
    triangles,
    outputDir,
    useAlpha,
    modelQuality,
  });

  let downloaded;
  try {
    await pollHyper3dTask(task.subscriptionKey, onProgress);
    downloaded = await downloadHyper3dResults({ taskId: task.taskId, outputDir });
  } catch (err) {
    fs.writeFileSync(path.join(outputDir, "hyper3d_error.json"), JSON.stringify({
      task_id: task.taskId,
      subscription_key: task.subscriptionKey,
      error: String(err.message || err),
      at: new Date().toISOString(),
    }, null, 2));
    err.message = `${err.message || err} | Hyper3D task: ${task.taskId}`;
    throw err;
  }

  if (onProgress) await onProgress({ status: "finalizing", progress: 100 });

  const modelPaths = downloaded.modelPaths?.length ? [...downloaded.modelPaths] : [downloaded.modelPath];
  for (const modelPath of modelPaths) {
    if (path.extname(modelPath).toLowerCase() === ".glb") {
      optimizeGlbForRoblox(modelPath, textureTone, textureAdjustments, ROBLOX_MAX_TEXTURE_SIZE, "AUTO", 75);
      ensureModelFitsDiscord(modelPath, textureTone, textureAdjustments);
    }
  }

  const hasPbrModel = modelPaths.some(file => /pbr/i.test(path.basename(file || "")));
  const hasRobloxBasicModel = modelPaths.some(file => /(shaded|roblox|basic)/i.test(path.basename(file || "")));
  if (texture !== "none" && hasPbrModel && !hasRobloxBasicModel) {
    const pbrPath = modelPaths.find(file => /pbr/i.test(path.basename(file || ""))) || modelPaths[0];
    const robloxPath = createRobloxBasicModelCopy(pbrPath, textureTone, textureAdjustments);
    if (robloxPath) modelPaths.push(robloxPath);
  }

  if (advancedTextureCfg.resolution && textureSourceImagePath) {
    const sourceModelPath = modelPaths.find(file => /pbr/i.test(path.basename(file || ""))) || modelPaths[0];
    const textured = await generateTextureOnlyWithHyper3d({
      modelPath: sourceModelPath,
      imagePath: textureSourceImagePath,
      texture,
      resolution: advancedTextureCfg.resolution,
      tempDir,
      textureTone,
      textureAdjustments,
      onProgress,
    });

    return {
      skipped: false,
      official: true,
      provider: "hyper3d",
      taskId: textured.taskId,
      subscriptionKey: textured.subscriptionKey,
      baseTaskId: task.taskId,
      baseSubscriptionKey: task.subscriptionKey,
      consumedCredit: (HYPER3D_HIGH_PACK ? 1.5 : 0.5) + 0.5,
      sourceImage: textureSourceImagePath ? path.basename(textureSourceImagePath) : null,
      modelPath: textured.modelPath,
      modelPaths: textured.modelPaths,
    };
  }

  return {
    skipped: false,
    official: true,
    provider: "hyper3d",
    taskId: task.taskId,
    subscriptionKey: task.subscriptionKey,
    consumedCredit: HYPER3D_HIGH_PACK ? 1.5 : 0.5,
    sourceImage: imagePaths[0] ? path.basename(imagePaths[0]) : null,
    sourceViews: imagePaths.map(file => path.basename(file)),
    outputDir,
    modelPath: downloaded.modelPath,
    modelPaths,
    mode,
  };
}

async function enhanceImagePaths(inputPaths, difference, tempDir, mockIa, enhancement = "none") {
  const enhancementConfig = IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none;
  const enhancedDir = path.join(tempDir, "nano_banana_pro");
  fs.mkdirSync(enhancedDir, { recursive: true });

  if (enhancement === "none") {
    return {
      skipped: true,
      reason: "melhoria desativada",
      imagePaths: inputPaths,
      outputDir: enhancedDir,
    };
  }

  if (enhancement === "economy") {
    const imagePaths = [];

    for (const inputPath of inputPaths) {
      const outputPath = path.join(enhancedDir, `${path.parse(inputPath).name}_clean.png`);
      const cleanedPath = await enhanceImageLocally({ imagePath: inputPath, outputPath });
      imagePaths.push(cleanedPath);
    }

    fs.writeFileSync(
      path.join(enhancedDir, "local_cleanup_result.json"),
      JSON.stringify({
        provider: "local",
        enhancement,
        images: imagePaths.map(file => path.basename(file)),
      }, null, 2)
    );

    return {
      skipped: false,
      local: true,
      enhancement,
      imagePaths,
      outputDir: enhancedDir,
    };
  }

  if (mockIa) {
    const imagePaths = inputPaths.map(file => copyFileToDir(file, enhancedDir, "mock_"));
    fs.writeFileSync(
      path.join(enhancedDir, "mock_result.json"),
      JSON.stringify({
        provider: "mock",
        enhancement,
        model: enhancementConfig.model,
        difference,
        prompt: variationPrompt(difference),
        images: imagePaths.map(file => path.basename(file)),
      }, null, 2)
    );

    return {
      skipped: false,
      mocked: true,
      imagePaths,
      outputDir: enhancedDir,
    };
  }

  if (!GEMINI_API_KEY && !NANO_BANANA_PRO_ENDPOINT) {
    return {
      skipped: true,
      reason: "GEMINI_API_KEY ou NANO_BANANA_PRO_ENDPOINT nao configurado",
      imagePaths: inputPaths,
      outputDir: enhancedDir,
    };
  }

  const imagePaths = [];

  for (const inputPath of inputPaths) {
    const outputPath = path.join(enhancedDir, path.basename(inputPath));
    const jsonPath = path.join(enhancedDir, `${path.parse(inputPath).name}.json`);

    if (GEMINI_API_KEY) {
      const savedPath = await enhanceImageWithGemini({
        imagePath: inputPath,
        outputPath,
        prompt: variationPrompt(difference),
        model: enhancementConfig.model,
      });
      imagePaths.push(savedPath);
      continue;
    }

    const form = new FormData();
    const imageBuffer = fs.readFileSync(inputPath);
    const imageBlob = new Blob([imageBuffer], { type: getImageContentType(inputPath) });

    form.append("image", imageBlob, path.basename(inputPath));
    form.append("difference", String(difference));
    form.append("prompt", variationPrompt(difference));
    form.append("model", enhancementConfig.model);
    form.append("enhancement", enhancement);

    const res = await fetch(NANO_BANANA_PRO_ENDPOINT, {
      method: "POST",
      headers: NANO_BANANA_PRO_API_KEY
        ? { Authorization: `Bearer ${NANO_BANANA_PRO_API_KEY}` }
        : undefined,
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Image enhancement failed for ${path.basename(inputPath)}. Status: ${res.status}`);
    }

    const savedPath = await writeResponseAsset(res, outputPath, jsonPath);

    if (savedPath) imagePaths.push(savedPath);
  }

  return {
    skipped: false,
    enhancement,
    model: enhancementConfig.model,
    imagePaths,
    outputDir: enhancedDir,
  };
}

async function enhanceImagesWithNanoBanana(renderDir, difference, tempDir, mockIa, enhancement = "none") {
  return enhanceImagePaths(getRenderPaths(renderDir), difference, tempDir, mockIa, enhancement);
}

async function generateModelWithTripo(imagePaths, difference, tempDir, sourceGlbPath, sourceObjPath, mockIa, options = {}) {
  const tripoDir = path.join(tempDir, "tripo_ai");
  fs.mkdirSync(tripoDir, { recursive: true });

  if (mockIa) {
    const sourcePath = fs.existsSync(sourceGlbPath) ? sourceGlbPath : sourceObjPath;
    const extension = path.extname(sourcePath) || ".glb";
    const modelPath = path.join(tripoDir, `refeito_mock${extension}`);

    fs.copyFileSync(sourcePath, modelPath);
    fs.writeFileSync(
      path.join(tripoDir, "mock_result.json"),
      JSON.stringify({
        provider: "mock",
        difference,
        prompt: variationPrompt(difference),
        inputImages: imagePaths.map(file => path.basename(file)),
        model: path.basename(modelPath),
      }, null, 2)
    );

    return {
      skipped: false,
      mocked: true,
      outputDir: tripoDir,
      modelPath,
    };
  }

  if (shouldUseHyper3d()) {
    const autoMultiviewPaths = !options.preferredView
      ? viewPathsFromRenderedImages(imagePaths)
      : null;

    if (autoMultiviewPaths) {
      const generated = await generateWithOfficialHyper3d({
        imagePaths: MULTIVIEW_UPLOAD_ORDER.map(view => autoMultiviewPaths[view]).filter(Boolean),
        prompt: "",
        texture: options.texture || "standard",
        triangles: options.triangles || null,
        tempDir,
        textureTone: options.textureTone || DEFAULT_TEXTURE_TONE,
        textureAdjustments: options.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS,
        onProgress: options.onProgress,
        mode: "multiview",
      });

      return {
        ...generated,
        autoMultiview: true,
      };
    }

    const imagePath = selectImageForTripo(imagePaths, options.preferredView || null);
    return generateWithOfficialHyper3d({
      imagePaths: imagePath ? [imagePath] : imagePaths.slice(0, 1),
      prompt: variationPrompt(difference),
      texture: options.texture || "standard",
      triangles: options.triangles || null,
      tempDir,
      textureTone: options.textureTone || DEFAULT_TEXTURE_TONE,
      textureAdjustments: options.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS,
      onProgress: options.onProgress,
      mode: "image",
    });
  }

  if (shouldUseTripo()) {
    const autoMultiviewPaths = !options.preferredView
      ? viewPathsFromRenderedImages(imagePaths)
      : null;

    if (autoMultiviewPaths) {
      const generated = await generateMultiviewWithOfficialTripo({
        viewPaths: autoMultiviewPaths,
        texture: options.texture || "standard",
        triangles: options.triangles || null,
        tempDir,
        textureTone: options.textureTone || DEFAULT_TEXTURE_TONE,
        textureAdjustments: options.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS,
        onProgress: options.onProgress,
      });

      return {
        ...generated,
        autoMultiview: true,
      };
    }

    return generateModelWithOfficialTripo({
      imagePaths,
      texture: options.texture || "standard",
      triangles: options.triangles || null,
      tempDir,
      preferredView: options.preferredView || null,
      textureTone: options.textureTone || DEFAULT_TEXTURE_TONE,
      textureAdjustments: options.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS,
      onProgress: options.onProgress,
    });
  }

  if (!TRIPO_AI_ENDPOINT) {
    return {
      skipped: true,
      reason: "Real model generation endpoint is not configured",
      outputDir: tripoDir,
      modelPath: null,
    };
  }

  const form = new FormData();

  for (const imagePath of imagePaths) {
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBlob = new Blob([imageBuffer], { type: "image/png" });
    form.append("images", imageBlob, path.basename(imagePath));
  }

  form.append("difference", String(difference));
  form.append("prompt", variationPrompt(difference));
  form.append("target", "Roblox-ready GLB accessory model");

  const res = await fetch(TRIPO_AI_ENDPOINT, {
    method: "POST",
    headers: TRIPO_AI_API_KEY
      ? { Authorization: `Bearer ${TRIPO_AI_API_KEY}` }
      : undefined,
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Geracao do modelo falhou. Codigo: ${res.status}`);
  }

  const modelPath = path.join(tripoDir, "refeito.glb");
  const jsonPath = path.join(tripoDir, "tripo_result.json");
  const savedPath = await writeResponseAsset(res, modelPath, jsonPath);
  optimizeGlbForRoblox(savedPath, options.textureTone || DEFAULT_TEXTURE_TONE, options.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS);
  ensureModelFitsDiscord(savedPath, options.textureTone || DEFAULT_TEXTURE_TONE, options.textureAdjustments || DEFAULT_TEXTURE_ADJUSTMENTS);

  return {
    skipped: false,
    outputDir: tripoDir,
    modelPath: savedPath,
  };
}

function attachmentsFromPaths(paths) {
  return paths
    .filter(Boolean)
    .filter(file => fs.existsSync(file))
    .map(file => new AttachmentBuilder(file));
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} B`;
}

function discordAttachmentLimitBytes(interaction) {
  const interactionLimit = Number(interaction?.attachmentSizeLimit);
  if (Number.isFinite(interactionLimit) && interactionLimit > 0) {
    return Math.max(1024 * 1024, Math.floor(interactionLimit * 0.92));
  }
  return DISCORD_MAX_ATTACHMENT_BYTES;
}

function publicModelAttachment(file, name = "velvet_model.glb", maxBytes = DISCORD_MAX_ATTACHMENT_BYTES) {
  if (!file || !fs.existsSync(file)) {
    throw new Error("Final model file was not found.");
  }

  const size = fs.statSync(file).size;
  if (size > maxBytes) {
    throw new Error(
      `Final model is too large for Discord delivery (${formatBytes(size)}). ` +
      `Current delivery limit is ${formatBytes(maxBytes)}.`
    );
  }

  return new AttachmentBuilder(file, { name });
}

function publicModelAttachmentName(file, index) {
  const lower = path.basename(file).toLowerCase();
  if (lower.includes("shaded")) return "velvet_model_shaded.glb";
  if (lower.includes("roblox") || lower.includes("basic")) return "velvet_model_roblox.glb";
  if (lower.includes("pbr")) return "velvet_model_pbr.glb";
  return index === 0 ? "velvet_model.glb" : `velvet_model_${index + 1}.glb`;
}

function publicModelDeliveryItems(files, maxBytes = DISCORD_MAX_ATTACHMENT_BYTES) {
  const modelFiles = [...new Set((files || []).filter(Boolean))].filter(file => fs.existsSync(file));
  if (!modelFiles.length) {
    throw new Error("Final model file was not found.");
  }

  const deliverableFiles = modelFiles.filter(file => {
    const size = fs.statSync(file).size;
    if (size <= maxBytes) return true;
    console.warn(
      `Skipping model attachment ${path.basename(file)} because it is ${formatBytes(size)}, ` +
      `above Discord limit ${formatBytes(maxBytes)}.`
    );
    return false;
  });

  if (!deliverableFiles.length) {
    const sizes = modelFiles
      .map(file => `${path.basename(file)}=${formatBytes(fs.statSync(file).size)}`)
      .join(", ");
    throw new Error(
      `Final model files are too large for Discord delivery. ` +
      `Limit: ${formatBytes(maxBytes)}. Files: ${sizes}`
    );
  }

  return deliverableFiles.slice(0, 3).map((file, index) => ({
    file,
    name: publicModelAttachmentName(file, index),
    size: fs.statSync(file).size,
  }));
}

function publicModelAttachments(files, maxBytes = DISCORD_MAX_ATTACHMENT_BYTES) {
  return publicModelDeliveryItems(files, maxBytes).map(item => publicModelAttachment(item.file, item.name, maxBytes));
}

function publicImageAttachment(file, name = "velvet_image.jpg") {
  return new AttachmentBuilder(file, { name });
}

async function createResetTemplateImage(action) {
  const sourcePath = action.filePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    const fresh = await downloadClassicClothingTemplate(action.catalogId);
    action.filePath = fresh.filePath;
  }

  const outputDir = path.join(__dirname, "temp", "refazer", "clothing-reset");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${action.catalogId}_reset_template_${Date.now()}.png`);
  const scriptPath = path.join(__dirname, "scripts", "create_clothing_reset_overlay.py");
  const args = [scriptPath, action.filePath, outputPath];
  if (fs.existsSync(CLOTHING_RESET_TEMPLATE_PATH)) args.push(CLOTHING_RESET_TEMPLATE_PATH);

  const candidates = [
    PYTHON_PATH,
    "python3",
    "python",
    "py",
  ].filter((item, index, list) => item && list.indexOf(item) === index);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, args, { timeout: 30000 });
      return outputPath;
    } catch (err) {
      lastError = err;
      if (err.code !== "ENOENT") break;
    }
  }

  throw lastError || new Error("Could not run Python image processor.");
}

function formatGenerationProgress({ status, progress, language = "en" }) {
  if (status === "finalizing") {
    if (language === "pt-BR") return "Finalizando arquivo pronto para Roblox...";
    if (language === "es") return "Finalizando archivo listo para Roblox...";
    return "Finalizing Roblox-ready file...";
  }
  if (status === "texturing") {
    if (language === "pt-BR") return "Aplicando referência de textura avançada...";
    if (language === "es") return "Aplicando referencia de textura avanzada...";
    return "Applying advanced texture reference...";
  }

  if (language === "pt-BR") return `Geração: ${status || "processando"} ${progress || 0}%`;
  if (language === "es") return `Generación: ${status || "procesando"} ${progress || 0}%`;
  return `Generation: ${status || "processing"} ${progress || 0}%`;
}

function multiviewReviewAttachments(viewPaths) {
  return MULTIVIEW_VIEW_ORDER
    .map((view, index) => {
      const file = viewPaths[view];
      if (!file || !fs.existsSync(file)) return null;
      const ext = path.extname(file) || ".png";
      const label = String(index + 1).padStart(2, "0");
      return new AttachmentBuilder(file, { name: `${label}-${publicViewName(view).toLowerCase()}${ext}` });
    })
    .filter(Boolean);
}

function createPendingMultiviewAction(data) {
  const id = crypto.randomBytes(8).toString("hex");
  setPendingMultiviewAction(id, {
    id,
    used: false,
    createdAt: Date.now(),
    status: "review",
    chargeStatus: "not_charged",
    deliveryStatus: "not_delivered",
    ...data,
  });
  return id;
}

function readPendingProviderTask(action) {
  const files = [
    path.join(action?.tempDir || "", "hyper3d_ai", "hyper3d_task.json"),
    path.join(action?.tempDir || "", "hyper3d_ai", "hyper3d_error.json"),
  ];

  for (const file of files) {
    try {
      if (!file || !fs.existsSync(file)) continue;
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        provider: "hyper3d",
        taskId: json.uuid || json.task_id || null,
        subscriptionKey: json.subscription_key || null,
        at: json.at || json.submit_time || null,
      };
    } catch {
      // Best-effort diagnostic only.
    }
  }

  return null;
}

function walletHasDebitForAction(actionId) {
  if (!actionId) return false;

  try {
    const db = readWalletDb();
    return (db.transactions || []).some(entry =>
      entry?.type === "debit" && entry?.meta?.actionId === actionId
    );
  } catch {
    return false;
  }
}

function shouldKeepPendingGenerationAction(action) {
  return [
    "interrupted",
    "generation_failed",
    "delivery_failed",
    "insufficient_balance_before_delivery",
    "delivered_charge_failed",
    "delivered_charge_review",
  ].includes(action?.status);
}

function markPendingGenerationInterrupted(actionId, action) {
  const delivered = action.deliveryStatus === "delivered" || action.status === "delivered_pending_charge";
  const charged = action.chargeStatus === "charged" || walletHasDebitForAction(actionId);

  action.inFlight = false;
  action.recoveredAfterRestart = true;
  action.recoveredAt = Date.now();
  action.providerTask = action.providerTask || readPendingProviderTask(action);

  if (charged) {
    action.used = true;
    action.status = "charged";
    action.chargeStatus = "charged";
    action.deliveryStatus = delivered ? "delivered" : (action.deliveryStatus || "unknown");
    action.lastError = "Bot restarted after this generation was already charged.";
    return;
  }

  if (delivered) {
    action.used = true;
    action.status = "delivered_charge_review";
    action.chargeStatus = "not_charged";
    action.deliveryStatus = "delivered";
    action.lastError = "Bot restarted after delivery before Service Credits charge could be confirmed. Manual billing review is needed.";
    return;
  }

  action.used = false;
  action.status = "interrupted";
  action.chargeStatus = "not_charged";
  action.deliveryStatus = "not_delivered";
  action.lastError = "Bot restarted while this generation was in progress. No Service Credits were charged by the bot because no final delivery was confirmed.";
}

async function notifyInterruptedPendingGeneration(actionId, action) {
  if (action.restartNoticeSentAt) return;

  const channelId = action.guidedThreadId || action.channelId || action.threadId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return;

  const taskLine = action.providerTask?.taskId
    ? `\n**Provider task:** \`${action.providerTask.taskId}\``
    : "";
  const delivered = action.deliveryStatus === "delivered";
  const guidance = delivered
    ? "The model appears to have been delivered, but no Service Credits charge was confirmed. Please review billing manually before rerunning it."
    : "You can click **Generate Model** again or contact the team with this Action ID.";

  await channel.send({
    content:
      "## Generation Interrupted\n" +
      "The bot restarted while this model was generating.\n\n" +
      `**Charge status:** ${action.chargeStatus || "not_charged"}\n` +
      `**Delivery status:** ${action.deliveryStatus || "unknown"}\n\n` +
      `${guidance}\n` +
      `**Action ID:** \`${actionId}\`${taskLine}`,
  }).catch(() => {});

  action.restartNoticeSentAt = Date.now();
  setPendingMultiviewAction(actionId, action);
}

async function recoverInterruptedPendingGenerations() {
  const interrupted = [];

  for (const [actionId, action] of pendingMultiviewActions.entries()) {
    if (!action?.recoveredAfterRestart || action.restartNoticeSentAt) continue;
    if (action.chargeStatus === "charged") continue;
    interrupted.push([actionId, action]);
  }

  for (const [actionId, action] of interrupted) {
    await notifyInterruptedPendingGeneration(actionId, action);
  }
}

function persistPendingMultiviewActions() {
  try {
    fs.mkdirSync(path.dirname(PENDING_MULTIVIEW_PATH), { recursive: true });
    fs.writeFileSync(
      PENDING_MULTIVIEW_PATH,
      JSON.stringify(Object.fromEntries(pendingMultiviewActions), null, 2)
    );
  } catch (err) {
    console.warn("Could not persist pending multiview actions:", err.message || err);
  }
}

function setPendingMultiviewAction(actionId, action) {
  pendingMultiviewActions.set(actionId, action);
  persistPendingMultiviewActions();
}

function deletePendingMultiviewAction(actionId) {
  pendingMultiviewActions.delete(actionId);
  persistPendingMultiviewActions();
}

function loadPendingMultiviewActions() {
  if (!fs.existsSync(PENDING_MULTIVIEW_PATH)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(PENDING_MULTIVIEW_PATH, "utf8"));
    const now = Date.now();
    for (const [id, action] of Object.entries(raw || {})) {
      if (!action) continue;
      if (action.used && !action.inFlight && !shouldKeepPendingGenerationAction(action)) continue;
      if (now - Number(action.createdAt || 0) > PENDING_MULTIVIEW_TTL_MS) continue;
      if (action.inFlight) {
        markPendingGenerationInterrupted(id, action);
        if (action.status === "charged") continue;
      }
      action.status = action.status || "review";
      action.chargeStatus = action.chargeStatus || "not_charged";
      action.deliveryStatus = action.deliveryStatus || "not_delivered";
      pendingMultiviewActions.set(id, action);
    }
    persistPendingMultiviewActions();
    console.log(`Loaded ${pendingMultiviewActions.size} pending multiview action(s).`);
  } catch (err) {
    console.warn("Could not load pending multiview actions:", err.message || err);
  }
}

function multiviewReviewButtons(actionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`multiview_generate:${actionId}`)
      .setLabel("Generate Model")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`multiview_cancel:${actionId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

function multiviewAdvancedTextureOfferButtons(actionId) {
  return [
    new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`multiview_texture_offer:${actionId}:frente`)
      .setLabel("Use Front")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`multiview_texture_offer:${actionId}:direita`)
      .setLabel("Use Right")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`multiview_texture_offer:${actionId}:costas`)
      .setLabel("Use Back")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`multiview_texture_offer:${actionId}:esquerda`)
      .setLabel("Use Left")
      .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`multiview_texture_offer:${actionId}:skip`)
        .setLabel("No, generate normally")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`multiview_texture_offer:${actionId}:never`)
        .setLabel("No, never show again")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function disableMultiviewReviewButtons(actionId, generated = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`multiview_generate:${actionId}`)
      .setLabel(generated ? "Generation Started" : "Generate Model")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`multiview_cancel:${actionId}`)
      .setLabel(generated ? "Locked" : "Cancelled")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

const guidedModelSessions = new Map();
const guidedModelCloseTimers = new Map();
const guidedModelStartOptions = new Map();
const GUIDED_MODEL_VIEW_STEPS = [
  { view: "frente", label: "Front", prompt: "Step 1 of 4", instruction: "Send the **front** photo." },
  { view: "direita", label: "Right", prompt: "Step 2 of 4", instruction: "Send the **right-side** photo." },
  { view: "esquerda", label: "Left", prompt: "Step 3 of 4", instruction: "Send the **left-side** photo." },
  { view: "costas", label: "Back", prompt: "Step 4 of 4", instruction: "Send the **back** photo." },
];

const GUIDED_MODEL_TYPE_LABELS = {
  person: "Face/person",
  character: "Character",
  object: "Pet or object",
  other: "Other",
};

function normalizeTriangleLimit(value, fallback = ROBLOX_SAFE_TRIANGLE_LIMIT) {
  return Math.round(clampNumber(value, ROBLOX_MIN_TRIANGLE_LIMIT, ROBLOX_MAX_TRIANGLE_LIMIT, fallback));
}

function normalizeModelGenerationPrompt(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function modelPromptReviewLine(prompt) {
  const clean = normalizeModelGenerationPrompt(prompt);
  if (!clean) return "";
  return `**Custom prompt:** ${clean.length > 260 ? `${clean.slice(0, 260)}...` : clean}\n`;
}

function guidedModelStartButton(triangles = ROBLOX_SAFE_TRIANGLE_LIMIT, prompt = "") {
  const triangleTarget = normalizeTriangleLimit(triangles);
  const cleanPrompt = normalizeModelGenerationPrompt(prompt);
  const optionId = cleanPrompt ? crypto.randomBytes(5).toString("hex") : "";
  if (optionId) {
    guidedModelStartOptions.set(optionId, {
      prompt: cleanPrompt,
      createdAt: Date.now(),
    });
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(optionId ? `guided3d_start:${triangleTarget}:${optionId}` : `guided3d_start:${triangleTarget}`)
      .setLabel("Start 3D Model")
      .setStyle(ButtonStyle.Success)
  );
}

function guidedModelTypeButtons(threadId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`guided3d_type:${threadId}:person`)
        .setLabel("Face/person")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`guided3d_type:${threadId}:character`)
        .setLabel("Character")
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`guided3d_type:${threadId}:object`)
        .setLabel("Pet or object")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`guided3d_type:${threadId}:other`)
        .setLabel("Other")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function guidedModelQualityButtons(threadId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`guided3d_quality:${threadId}:medium`)
        .setLabel("Standard")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`guided3d_quality:${threadId}:high`)
        .setLabel(`Sharper +${brlToWalletTokens(modelQualityConfig("high").priceExtraBrl)} Credits`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`guided3d_quality:${threadId}:ultra`)
        .setLabel(`Max +${brlToWalletTokens(modelQualityConfig("ultra").priceExtraBrl)} Credits`)
        .setStyle(ButtonStyle.Success)
    ),
    guidedModelThreadControls(threadId),
  ];
}

function guidedModelAlphaButtons(threadId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`guided3d_alpha:${threadId}:off`)
        .setLabel("Standard")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`guided3d_alpha:${threadId}:on`)
        .setLabel("Alpha-aware")
        .setStyle(ButtonStyle.Secondary)
    ),
    guidedModelThreadControls(threadId),
  ];
}

function guidedModelEnhancementButtons(threadId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`guided3d_enhancement:${threadId}:none`)
      .setLabel("Use originals")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`guided3d_enhancement:${threadId}:economy`)
      .setLabel("Clean references")
      .setStyle(ButtonStyle.Primary)
  );

  if (OPENAI_API_KEY) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`guided3d_enhancement:${threadId}:ai`)
        .setLabel("AI enhance")
        .setStyle(ButtonStyle.Success)
    );
  }

  return [row, guidedModelThreadControls(threadId)];
}

function guidedModelConfirmButtons(threadId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`guided3d_generate:${threadId}`)
      .setLabel("Create Final Model")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`guided3d_change:${threadId}`)
      .setLabel("Change Photo")
      .setStyle(ButtonStyle.Secondary)
  );
}

function guidedModelPrepareButtons(threadId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`guided3d_prepare:${threadId}`)
      .setLabel("Prepare References")
      .setStyle(ButtonStyle.Primary)
  );
}

function guidedModelThreadControls(threadId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`guided3d_close:${threadId}`)
      .setLabel("Close request")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

function guidedModelPlanCloseHours(interaction) {
  const plan = userRemakePlan(interaction);
  if (plan === "elite") return GUIDED_THREAD_ELITE_CLOSE_HOURS;
  if (plan === "premium") return GUIDED_THREAD_PREMIUM_CLOSE_HOURS;
  return GUIDED_THREAD_FREE_CLOSE_HOURS;
}

function formatHoursDuration(hours) {
  const value = Number(hours) || 0;
  if (value >= 24 && value % 24 === 0) {
    const days = value / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${value} hour${value === 1 ? "" : "s"}`;
}

function guidedThreadAutoArchiveDuration(closeHours) {
  const hours = Number(closeHours) || 24;
  if (hours >= 168) return 10080;
  if (hours >= 72) return 4320;
  if (hours >= 24) return 1440;
  return 60;
}

function clearGuidedThreadCloseTimer(threadId) {
  const timer = guidedModelCloseTimers.get(threadId);
  if (timer) clearTimeout(timer);
  guidedModelCloseTimers.delete(threadId);
}

function scheduleGuidedThreadClose(session) {
  clearGuidedThreadCloseTimer(session.threadId);
  const closeMs = Math.max(1, Number(session.closeHours || GUIDED_THREAD_FREE_CLOSE_HOURS)) * 60 * 60 * 1000;
  const timer = setTimeout(async () => {
    try {
      const thread = await client.channels.fetch(session.threadId).catch(() => null);
      if (!thread?.setArchived) return;
      await thread.send("## Request Archived\nThis request was archived automatically after the support window ended.").catch(() => {});
      await thread.setArchived(true, "Guided model request auto-archive");
    } catch (err) {
      console.warn("Could not auto-archive guided model thread:", err.message || err);
    } finally {
      guidedModelSessions.delete(session.threadId);
      guidedModelCloseTimers.delete(session.threadId);
    }
  }, closeMs);
  guidedModelCloseTimers.set(session.threadId, timer);
}

function guidedModelReplaceButtons(threadId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`guided3d_replace:${threadId}:frente`)
        .setLabel("Front")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`guided3d_replace:${threadId}:direita`)
        .setLabel("Right")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`guided3d_replace:${threadId}:esquerda`)
        .setLabel("Left")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`guided3d_replace:${threadId}:costas`)
        .setLabel("Back")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function guidedModelSessionForThread(threadId) {
  return guidedModelSessions.get(threadId) || null;
}

function guidedModelCurrentStep(session) {
  return GUIDED_MODEL_VIEW_STEPS.find(step => step.view === session.awaitingView)
    || GUIDED_MODEL_VIEW_STEPS[session.stepIndex || 0]
    || GUIDED_MODEL_VIEW_STEPS[0];
}

function parseImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return null;

  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: "png" };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), type: "jpg" };
      }
      offset += 2 + length;
    }
  }

  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") {
    const chunk = buffer.slice(12, 16).toString("ascii");
    if (chunk === "VP8X" && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height, type: "webp" };
    }
  }

  return null;
}

function validateGuidedModelImage(buffer) {
  if (!buffer || buffer.length < 20 * 1024) {
    return { ok: false, level: "red", reason: "I could not identify the image clearly. Try a clearer photo." };
  }

  const dimensions = parseImageDimensions(buffer);
  if (!dimensions) {
    return { ok: false, level: "red", reason: "Send a PNG, JPG or WEBP image." };
  }

  if (dimensions.width < 384 || dimensions.height < 384) {
    return { ok: false, level: "yellow", reason: "The image is too small. Send a larger photo." };
  }

  if (dimensions.width / dimensions.height > 3 || dimensions.height / dimensions.width > 3) {
    return { ok: false, level: "yellow", reason: "The crop is too wide or too tall. Send a centered photo." };
  }

  return { ok: true, dimensions };
}

async function sendGuidedModelPhotoPrompt(channel, session) {
  const step = guidedModelCurrentStep(session);
  await channel.send(
    [
      `# 📸 ${step.label} Reference`,
      `## ${step.prompt}`,
      step.instruction,
      "",
      "## ✅ Quick Checklist",
      "> Keep the object centered, sharp and fully visible.",
      "> Do not crop hair, outlines, chains, logos, hearts or small details.",
      "> Keep lighting and camera distance similar to the other sides.",
      "> The final model follows these references, so wrong sides can create wrong geometry.",
      "",
      "**Upload one image attachment in this message.**",
    ].join("\n")
  );
}

function guidedModelCompleted(session) {
  return MULTIVIEW_VIEW_ORDER.every(view => session.viewPaths?.[view]);
}

async function sendGuidedModelSummary(channel, session, interactionLike) {
  const modelQuality = normalizeModelQuality(session.modelQuality || "medium");
  const qualityConfig = modelQualityConfig(modelQuality);
  const triangles = normalizeTriangleLimit(session.triangles);
  const quote = calculatePrice(interactionLike, {
    mode: "guided",
    texture: "standard",
    triangles,
    enhancement: session.enhancement || "none",
    modelQuality,
    advancedTexture: "none",
  });

  session.quoteAmount = quote.walletAmount;
  session.quoteSnapshot = quoteSnapshotFromQuote(quote, {
    mode: "guided",
    texture: "standard",
    triangles,
    enhancement: session.enhancement || "none",
    modelQuality,
    advancedTexture: "none",
  });
  const files = multiviewReviewAttachments(session.viewPaths);

  await channel.send({
    content:
      "# ✅ Final Review\n" +
      "**Your references are ready. Check every side before starting the AI generation.**\n\n" +
      "## 🎛️ Model Setup\n" +
      `**Type:** ${GUIDED_MODEL_TYPE_LABELS[session.objectType] || "Other"}\n` +
      `**Quality:** ${qualityConfig.label}\n` +
      `**Reference prep:** ${(IMAGE_ENHANCEMENTS[session.enhancement || "none"] || IMAGE_ENHANCEMENTS.none).label}\n` +
      `**Alpha-aware:** ${session.useAlpha ? "On" : "Off"}\n` +
      `**Roblox-safe target:** ${triangles} triangles\n` +
      modelPromptReviewLine(session.prompt) +
      `**Total:** ${formatTokenAmount(quote.walletAmount)}\n\n` +
      (session.prepWarnings?.length
        ? "## ⚠️ Prep Notes\n" + session.prepWarnings.map(item => `> ${item}`).join("\n") + "\n\n"
        : "") +
      "## 📦 Included\n" +
      `> ${AI_MODEL_INCLUDED_REFERENCE_ROUNDS} reference setup/review round included in this model price.\n` +
      `> Extra reference regeneration, when available, starts at ${formatWalletAmount(AI_MODEL_EXTRA_REFERENCE_REGEN_BRL)}.\n\n` +
      "## 🔒 Before Generating\n" +
      "> Check each side carefully.\n" +
      "> If one image is wrong, click **Change Photo**.\n" +
      "> If everything is correct, click **Create Final Model**.\n" +
      "> Cash refunds are not available after a correctly delivered digital service.\n\n" +
      "**No Service Credits are charged until the final model is delivered.**",
    files,
    components: [guidedModelConfirmButtons(session.threadId), guidedModelThreadControls(session.threadId)],
  });
}

async function prepareGuidedModelReferences(channel, session, interactionLike) {
  if (!guidedModelCompleted({ ...session, viewPaths: session.originalViewPaths || session.viewPaths })) {
    await channel.send("## References Missing\nSend all four photos before preparing the model review.");
    return false;
  }

  const triangles = normalizeTriangleLimit(session.triangles);
  const quote = calculatePrice(interactionLike, {
    mode: "guided",
    texture: "standard",
    triangles,
    enhancement: session.enhancement || "none",
    modelQuality: session.modelQuality || "medium",
    advancedTexture: "none",
  });
  const balance = walletAvailableBalance(session.userId, "multiview");

  if (balance < quote.walletAmount) {
    session.status = "awaiting_balance";
    session.updatedAt = Date.now();
    await channel.send({
      content:
        formatInsufficientBalanceMessage({
          service: "Guided 3D model",
          price: quote.walletAmount,
          balance,
          language: normalizeLanguage(session.language || "en"),
        }) +
        "\n\nAfter adding Service Credits, click the button below to prepare the references.",
      components: [guidedModelPrepareButtons(session.threadId), guidedModelThreadControls(session.threadId)],
    });
    return false;
  }

  session.status = "preparing";
  session.updatedAt = Date.now();
  session.originalViewPaths ||= { ...session.viewPaths };
  session.viewPaths = { ...session.originalViewPaths };
  session.prepWarnings = [];

  if (session.enhancement === "none") {
    session.status = "review";
    await sendGuidedModelSummary(channel, session, interactionLike);
    return true;
  }

  const progressMessage = await channel.send(
    "# Preparing References\n" +
    `**Mode:** ${(IMAGE_ENHANCEMENTS[session.enhancement] || IMAGE_ENHANCEMENTS.none).label}\n\n` +
    "I will prepare all four images now and attach the final versions for review before model generation."
  );

  for (const step of GUIDED_MODEL_VIEW_STEPS) {
    const view = step.view;
    const sourcePath = session.originalViewPaths[view];
    if (!sourcePath) continue;

    try {
      await progressMessage.edit(
        "# Preparing References\n" +
        `**Current side:** ${publicViewName(view)}\n` +
        `**Mode:** ${(IMAGE_ENHANCEMENTS[session.enhancement] || IMAGE_ENHANCEMENTS.none).label}`
      ).catch(() => {});

      if (session.enhancement === "economy") {
        const cleanedDir = path.join(session.tempDir, "guided_clean_refs");
        fs.mkdirSync(cleanedDir, { recursive: true });
        session.viewPaths[view] = await enhanceImageLocally({
          imagePath: sourcePath,
          outputPath: path.join(cleanedDir, `${view}_clean.png`),
        });
      } else if (session.enhancement === "ai") {
        const aiDir = path.join(session.tempDir, "guided_ai_refs");
        fs.mkdirSync(aiDir, { recursive: true });
        session.viewPaths[view] = await enhanceImageWithOpenAI({
          imagePath: sourcePath,
          outputPath: path.join(aiDir, `${view}_ai.png`),
          prompt: guidedAiEnhancementPrompt({
            objectType: session.objectType || "other",
            view,
          }),
        });
      }
    } catch (err) {
      console.warn(`Guided reference prep failed for ${view}:`, err.message || err);
      session.viewPaths[view] = sourcePath;
      session.prepWarnings.push(`${publicViewName(view)} used the original image because prep failed.`);
    }
  }

  await progressMessage.edit(
    "# References Prepared\n" +
    "The final reference images are attached below for review."
  ).catch(() => {});

  session.status = "review";
  session.updatedAt = Date.now();
  await sendGuidedModelSummary(channel, session, interactionLike);
  return true;
}

async function sendGuidedAdminReferencePreview(message, session, view, sourcePath) {
  if (!memberHasRole(message.member, ADMIN_ROLE)) return;
  if (!["economy", "ai"].includes(session.enhancement)) return;

  const modeLabel = (IMAGE_ENHANCEMENTS[session.enhancement] || IMAGE_ENHANCEMENTS.none).label;
  const previewMessage = await message.channel.send(
    `## Admin Preview: ${publicViewName(view)}\n` +
    `Preparing a test preview with **${modeLabel}**. This admin-only preview does not replace the final review flow.`
  );

  try {
    const previewDir = path.join(session.tempDir, "guided_admin_previews");
    fs.mkdirSync(previewDir, { recursive: true });
    let previewPath = sourcePath;

    if (session.enhancement === "economy") {
      previewPath = await enhanceImageLocally({
        imagePath: sourcePath,
        outputPath: path.join(previewDir, `${view}_admin_clean.png`),
      });
    } else if (session.enhancement === "ai") {
      previewPath = await enhanceImageWithOpenAI({
        imagePath: sourcePath,
        outputPath: path.join(previewDir, `${view}_admin_ai.png`),
        prompt: guidedAiEnhancementPrompt({
          objectType: session.objectType || "other",
          view,
        }),
      });
    }

    await previewMessage.edit({
      content:
        `## Admin Preview Ready: ${publicViewName(view)}\n` +
        "Use this only to inspect the image enhancement behavior. The customer review still happens after all four sides and balance check.",
      files: [new AttachmentBuilder(previewPath, { name: `${view}_admin_preview.png` })],
    }).catch(() => {});
  } catch (err) {
    console.warn(`Guided admin preview failed for ${view}:`, err.message || err);
    await previewMessage.edit(
      `## Admin Preview Failed: ${publicViewName(view)}\n` +
      `\`${String(err.message || err).slice(0, 600)}\``
    ).catch(() => {});
  }
}

async function handleGuidedModelPhotoMessage(message, session) {
  if (message.author.id !== session.userId) return true;
  if (session.status !== "collecting") return false;

  const attachment = message.attachments.find(item => String(item.contentType || "").startsWith("image/"))
    || message.attachments.first();

  if (!attachment) {
    await message.channel.send(
      "# ⚠️ Image Missing\n" +
      "I need this reference as an **image attachment** before continuing.\n\n" +
      "> Use Discord's upload button or drag the image into this thread, then send it here."
    );
    return true;
  }

  const view = session.awaitingView || guidedModelCurrentStep(session).view;
  const tempDir = session.tempDir;
  const inputDir = path.join(tempDir, "guided_inputs");
  fs.mkdirSync(inputDir, { recursive: true });

  const ext = path.extname(attachment.name || "") || ".png";
  const outputPath = path.join(inputDir, `${view}${ext}`);
  const res = await fetch(attachment.url);
  if (!res.ok) {
    await message.channel.send(
      "## Image Download Failed\n" +
      "I could not read that image. Please upload it again."
    );
    return true;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const validation = validateGuidedModelImage(buffer);
  if (!validation.ok) {
    await message.channel.send(
      `# ${validation.level === "yellow" ? "⚠️ Almost There" : "❌ Image Not Accepted"}\n` +
      `${validation.reason}\n\n` +
      "Please send a clearer image for this side so the final 3D model has a better chance of matching the reference."
    );
    return true;
  }

  fs.writeFileSync(outputPath, buffer);
  session.viewPaths ||= {};
  session.originalViewPaths ||= {};
  session.originalViewPaths[view] = outputPath;
  session.viewPaths[view] = outputPath;
  session.awaitingView = null;

  await sendGuidedAdminReferencePreview(message, session, view, outputPath);

  const currentIndex = GUIDED_MODEL_VIEW_STEPS.findIndex(step => step.view === view);
  session.stepIndex = Math.max(session.stepIndex || 0, currentIndex + 1);
  session.updatedAt = Date.now();

  await message.channel.send(
    `# ✅ ${publicViewName(view)} Accepted\n` +
    "Reference saved and locked in the correct order.\n\n" +
    "> I will show the final review after all four sides are uploaded."
  );

  if (guidedModelCompleted(session)) {
    const member = await message.guild.members.fetch(session.userId).catch(() => null);
    await prepareGuidedModelReferences(message.channel, session, { user: message.author, member, guild: message.guild });
    return true;
  }

  const nextStep = GUIDED_MODEL_VIEW_STEPS.find(step => !session.viewPaths[step.view]);
  session.awaitingView = nextStep.view;
  await sendGuidedModelPhotoPrompt(message.channel, session);
  return true;
}

async function sendModelDeliveryParts(sendPayload, { content, items }) {
  let firstMessage = null;
  const failures = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      const message = await sendPayload({
        content: index === 0
          ? content
          : `## Additional Model File\n**File:** ${item.name}\n**Size:** ${formatBytes(item.size)}`,
        files: [publicModelAttachment(item.file, item.name, item.maxBytes)],
      });
      if (!firstMessage) firstMessage = message;
    } catch (err) {
      failures.push(`${item.name} (${formatBytes(item.size)}): ${err.message || err}`);
      console.warn(`Could not deliver ${item.name}:`, err.message || err);
    }
  }

  if (!firstMessage) {
    throw new Error(`No generated model file could be delivered. ${failures.join(" | ")}`);
  }

  if (failures.length) {
    await sendPayload({
      content:
        "## Delivery Warning\n" +
        "At least one optional model file could not be attached, but the delivered file above is available.\n" +
        failures.map(item => `- ${item}`).join("\n"),
      files: [],
    }).catch(() => {});
  }

  return firstMessage;
}

async function deliverModelPrivatelyOrFallback(interaction, { content, modelPath, modelPaths }) {
  const maxBytes = discordAttachmentLimitBytes(interaction);
  console.log(
    `Discord model delivery limit: ${formatBytes(maxBytes)} ` +
    `(interaction=${formatBytes(Number(interaction?.attachmentSizeLimit) || 0)}, fallback=${formatBytes(DISCORD_MAX_ATTACHMENT_BYTES)})`
  );
  const items = publicModelDeliveryItems(modelPaths?.length ? modelPaths : [modelPath], maxBytes)
    .map(item => ({ ...item, maxBytes }));

  if (MODEL_DELIVERY_MODE !== "dm") {
    const channelMessage = await sendModelDeliveryParts(
      payload => interaction.followUp(payload),
      { content, items }
    );
    return { deliveredInDm: false, message: channelMessage };
  }

  try {
    const dmMessage = await sendModelDeliveryParts(
      payload => interaction.user.send(payload),
      { content, items }
    );
    return { deliveredInDm: true, message: dmMessage };
  } catch (err) {
    console.warn(`Could not deliver model by DM to ${interaction.user.id}:`, err.message);
  }

  const channelMessage = await sendModelDeliveryParts(
    payload => interaction.followUp(payload),
    {
      content:
        content +
        "\n\n**Note:** I could not DM you, so I delivered the model here. Enable DMs for private delivery next time.",
      items,
    }
  );
  return { deliveredInDm: false, message: channelMessage };
}

async function startPendingMultiviewGeneration(interaction, actionId, action, { updateMode = "review" } = {}) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  const actionType = action.actionType || "multiview";
  const priceMode = action.priceMode || "multiview";
  const serviceKey = action.serviceKey || "multiview";
  const serviceLabel = action.serviceLabel || "Multiview AI model";
  const generationMode = action.generationMode || "multiview";
  const lang = normalizeLanguage(action.language || languageFor(interaction));
  action.language = lang;
  action.prompt = normalizeModelGenerationPrompt(action.prompt);
  action.texture = normalizeTextureOption(action.texture || "standard");
  const generationImagePaths = Array.isArray(action.imagePaths) && action.imagePaths.length
    ? action.imagePaths
    : MULTIVIEW_UPLOAD_ORDER.map(view => action.viewPaths?.[view]).filter(Boolean);

  if (!modelGenerationIsConfigured()) {
    const content = lang === "pt-BR"
      ? "A geração real de modelo ainda não está configurada. Chame o suporte."
      : lang === "es"
        ? "La generación real de modelo todavía no está configurada. Contacta al soporte."
        : "Real model generation is not configured yet. Contact support.";
    await interaction.followUp({ content, flags: 64 }).catch(() => {});
    return;
  }

  const advancedTextureCfg = advancedTextureConfig(action.advancedTexture);
  const quoteSettings = {
    mode: priceMode,
    texture: action.texture,
    triangles: action.triangles,
    enhancement: action.enhancement,
    modelQuality: action.modelQuality,
    advancedTexture: action.advancedTexture,
  };
  const calculatedQuote = calculatePrice(interaction, quoteSettings);
  const quote = quoteSnapshotMatches(action.quoteSnapshot, quoteSettings)
    ? quoteWithSnapshot(calculatedQuote, action.quoteSnapshot)
    : calculatedQuote;
  action.quoteSnapshot = quoteSnapshotFromQuote(quote, quoteSettings);

  const balanceBefore = walletAvailableBalance(interaction.user.id, serviceKey);
  if (balanceBefore < quote.walletAmount) {
    const content = formatInsufficientBalanceMessage({
      service: serviceLabel,
      price: quote.walletAmount,
      balance: balanceBefore,
      language: lang,
    });
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: 64 }).catch(() => {});
    } else {
      await interaction.reply({ content, flags: 64 }).catch(async () => {
        await interaction.followUp({ content, flags: 64 }).catch(() => {});
      });
    }
    return;
  }

  action.used = true;
  action.inFlight = true;
  action.startedAt = Date.now();
  action.channelId = action.channelId || interaction.channelId;
  action.userId = action.userId || interaction.user.id;
  action.status = "generating";
  action.chargeStatus = "not_charged";
  action.deliveryStatus = "not_delivered";
  action.generationStartedAt = new Date().toISOString();
  action.providerTask = readPendingProviderTask(action);
  action.waitingTextureDecision = false;
  setPendingMultiviewAction(actionId, action);
  console.log(
    `[${actionType}] generation start action=${actionId} user=${interaction.user.id} ` +
    `texture=${action.texture} triangles=${action.triangles || "auto"} advanced_texture=${action.advancedTexture || "none"}`
  );

  if (updateMode === "offer") {
    await interaction.editReply({
      content: lang === "pt-BR"
        ? "## Geração iniciada\nVou entregar o modelo final aqui quando estiver pronto."
        : lang === "es"
          ? "## Generación iniciada\nEntregaré el modelo final aquí cuando esté listo."
          : "## Generation Started\nI will deliver the final model here when it is ready.",
      components: [],
    });
  } else {
    await interaction.editReply({ components: [disableMultiviewReviewButtons(actionId, true)] });
    await interaction.followUp({
      content: lang === "pt-BR"
        ? "## Geração iniciada\nVou entregar o modelo final aqui quando estiver pronto."
        : lang === "es"
          ? "## Generación iniciada\nEntregaré el modelo final aquí cuando esté listo."
          : "## Generation Started\nI will deliver the final model here when it is ready.",
      flags: 64,
    });
  }

  let progressMessage = null;
  let model = null;

  try {
    const onProgress = async ({ status, progress }) => {
      const content = formatGenerationProgress({ status, progress, language: lang });
      if (progressMessage) {
        await progressMessage.edit(content).catch(async () => {
          progressMessage = await interaction.followUp({ content, flags: 64 }).catch(() => null);
        });
      } else {
        progressMessage = await interaction.followUp({ content, flags: 64 }).catch(() => null);
      }
    };

    if (shouldUseHyper3d()) {
      model = await generateWithOfficialHyper3d({
        imagePaths: generationImagePaths,
        prompt: action.prompt || "",
        texture: action.texture,
        triangles: action.triangles,
        tempDir: action.tempDir,
        textureTone: action.textureTone,
        textureAdjustments: action.textureAdjustments,
        onProgress,
        mode: generationMode,
        useAlpha: action.useAlpha,
        modelQuality: action.modelQuality,
        advancedTexture: action.advancedTexture,
        textureSourceImagePath: advancedTextureCfg.resolution ? action.viewPaths[action.textureSource] : null,
      });
    } else if (shouldUseTripo() && generationMode === "multiview") {
      model = await generateMultiviewWithOfficialTripo({
        viewPaths: action.viewPaths,
        texture: action.texture,
        triangles: action.triangles,
        tempDir: action.tempDir,
        textureTone: action.textureTone,
        textureAdjustments: action.textureAdjustments,
        onProgress,
      });
    } else if (shouldUseTripo()) {
      model = await generateModelWithOfficialTripo({
        imagePaths: generationImagePaths,
        texture: action.texture,
        triangles: action.triangles,
        tempDir: action.tempDir,
        preferredView: null,
        textureTone: action.textureTone,
        textureAdjustments: action.textureAdjustments,
        onProgress,
      });
    } else {
      throw new Error(`Model provider is not configured: ${activeModelEngineLabel()}`);
    }
  } catch (err) {
    console.error(err);
    action.used = false;
    action.inFlight = false;
    action.status = "generation_failed";
    action.chargeStatus = "not_charged";
    action.deliveryStatus = "not_delivered";
    action.providerTask = readPendingProviderTask(action) || action.providerTask || null;
    action.lastError = String(err.message || err).slice(0, 500);
    setPendingMultiviewAction(actionId, action);
    await interaction.followUp({
      content: lang === "pt-BR"
        ? "## Falha na geração do modelo\nNenhum Service Credit foi descontado porque nenhum modelo final foi entregue."
        : lang === "es"
          ? "## Error en la generación del modelo\nNo se descontaron Service Credits porque no se entregó ningún modelo final."
          : "## Model Generation Failed\nNo charge was deducted because no final model was delivered.",
      flags: 64,
    });

    if (userIsAdmin(interaction)) {
      await interaction.followUp({
        content:
          "## Admin diagnostic\n" +
          `\`\`\`\n${String(err.message || err).slice(0, 1500)}\n\`\`\``,
        flags: 64,
      }).catch(() => {});
    }
    return;
  }

  action.status = "generated";
  action.generatedAt = new Date().toISOString();
  action.provider = model.provider || null;
  action.providerTask = {
    provider: model.provider || "unknown",
    taskId: model.taskId || model.baseTaskId || null,
    subscriptionKey: model.subscriptionKey || model.baseSubscriptionKey || null,
    consumedCredit: model.consumedCredit || null,
  };
  action.modelFiles = (model.modelPaths?.length ? model.modelPaths : [model.modelPath])
    .filter(Boolean)
    .map(file => ({
      name: path.basename(file),
      size: fs.existsSync(file) ? fs.statSync(file).size : null,
    }));
  setPendingMultiviewAction(actionId, action);

  const balanceBeforeDelivery = walletAvailableBalance(interaction.user.id, serviceKey);
  if (balanceBeforeDelivery < quote.walletAmount) {
    action.used = false;
    action.inFlight = false;
    action.status = "insufficient_balance_before_delivery";
    action.chargeStatus = "not_charged";
    action.deliveryStatus = "not_delivered";
    action.lastError = "User balance changed before delivery.";
    setPendingMultiviewAction(actionId, action);
    await interaction.followUp({
      content: formatInsufficientBalanceMessage({
        service: serviceLabel,
        price: quote.walletAmount,
        balance: balanceBeforeDelivery,
        language: lang,
      }),
      flags: 64,
    });
    return;
  }

  let delivery;
  try {
    delivery = await deliverModelPrivatelyOrFallback(interaction, {
      content: lang === "pt-BR"
        ? "## Modelo final gerado\n" +
          `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
          "**Saldo restante:** atualizando..."
        : lang === "es"
          ? "## Modelo final generado\n" +
            `**Precio:** ${formatTokenAmount(quote.walletAmount)}\n` +
            "**Saldo restante:** actualizando..."
          : "## Final Model Generated\n" +
            `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
            "**Remaining balance:** updating...",
      modelPath: model.modelPath,
      modelPaths: model.modelPaths,
    });
  } catch (err) {
    console.error(err);
    action.used = false;
    action.inFlight = false;
    action.status = "delivery_failed";
    action.chargeStatus = "not_charged";
    action.deliveryStatus = "not_delivered";
    action.providerTask = action.providerTask || readPendingProviderTask(action);
    action.lastError = String(err.message || err).slice(0, 500);
    setPendingMultiviewAction(actionId, action);
    const modelFiles = (model?.modelPaths?.length ? model.modelPaths : [model?.modelPath])
      .filter(Boolean)
      .filter(file => fs.existsSync(file))
      .map(file => `${path.basename(file)}=${formatBytes(fs.statSync(file).size)}`)
      .join(", ");
    await interaction.followUp({
      content: lang === "pt-BR"
        ? "## Falha ao entregar o modelo\nNenhum Service Credit foi descontado porque o modelo final não pôde ser entregue."
        : lang === "es"
          ? "## Error al entregar el modelo\nNo se descontaron Service Credits porque el modelo final no pudo ser entregado."
          : "## Model Delivery Failed\nNo charge was deducted because the final model could not be delivered.",
      flags: 64,
    });
    if (userIsAdmin(interaction)) {
      await interaction.followUp({
        content:
          "## Admin delivery diagnostic\n" +
          `**Files:** ${modelFiles || "none"}\n` +
          `**Error:** \`${String(err.message || err).slice(0, 1200)}\``,
        flags: 64,
      }).catch(() => {});
    }
    return;
  }

  action.status = "delivered_pending_charge";
  action.deliveryStatus = "delivered";
  action.deliveredAt = new Date().toISOString();
  action.delivery = {
    deliveredInDm: Boolean(delivery.deliveredInDm),
    messageId: delivery.message?.id || null,
    channelId: delivery.message?.channelId || delivery.message?.channel_id || null,
  };
  setPendingMultiviewAction(actionId, action);

  const debit = removeWalletBalance({
    userId: interaction.user.id,
    amount: quote.walletAmount,
    actorId: client.user.id,
    reason: `${serviceLabel} generated`,
    meta: { command: `${actionType}_button`, actionId, serviceKey, priceBrl: quote.price },
  });

  if (!debit.ok) {
    action.used = true;
    action.inFlight = false;
    action.status = "delivered_charge_failed";
    action.chargeStatus = "not_charged";
    action.chargeFailedAt = new Date().toISOString();
    action.lastError = `Delivery succeeded but Service Credits could not be deducted. Current balance: ${walletBalance(interaction.user.id)}`;
    setPendingMultiviewAction(actionId, action);

    await interaction.followUp({
      content:
        "## Charge Review Needed\n" +
        "The model was delivered, but the bot could not deduct Service Credits automatically.\n" +
        "The team has been notified to review this order manually.",
      flags: 64,
    }).catch(() => {});

    if (userIsAdmin(interaction)) {
      await interaction.followUp({
        content:
          "## Admin billing diagnostic\n" +
          `**Action ID:** \`${actionId}\`\n` +
          `**Expected charge:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Current balance:** ${formatTokenAmount(walletBalance(interaction.user.id))}\n` +
          "**Status:** delivered_charge_failed",
        flags: 64,
      }).catch(() => {});
    }
    return;
  }

  action.status = "charged";
  action.chargeStatus = "charged";
  action.chargedAt = new Date().toISOString();
  action.chargedAmount = quote.walletAmount;
  action.balanceAfterCharge = debit.balance;
  setPendingMultiviewAction(actionId, action);

  if (debit.ok && debit.paidWithWallet > 0) {
    creditAffiliateServiceCommission({
      buyerId: interaction.user.id,
      walletAmount: debit.paidWithWallet,
      priceBrl: debit.paidWithWallet / WALLET_TOKENS_PER_BRL,
      source: serviceKey === "image_model" ? "remake_image_model" : "remake_multiview",
      actorId: client.user.id,
      meta: { mode: actionType },
    });
  }

  await delivery.message.edit({
    content: lang === "pt-BR"
      ? "## Modelo final gerado\n" +
        `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
        `**Saldo restante:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}`
      : lang === "es"
        ? "## Modelo final generado\n" +
          `**Precio:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Saldo restante:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}`
        : "## Final Model Generated\n" +
          `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}`,
  }).catch(() => {});

  await interaction.followUp({
    content: delivery.deliveredInDm
      ? (lang === "pt-BR"
        ? "## Entregue no privado\nSeu modelo final foi enviado na sua DM."
        : lang === "es"
          ? "## Entregado por privado\nTu modelo final fue enviado a tus DMs."
          : "## Delivered Privately\nYour final model was sent to your DMs.")
      : (lang === "pt-BR"
        ? "## Entregue\nSeu modelo final foi entregue neste canal porque sua DM está fechada."
        : lang === "es"
          ? "## Entregado\nTu modelo final fue entregado en este canal porque tus DMs están cerrados."
          : "## Delivered\nYour final model was delivered in this channel because your DMs are closed."),
    flags: 64,
  }).catch(() => {});

  if (action.guidedThreadId) {
    const session = guidedModelSessionForThread(action.guidedThreadId);
    if (session) {
      session.status = "delivered";
      session.updatedAt = Date.now();
      await interaction.channel?.send({
        content: lang === "pt-BR"
          ? "# Pedido concluído\n" +
            "Seu modelo final foi entregue.\n\n" +
            "> Precisa de suporte? Mantenha este tópico aberto e fale com a equipe aqui.\n" +
            "> Tudo certo? Clique em **Close request** para arquivar este tópico."
          : lang === "es"
            ? "# Pedido completado\n" +
              "Tu modelo final fue entregado.\n\n" +
              "> Necesitas soporte? Mantén este hilo abierto y habla con el equipo aquí.\n" +
              "> Todo listo? Haz clic en **Close request** para archivar este hilo."
            : "# Request Complete\n" +
              "Your final model has been delivered.\n\n" +
              "> Need support? Keep this thread open and message the team here.\n" +
              "> All done? Click **Close request** to archive this thread.",
        components: [guidedModelThreadControls(action.guidedThreadId)],
      }).catch(() => {});
    }
  }

  console.log(`[${actionType}] generation delivered action=${actionId} user=${interaction.user.id}`);
  action.inFlight = false;
  deletePendingMultiviewAction(actionId);
}

function publicViewName(view) {
  return {
    frente: "Front",
    direita: "Right",
    costas: "Back",
    esquerda: "Left",
    isometrica: "Isometric",
  }[view] || view;
}

function publicViewFileLabel(view, file) {
  const ext = path.extname(file) || ".png";
  const cleanSuffix = path.basename(file).toLowerCase().includes("_clean") ? "_clean" : "";
  return `${publicViewName(view).toLowerCase()}${cleanSuffix}${ext}`;
}

function ugcViewAttachments(renderDir) {
  const views = [
    ["frente", "front"],
    ["direita", "right"],
    ["costas", "back"],
    ["esquerda", "left"],
  ];

  return views
    .map(([fileName, publicName], index) => {
      const file = path.join(renderDir, `${fileName}.png`);
      if (!fs.existsSync(file)) return null;
      const label = String(index + 1).padStart(2, "0");
      return new AttachmentBuilder(file, { name: `${label}-${publicName}.png` });
    })
    .filter(Boolean);
}

function aiFiveViewAttachments(renderDir) {
  const views = [
    ["frente", "front"],
    ["direita", "right"],
    ["costas", "back"],
    ["esquerda", "left"],
    ["up", "up"],
  ];

  return views
    .map(([fileName, publicName], index) => {
      const file = path.join(renderDir, `${fileName}.png`);
      if (!fs.existsSync(file)) return null;
      const label = String(index + 1).padStart(2, "0");
      return new AttachmentBuilder(file, { name: `${label}-${publicName}.png` });
    })
    .filter(Boolean);
}

function fullUgcViewAttachments(renderDir) {
  const views = [
    ["front_left", "front-left"],
    ["frente", "front"],
    ["front_right", "front-right"],
    ["esquerda", "left"],
    ["up", "up"],
    ["direita", "right"],
    ["back_left", "back-left"],
    ["costas", "back"],
    ["back_right", "back-right"],
    ["down", "down"],
  ];

  return views
    .map(([fileName, publicName], index) => {
      const file = path.join(renderDir, `${fileName}.png`);
      if (!fs.existsSync(file)) return null;
      const label = String(index + 1).padStart(2, "0");
      return new AttachmentBuilder(file, { name: `${label}-${publicName}.png` });
    })
    .filter(Boolean);
}

function parseBulkIds(raw) {
  return [...new Set(String(raw || "")
    .split(/[\s,;]+/)
    .map(id => id.trim())
    .filter(id => /^\d+$/.test(id)))]
    .slice(0, BULK_ASSET_LIMIT);
}

function parseBulkClothingIds(raw) {
  return [...new Set(String(raw || "")
    .match(/\d{3,}/g) || [])]
    .slice(0, BULK_CLOTHING_LIMIT);
}

function formatCommandsHelp(interaction) {
  const lines = [
    "## ✨ Velvet UGC",
    "**Comandos disponíveis:**",
    "",
    "⚙️ `/settings` - language and currency",
    "💎 `/velvet_saldo` - mostra seu saldo",
    "💎 `/balance` - shows your balance",
    "🛒 `/velvet_comprar` - cria um pedido de compra",
    "🛒 `/buy` - creates a purchase request",
    "⭐ `/subscribe` - creates a Basic/Premium subscription link",
    "🤝 `/affiliate` - shows your affiliate link and commission",
    "🔗 `/affiliate_apply` - applies an affiliate code",
    "💎 `/affiliate_redeem` - turns commission into Service Credits",
    "🧾 `/refazer_preco` - calcula o valor do modelo",
    "📎 `/copiar` - envia o modelo original e textura",
    "📎 `/steal` - copies original asset files",
    "👕 `/steal` - auto-detects UGC assets or classic clothing templates",
    "👚 `/bulk_steal_clothing` - copies clothing templates in bulk",
    "📦 `/bulk_steal` - copies original assets in bulk",
    "🧾 `/bulk_remake` - premium quote/request for up to 10 remakes",
    "🎨 `/refazer` - refaz um UGC por ID",
    "🖼️ `/refazer_multiview` - usa frente, direita, costas e esquerda",
  ];

  if (userIsAdmin(interaction)) {
    lines.push(
      "",
      "### 🔐 Admin",
      "🧪 `/refazer_mock` - testa sem gastar geração real",
      "📦 `/modelo_ultimo` - envia o último modelo finalizado",
      "🛠️ `/refazer_debug` - mostra dados internos",
      "➕ `/velvet_admin_add` - adiciona saldo",
      "➖ `/velvet_admin_remover` - remove saldo",
      "🧾 `/velvet_admin_compras` - lista compras pendentes",
      "✅ `/velvet_admin_compra` - aprova ou rejeita compra",
      "🛒 `/admin_buy` - creates a discounted checkout"
    );
  }

  return lines.join("\n");
}

formatCommandsHelp = function formatCommandsHelpClean(interaction) {
  const lines = [
    "# ✨ Velvet UGC Commands",
    "",
    "Choose a service below.",
    "Payments use **Service Credits** for Velvet digital services only.",
    "",
    "## 💎 Account & Payments",
    "`/balance` - View your Service Credits",
    "`/buy` - Purchase a service credit package",
    "`/subscribe` - Subscribe to Basic, Premium, Elite or Lifetime plans",
    "`/settings` - Choose your payment currency and preferences",
    "`/gift_create` - Create a restricted gift code for one user",
    "`/gift_redeem` - Redeem a gift code sent to you",
    "`/gift_history` - View your recent Service Credits history",
    "",
    "## 📦 Copy Services",
    "`/steal` - Copy UGC asset files or classic clothing templates automatically",
    "`/bulk_steal_clothing` - Copy multiple clothing templates in bulk",
    "",
    "## 🎨 Model Services",
    "`/generate3d` - Guided 3D model request with private thread and review buttons",
    "`/price` - Preview the price before ordering",
    "`/remake` - Remake a UGC from an item ID",
    "`/image_model` - Generate a model from one reference image",
    "`/multiview` - Remake from front, right, back and left images",
    "`/enhance_images` - Clean reference images before multiview",
  ];

  if (userHasPremiumAccess(interaction) || userIsAdmin(interaction)) {
    lines.push(
      "",
      "## ⭐ Premium / Elite Tools",
      "`/bulk_steal` - Copy multiple UGC assets in bulk",
      "`/bulk_remake` - Request up to 10 remakes at once"
    );
  }

  lines.push(
    "",
    "## 🎯 Market Tools",
    "`/sniper` - Limited market radar for high-potential items",
    "",
    "## 🤝 Affiliate",
    "`/affiliate` - View your affiliate dashboard",
    "`/affiliate_register` - Register your Discord invite",
    "`/affiliate_apply` - Apply an affiliate code or invite",
    "`/affiliate_redeem` - Convert commission into Service Credits"
  );

  return lines.join("\n");
};

formatCommandsHelp = function formatCommandsHelpPolished(interaction) {
  if (languageFor(interaction) === "pt-BR") {
    const lines = [
      "# ✨ Comandos Velvet UGC",
      "",
      "**Comandos simples para assets Roblox, modelos 3D com IA e serviços Velvet.**",
      "Pagamentos usam **Service Credits** apenas para serviços digitais da Velvet.",
      "",
      "## 🚀 Comece Aqui",
      "`/generate3d` - criar modelo 3D guiado com revisão por botões",
      "`/views` - renderizar referências front/right/back/left de um UGC",
      "`/steal` - copiar assets suportados ou templates clássicos",
      "",
      "## 💎 Conta",
      "`/balance` - ver seus Service Credits",
      "`/history` - ver pedidos e movimentações recentes",
      "`/order_status` - consultar um pedido ou geração 3D",
      "`/buy` - comprar Service Credits",
      "`/subscribe` - ver planos Basic, Premium, Elite e Lifetime",
      "`/settings` - idioma, moeda e padrões de render",
      "",
      "## 🎨 IA & Referências",
      "`/generate_image` - criar imagem de referência por prompt",
      "`/price` - prever preço antes de pedir",
      "",
      "## 📦 Bulk",
      "`/bulk_steal_clothing` - copiar vários templates clássicos",
    ];

    if (userHasPremiumAccess(interaction) || userIsAdmin(interaction)) {
      lines.push("", "## ⭐ Premium / Elite", "`/bulk_steal` - copiar múltiplos assets UGC em lote");
    }

    lines.push(
      "",
      "## 🤝 Afiliados & Gifts",
      "`/affiliate` - ver seu painel de afiliado",
      "`/gift_create` - criar gift code restrito",
      "`/gift_redeem` - resgatar gift code",
      "`/gift_history` - ver histórico de gifts"
    );

    if (userIsAdmin(interaction)) {
      lines.push(
        "",
        "## 🛡️ Admin",
        "`/sniper` - radar de mercado UGC",
        "`/limited_sniper` - radar de limiteds/collectibles",
        "`/model_views` - renderizar previews de um modelo enviado",
        "`/admin_status` - checar APIs, filas e sinais de risco",
        "`/admin_buy` - criar checkout com desconto",
        "`/admin_post_info` - postar mensagens oficiais"
      );
    }

    lines.push("", "## ✅ Fluxo Recomendado", "`/views` → `/generate3d` → revisar referências → criar modelo final");
    return lines.join("\n");
  }

  if (languageFor(interaction) === "es") {
    const lines = [
      "# ✨ Comandos Velvet UGC",
      "",
      "**Comandos simples para assets de Roblox, modelos 3D con IA y servicios Velvet.**",
      "Los pagos usan **Service Credits** solo para servicios digitales de Velvet.",
      "",
      "## 🚀 Empieza Aquí",
      "`/generate3d` - crear modelo 3D guiado con revisión por botones",
      "`/views` - renderizar referencias front/right/back/left desde un UGC",
      "`/steal` - copiar assets soportados o templates clásicos",
      "",
      "## 💎 Cuenta",
      "`/balance` - ver tus Service Credits",
      "`/history` - ver pedidos y actividad reciente",
      "`/order_status` - consultar un pedido o generación 3D",
      "`/buy` - comprar Service Credits",
      "`/subscribe` - ver planes Basic, Premium, Elite y Lifetime",
      "`/settings` - idioma, moneda y ajustes de render",
      "",
      "## 🎨 IA & Referencias",
      "`/generate_image` - crear una imagen de referencia con prompt",
      "`/price` - revisar precio antes de pedir",
      "",
      "## 📦 Bulk",
      "`/bulk_steal_clothing` - copiar varios templates clásicos",
    ];

    if (userHasPremiumAccess(interaction) || userIsAdmin(interaction)) {
      lines.push("", "## ⭐ Premium / Elite", "`/bulk_steal` - copiar múltiples assets UGC en lote");
    }

    lines.push(
      "",
      "## 🤝 Afiliados & Gifts",
      "`/affiliate` - ver tu panel de afiliado",
      "`/gift_create` - crear un gift code restringido",
      "`/gift_redeem` - canjear un gift code",
      "`/gift_history` - ver historial de gifts"
    );

    if (userIsAdmin(interaction)) {
      lines.push(
        "",
        "## 🛡️ Admin",
        "`/sniper` - radar de mercado UGC",
        "`/limited_sniper` - radar de limiteds/collectibles",
        "`/model_views` - renderizar previews desde un modelo subido",
        "`/admin_status` - revisar APIs, colas y señales de riesgo",
        "`/admin_buy` - crear checkout con descuento",
        "`/admin_post_info` - publicar mensajes oficiales"
      );
    }

    lines.push("", "## ✅ Flujo Recomendado", "`/views` → `/generate3d` → revisar referencias → crear modelo final");
    return lines.join("\n");
  }

  const lines = [
    "# ✨ Velvet UGC Commands",
    "",
    "**Simple commands for Roblox-ready assets, AI models and Velvet services.**",
    "Payments use **Service Credits** for Velvet digital services only.",
    "",
    "## 🚀 Best Starting Point",
    "`/generate3d` - guided 3D model creation with review buttons",
    "`/views` - render clean front/right/back/left references from a UGC ID",
    "`/steal` - copy supported asset files or classic clothing templates",
    "",
    "## 💎 Account",
    "`/balance` - view your Service Credits",
    "`/history` - view recent orders and credit activity",
    "`/order_status` - check a specific order or model request",
    "`/buy` - buy Service Credits",
    "`/subscribe` - view Basic, Premium, Elite and Lifetime plans",
    "`/settings` - language, currency and render defaults",
    "",
    "## 🎨 AI & References",
    "`/generate_image` - create a reference image from a prompt",
    "`/price` - preview model pricing before ordering",
    "",
    "## 📦 Bulk Tools",
    "`/bulk_steal_clothing` - copy multiple classic clothing templates",
  ];

  if (userHasPremiumAccess(interaction) || userIsAdmin(interaction)) {
    lines.push(
      "",
      "## ⭐ Premium / Elite",
      "`/bulk_steal` - copy multiple UGC assets in bulk"
    );
  }

  lines.push(
    "",
    "## 🤝 Affiliate & Gifts",
    "`/affiliate` - view your affiliate dashboard",
    "`/affiliate_register` - register your Discord invite",
    "`/affiliate_apply` - apply an affiliate code or invite",
    "`/affiliate_redeem` - convert commission into Service Credits",
    "`/gift_create` - create a restricted gift code",
    "`/gift_redeem` - redeem a gift code",
    "`/gift_history` - view your gift history"
  );

  if (userIsAdmin(interaction)) {
    lines.push(
      "",
      "## 🛡️ Admin",
      "`/sniper` - market radar for high-potential UGCs",
      "`/limited_sniper` - limited / collectible market radar",
      "`/model_views` - render preview images from an uploaded model",
      "`/admin_buy` - create a discounted checkout",
      "`/admin_add` - add Service Credits",
      "`/admin_remove` - remove Service Credits",
      "`/admin_credit_history` - review balance history",
      "`/admin_status` - check APIs, queues and risk signals",
      "`/admin_post_info` - post polished official channel messages"
    );
  }

  lines.push(
    "",
    "## ✅ Recommended Flow",
    "`/views` → `/generate3d` → review references → create final model"
  );

  return lines.join("\n");
};

function parseWebhookBody(req) {
  return new Promise(resolve => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        resolve({ raw: body, json: body ? JSON.parse(body) : {} });
      } catch {
        resolve({ raw: body, json: {} });
      }
    });
  });
}

async function processMercadoPagoWebhook(url, body) {
  const type = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const id = body.data?.id || body.id || url.searchParams.get("data.id") || url.searchParams.get("id");

  if (!id) {
    console.warn("Webhook Mercado Pago sem ID:", body);
    return;
  }

  if (type === "payment") {
    await handleMercadoPagoPayment(id);
    return;
  }

  if (["subscription_preapproval", "preapproval"].includes(type)) {
    await handleMercadoPagoSubscription(id);
    return;
  }

  console.log(`Webhook Mercado Pago ignorado. type=${type} id=${id}`);
}

function parseMercadoPagoSignature(header) {
  return Object.fromEntries(
    String(header || "")
      .split(",")
      .map(part => part.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyMercadoPagoWebhook(req, url, body) {
  if (!MERCADO_PAGO_WEBHOOK_SECRET) return true;

  const signature = parseMercadoPagoSignature(req.headers["x-signature"]);
  const requestId = req.headers["x-request-id"];
  const dataId = body.data?.id || body.id || url.searchParams.get("data.id") || url.searchParams.get("id");

  if (!signature.ts || !signature.v1 || !requestId || !dataId) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${signature.ts};`;
  const expected = crypto
    .createHmac("sha256", MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  return safeEqualHex(expected, signature.v1);
}

function startWebhookServer() {
  if (!STRIPE_SECRET_KEY && !MERCADO_PAGO_ACCESS_TOKEN) {
    console.log("Webhook server nao iniciado: Stripe e Mercado Pago ausentes.");
    return;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (req.method !== "POST" || !["/mercadopago/webhook", "/stripe/webhook"].includes(url.pathname)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }

    const body = await parseWebhookBody(req);

    if (url.pathname === "/stripe/webhook") {
      try {
        const event = verifyStripeWebhook(body.raw, req.headers["stripe-signature"]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        processStripeWebhook(event).catch(err => {
          console.error("Erro no webhook Stripe:", err);
        });
      } catch (err) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        console.warn("Webhook Stripe recusado:", err.message);
      }
      return;
    }

    if (!verifyMercadoPagoWebhook(req, url, body.json)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      console.warn("Webhook Mercado Pago recusado: assinatura invalida.");
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));

    processMercadoPagoWebhook(url, body.json).catch(err => {
      console.error("Erro no webhook Mercado Pago:", err);
    });
  });

  server.listen(WEBHOOK_PORT, WEBHOOK_HOST, () => {
    console.log(`Webhook server online em http://${WEBHOOK_HOST}:${WEBHOOK_PORT}/health`);
    if (STRIPE_SECRET_KEY) {
      console.log(`Webhook Stripe online em http://${WEBHOOK_HOST}:${WEBHOOK_PORT}/stripe/webhook`);
    }
    if (MERCADO_PAGO_ACCESS_TOKEN) {
      console.log(`Webhook Mercado Pago online em http://${WEBHOOK_HOST}:${WEBHOOK_PORT}/mercadopago/webhook`);
    }
  });
}

client.once("clientReady", async () => {
  console.log(`Bot laboratorio online como ${client.user.tag}`);
  console.log(`Model engine active: ${activeModelEngineLabel()}`);
  console.log(`Multiview upload order: ${MULTIVIEW_UPLOAD_ORDER.map(publicViewName).join(", ")}`);
  loadPendingMultiviewActions();
  await recoverInterruptedPendingGenerations();
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (guild) await refreshInviteCache(guild);
  scheduleSniperHistoryWorker(SNIPER_HISTORY_START_DELAY_MS);
  startWebhookServer();
  expirePendingPurchases();
  expirePrepaidSubscriptions().catch(err => console.warn("Erro ao expirar assinaturas Pix:", err.message));
  setInterval(() => {
    expirePendingPurchases();
  }, 5 * 60 * 1000);
  setInterval(() => {
    expirePrepaidSubscriptions().catch(err => console.warn("Erro ao expirar assinaturas Pix:", err.message));
  }, 60 * 60 * 1000);
});

client.on("guildMemberAdd", async member => {
  if (member.guild.id !== GUILD_ID) return;

  const usedInvite = await detectUsedInvite(member.guild);
  if (!usedInvite) return;

  const ownerId = applyAffiliateInviteReferral(member.id, usedInvite.code);
  if (ownerId) {
    console.log(`Afiliado aplicado por invite: user=${member.id} affiliate=${ownerId} invite=${usedInvite.code}`);
  }
});

client.on("messageCreate", async message => {
  if (!message.guild || message.author?.bot) return;

  const guidedSession = guidedModelSessionForThread(message.channelId);
  if (guidedSession) {
    try {
      const handled = await handleGuidedModelPhotoMessage(message, guidedSession);
      if (handled) return;
    } catch (err) {
      console.error("Guided model photo handling failed:", err);
      await message.channel.send("Something went wrong with that photo. Send it again.").catch(() => {});
      return;
    }
  }

  if (!CLEAN_CHANNEL_IDS.has(message.channelId)) return;

  await message.delete().catch(err => {
    if (err?.code !== 10008) {
      console.warn(`Could not delete user message in clean channel ${message.channelId}:`, err.message || err);
    }
  });
});

client.on("interactionCreate", async interaction => {
  if (interaction.isButton()) {
    const [kind, actionId, extra] = String(interaction.customId || "").split(":");
    if (kind === "guided3d_start") {
      await interaction.deferReply({ flags: 64 });
      const triangles = normalizeTriangleLimit(actionId);
      const startOptions = extra ? guidedModelStartOptions.get(extra) : null;
      if (extra) guidedModelStartOptions.delete(extra);
      const prompt = normalizeModelGenerationPrompt(startOptions?.prompt);

      if (!interaction.channel?.threads?.create) {
        await interaction.editReply("I cannot create a request thread in this channel.");
        return;
      }

      let thread;
      const threadName = `Model of ${interaction.user.username}`.slice(0, 90);
      const closeHours = guidedModelPlanCloseHours(interaction);
      const autoArchiveDuration = guidedThreadAutoArchiveDuration(closeHours);
      try {
        thread = await interaction.channel.threads.create({
          name: threadName,
          type: ChannelType.PrivateThread,
          invitable: false,
          autoArchiveDuration,
          reason: `Guided model request by ${interaction.user.tag}`,
        });
      } catch (err) {
        console.warn("Could not create private guided model thread, trying public thread:", err.message || err);
        thread = await interaction.channel.threads.create({
          name: threadName,
          type: ChannelType.PublicThread,
          autoArchiveDuration,
          reason: `Guided model request by ${interaction.user.tag}`,
        });
      }

      await thread.members?.add?.(interaction.user.id).catch(() => {});
      const tempDir = path.join(__dirname, "temp", "refazer", `guided-${thread.id}`);
      guidedModelSessions.set(thread.id, {
        threadId: thread.id,
        parentChannelId: interaction.channelId,
        userId: interaction.user.id,
        status: "choosing_type",
        language: languageFor(interaction),
        stepIndex: 0,
        viewPaths: {},
        originalViewPaths: {},
        enhancement: "none",
        triangles,
        prompt,
        tempDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closeHours,
      });
      scheduleGuidedThreadClose(guidedModelSessions.get(thread.id));

      await thread.send({
        content:
          "# ✨ 3D Model Request\n" +
          `Welcome ${interaction.user}. This thread keeps your references, review and final delivery organized.\n\n` +
          "## 🔁 Flow\n" +
          "> 1. Choose the model type and quality preset.\n" +
          "> 2. Upload **Front**, **Right**, **Left** and **Back** references one by one.\n" +
          "> 3. Review the prepared images before generation starts.\n" +
          "> 4. Receive the final Roblox-ready GLB in this channel.\n\n" +
          "## ⚙️ Current Setup\n" +
          `**Triangle target:** ${triangles}\n` +
          `**Custom prompt:** ${prompt ? "Enabled" : "Off"}\n` +
          `**Thread window:** ${formatHoursDuration(closeHours)}\n\n` +
          "## 🔒 Billing\n" +
          "**Service Credits are charged only after a final model is delivered.**\n\n" +
          "## 1️⃣ Choose Model Type\n" +
          "Pick the closest option so the bot can use safer prompts and review language:",
        components: [...guidedModelTypeButtons(thread.id), guidedModelThreadControls(thread.id)],
      });
      await interaction.editReply(`I created your private request thread: ${thread}`);
      return;
    }

    if (kind === "guided3d_close") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request is already closed or expired.", flags: 64 });
        return;
      }
      const canClose = session.userId === interaction.user.id || memberHasRole(interaction.member, ADMIN_ROLE);
      if (!canClose) {
        await interaction.reply({ content: "Only the request owner or the team can close this thread.", flags: 64 });
        return;
      }
      if (session.status === "generating") {
        await interaction.reply({
          content: "This request is generating right now. You can close the thread after the final model is delivered.",
          flags: 64,
        });
        return;
      }

      session.status = "closed";
      session.updatedAt = Date.now();
      clearGuidedThreadCloseTimer(actionId);
      guidedModelSessions.delete(actionId);

      await interaction.update({
        content:
          "# Request Closed\n" +
          "This model request was closed. You can start a new one whenever you need.",
        components: [guidedModelThreadControls(actionId, true)],
      }).catch(async () => {
        await interaction.reply({ content: "Request closed.", flags: 64 }).catch(() => {});
      });
      await interaction.channel?.setArchived?.(true, `Guided model request closed by ${interaction.user.tag}`).catch(() => {});
      return;
    }

    if (kind === "guided3d_type") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can use these buttons.", flags: 64 });
        return;
      }

      session.objectType = GUIDED_MODEL_TYPE_LABELS[extra] ? extra : "other";
      session.status = "choosing_quality";
      session.updatedAt = Date.now();

      await interaction.update({
        content:
          "# 2️⃣ Quality Preset\n" +
          `**Type selected:** ${GUIDED_MODEL_TYPE_LABELS[session.objectType]}\n\n` +
          "Choose how much detail the AI should preserve.\n\n" +
          "## Recommended\n" +
          "> **Sharper** is the best default for most paid orders.\n" +
          "> **Standard** is safer for simple shapes and rough references.\n" +
          "> **Max** is for clean references with small details, symbols, hair pieces or accessories.",
        components: guidedModelQualityButtons(actionId),
      });
      return;
    }

    if (kind === "guided3d_quality") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can use these buttons.", flags: 64 });
        return;
      }

      session.modelQuality = normalizeModelQuality(extra || "medium");
      session.status = "choosing_alpha";
      session.updatedAt = Date.now();
      const qualityConfig = modelQualityConfig(session.modelQuality);

      await interaction.update({
        content:
          "# 3️⃣ Alpha / Cutout Option\n" +
          `**Quality selected:** ${qualityConfig.label}\n\n` +
          "Choose how the AI should treat transparent or floating details.\n\n" +
          "## Recommended\n" +
          "> **Standard** for solid hats, heads, bodies and most accessories.\n" +
          "> **Alpha-aware** only for transparent PNGs, hair gaps, stickers, hearts, chains or thin floating pieces.\n\n" +
          "**When unsure, use Standard.**",
        components: guidedModelAlphaButtons(actionId),
      });
      return;
    }

    if (kind === "guided3d_alpha") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can use these buttons.", flags: 64 });
        return;
      }

      session.useAlpha = extra === "on";
      session.status = "choosing_enhancement";
      session.updatedAt = Date.now();

      await interaction.update({
        content:
          "# 4️⃣ Reference Prep\n" +
          `**Alpha-aware generation:** ${session.useAlpha ? "On" : "Off"}\n\n` +
          "Choose how the bot should prepare your images before generation.\n\n" +
          "> **Use originals** keeps your files exactly as sent.\n" +
          "> **Clean references** applies safe local cleanup for sharper, clearer references.\n" +
          (OPENAI_API_KEY
            ? "> **AI enhance** can improve texture readability, but may change the image if the reference is difficult.\n\n"
            : "\n") +
          "**Recommended:** use **Clean references** for normal screenshots. Use **AI enhance** only when you intentionally want stronger cleanup.",
        components: guidedModelEnhancementButtons(actionId),
      });
      return;
    }

    if (kind === "guided3d_enhancement") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can use these buttons.", flags: 64 });
        return;
      }

      if (extra === "ai" && !OPENAI_API_KEY) {
        await interaction.reply({
          content: "AI enhancement is not configured yet. Use **Clean references** or **Use originals**.",
          flags: 64,
        });
        return;
      }

      session.enhancement = extra === "ai" ? "ai" : extra === "economy" ? "economy" : "none";
      session.status = "collecting";
      session.stepIndex = 0;
      session.awaitingView = GUIDED_MODEL_VIEW_STEPS[0].view;
      session.updatedAt = Date.now();

      await interaction.update({
        content:
          "# 📸 Upload References\n" +
          `**Reference prep:** ${(IMAGE_ENHANCEMENTS[session.enhancement] || IMAGE_ENHANCEMENTS.none).label}\n\n` +
          "Send the four references one by one. I will ask for each side in order.\n\n" +
          "**Do not send all sides in one message.** This keeps the order clean and prevents wrong-side generations.",
        components: [guidedModelThreadControls(actionId)],
      });
      await sendGuidedModelPhotoPrompt(interaction.channel, session);
      return;
    }

    if (kind === "guided3d_change") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can change the photos.", flags: 64 });
        return;
      }

      await interaction.reply({
        content: "Which photo do you want to change?",
        components: guidedModelReplaceButtons(actionId),
        flags: 64,
      });
      return;
    }

    if (kind === "guided3d_prepare") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can prepare the references.", flags: 64 });
        return;
      }
      if (session.status === "preparing") {
        await interaction.reply({ content: "The references are already being prepared.", flags: 64 });
        return;
      }

      await interaction.deferUpdate().catch(() => {});
      const member = await interaction.guild.members.fetch(session.userId).catch(() => interaction.member);
      await prepareGuidedModelReferences(interaction.channel, session, {
        user: interaction.user,
        member,
        guild: interaction.guild,
      });
      return;
    }

    if (kind === "guided3d_replace") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can change the photos.", flags: 64 });
        return;
      }
      if (!MULTIVIEW_VIEW_ORDER.includes(extra)) {
        await interaction.reply({ content: "Invalid photo side.", flags: 64 });
        return;
      }

      delete session.viewPaths[extra];
      delete session.originalViewPaths[extra];
      session.prepWarnings = [];
      session.status = "collecting";
      session.awaitingView = extra;
      session.updatedAt = Date.now();

      await interaction.update({
        content: `Send a new **${publicViewName(extra)}** photo in this thread.`,
        components: [],
      });
      await sendGuidedModelPhotoPrompt(interaction.channel, session);
      return;
    }

    if (kind === "guided3d_generate") {
      const session = guidedModelSessionForThread(actionId);
      if (!session) {
        await interaction.reply({ content: "This request expired. Click **Create my 3D model** again.", flags: 64 });
        return;
      }
      if (session.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who started this request can generate it.", flags: 64 });
        return;
      }
      if (!guidedModelCompleted(session)) {
        await interaction.reply({ content: "Send all four photos before generating.", flags: 64 });
        return;
      }

      session.status = "generating";
      session.updatedAt = Date.now();
      const generationActionId = createPendingMultiviewAction({
        userId: interaction.user.id,
        viewPaths: session.viewPaths,
        texture: "standard",
        enhancement: session.enhancement || "none",
        triangles: normalizeTriangleLimit(session.triangles),
        prompt: session.prompt || "",
        tempDir: session.tempDir,
        textureTone: "normal",
        textureAdjustments: DEFAULT_TEXTURE_ADJUSTMENTS,
        useAlpha: Boolean(session.useAlpha),
        modelQuality: normalizeModelQuality(session.modelQuality || "medium"),
        advancedTexture: "none",
        textureSource: "none",
        advancedTexturePrompted: true,
        waitingTextureDecision: false,
        priceMode: "guided",
        serviceKey: "multiview",
        guidedThreadId: session.threadId,
        quoteSnapshot: session.quoteSnapshot,
      });
      const action = pendingMultiviewActions.get(generationActionId);
      await startPendingMultiviewGeneration(interaction, generationActionId, action, { updateMode: "review" });
      return;
    }

    if (kind === "multiview_texture_offer") {
      const action = pendingMultiviewActions.get(actionId);
      if (!action) {
        await interaction.reply({ content: "This multiview request expired. Send `/multiview` again.", flags: 64 });
        return;
      }

      if (action.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who created this request can choose this option.", flags: 64 });
        return;
      }

      if (action.used) {
        await interaction.reply({ content: "This multiview request is already being processed.", flags: 64 });
        return;
      }

      if (extra === "never") {
        updateWalletPreferences(interaction.user.id, { advancedTexturePrompt: false });
        action.advancedTexture = "none";
        action.textureSource = "none";
        action.waitingTextureDecision = false;
        await startPendingMultiviewGeneration(interaction, actionId, action, { updateMode: "offer" });
        return;
      }

      if (extra === "skip") {
        action.advancedTexture = "none";
        action.textureSource = "none";
        action.waitingTextureDecision = false;
        await startPendingMultiviewGeneration(interaction, actionId, action, { updateMode: "offer" });
        return;
      }

      if (!MULTIVIEW_VIEW_ORDER.includes(extra) || !action.viewPaths[extra]) {
        await interaction.reply({ content: "Invalid texture source.", flags: 64 });
        return;
      }

      action.advancedTexture = "basic";
      action.textureSource = extra;
      action.waitingTextureDecision = false;
      await startPendingMultiviewGeneration(interaction, actionId, action, { updateMode: "offer" });
      return;
    }

    if (kind === "multiview_cancel") {
      const action = pendingMultiviewActions.get(actionId);
      if (!action) {
        await interaction.reply({ content: "This multiview request expired. Send `/multiview` again.", flags: 64 });
        return;
      }

      if (action.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who created this request can cancel it.", flags: 64 });
        return;
      }

      action.used = true;
      deletePendingMultiviewAction(actionId);
      await interaction.update({
        content: "## Multiview Request Cancelled\nNo Service Credits were charged.",
        components: [disableMultiviewReviewButtons(actionId, false)],
      });
      return;
    }

    if (kind === "multiview_generate") {
      const action = pendingMultiviewActions.get(actionId);
      if (!action) {
        await interaction.reply({ content: "This multiview request expired. Send `/multiview` again.", flags: 64 });
        return;
      }

      if (action.userId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who created this request can generate it.", flags: 64 });
        return;
      }

      if (action.used) {
        await interaction.reply({ content: "This multiview request is already being processed.", flags: 64 });
        return;
      }

      if (action.waitingTextureDecision) {
        await interaction.reply({
          content: "## Choose Texture Option\nUse the Advanced Texture prompt already shown above, or choose **No, generate normally**.",
          flags: 64,
        });
        return;
      }

      const prefs = walletPreferences(interaction.user.id);
      const shouldOfferAdvancedTexture =
        shouldUseHyper3d() &&
        action.texture !== "none" &&
        action.advancedTexture === "none" &&
        action.textureSource === "none" &&
        prefs.advancedTexturePrompt !== false &&
        !action.advancedTexturePrompted;

      if (shouldOfferAdvancedTexture) {
        const extraAmount = brlToWalletTokens(advancedTextureConfig("basic").priceExtraBrl);
        action.advancedTexturePrompted = true;
        action.waitingTextureDecision = true;
        setPendingMultiviewAction(actionId, action);
        await interaction.reply({
          content:
            "## Optional Advanced Texture\n" +
            "Small logos, hearts and printed details can sometimes disappear. Advanced Texture uses **one** reference image as the texture guide before delivery.\n\n" +
            `**Extra price:** ${formatTokenAmount(extraAmount)}\n\n` +
            "Choose the side with the most important visible texture, or skip and generate normally.",
          components: multiviewAdvancedTextureOfferButtons(actionId),
          flags: 64,
        });
        return;
      }

      await startPendingMultiviewGeneration(interaction, actionId, action, { updateMode: "review" });
      return;
    }

    if (kind !== "clothing_reset") return;

    const action = getClothingTemplateAction(actionId);
    if (!action) {
      await interaction.reply({
        content: "This reset button expired. Copy the clothing again to create a new reset button.",
        flags: 64,
      });
      return;
    }

    if (action.used) {
      await interaction.reply({
        content: "This template was already reset. Copy the clothing again if you need a new reset.",
        flags: 64,
      });
      return;
    }

    if (action.userId !== interaction.user.id) {
      await interaction.reply({
        content: "Only the user who copied this clothing can reset this template.",
        flags: 64,
      });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const resetPath = await createResetTemplateImage(action);
      markClothingTemplateActionUsed(action.id);
      if (action.source !== "bulk") {
        await interaction.message.delete().catch(() => {});
      }
      await interaction.channel.send({
        content:
          `## Clothing Template Reset\n` +
          `**Item:** ${action.name}\n` +
          `**Catalog ID:** \`${action.catalogId}\`\n` +
          `**Template ID:** \`${action.templateId}\`\n` +
          `**Type:** ${action.typeLabel}\n\n` +
          "Template guide applied on top.",
        files: [publicImageAttachment(resetPath, `${action.catalogId}_reset_template.png`)],
      });
      await interaction.editReply("Template reset sent.");
    } catch (err) {
      console.error(err);
      await interaction.editReply(
        "I could not reset this template right now. The team can review it manually."
      );

      if (userIsAdmin(interaction)) {
        await interaction.followUp({
          content:
            "## Admin diagnostic\n" +
            `\`\`\`\n${String(err.message || err).slice(0, 1500)}\n\`\`\``,
          flags: 64,
        }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  if (![
    "refazer_comandos",
    "commands",
    "settings",
    "velvet_saldo",
    "balance",
    "history",
    "order_status",
    "velvet_comprar",
    "buy",
    "affiliate",
    "affiliate_register",
    "affiliate_apply",
    "affiliate_redeem",
    "affiliate_withdraw",
    "subscribe",
    "code_redeem",
    "gift_create",
    "gift_redeem",
    "gift_history",
    "velvet_transferir",
    "velvet_sacar",
    "velvet_admin_add",
    "velvet_admin_remover",
    "velvet_admin_compras",
    "velvet_admin_compra",
    "velvet_admin_saques",
    "velvet_admin_saque",
    "admin_add",
    "admin_buy",
    "admin_code_create",
    "admin_code_disable",
    "admin_codes",
    "admin_gift_cancel",
    "admin_credit_history",
    "admin_remove",
    "admin_purchases",
    "admin_purchase",
    "admin_withdrawals",
    "admin_withdrawal",
    "admin_post_guide",
    "admin_post_terms",
    "admin_post_info",
    "admin_post_model_starter",
    "admin_bulk_views",
    "admin_views_full",
    "model_views",
    "admin_roblox_status",
    "admin_status",
    "copiar",
    "steal",
    "sniper",
    "limited_sniper",
    "bulk_steal_clothing",
    "bulk_steal",
    "views",
    "views_custom",
    "bulk_remake",
    "remake",
    "price",
    "generate3d",
    "generate_image",
    "enhance_images",
    "image_model",
    "prompt_model",
    "multiview",
    "refazer",
    "refazer_mock",
    "modelo_ultimo",
    "refazer_debug",
    "refazer_preco",
    "refazer_multiview",
  ].includes(interaction.commandName)) return;
  try {
    if (!commandChannelIsAllowed(interaction)) {
      await interaction.reply({
        content: formatAllowedCommandChannelsMessage(languageFor(interaction)),
        flags: 64,
      });
      return;
    }

    if (DISABLED_STORED_VALUE_COMMANDS.has(interaction.commandName)) {
      const lang = languageFor(interaction);
      await interaction.reply({
        content: lang === "pt-BR"
          ? [
            "# Recurso indisponível",
            SERVICE_CREDITS_NOTE,
            "Use `/buy` para pacotes de serviço ou `/affiliate_redeem` para converter comissão em Service Credits.",
          ].join("\n")
          : lang === "es"
            ? [
              "# Función no disponible",
              SERVICE_CREDITS_NOTE,
              "Usa `/buy` para paquetes de servicio o `/affiliate_redeem` para convertir comisión en Service Credits.",
            ].join("\n")
            : [
              "# Feature unavailable",
              SERVICE_CREDITS_NOTE,
              "Use `/buy` for service packages or `/affiliate_redeem` to convert affiliate commission into Service Credits.",
            ].join("\n"),
        flags: 64,
      });
      return;
    }

    if (!await checkCooldown(interaction)) return;

    if (!userIsAllowed(interaction)) {
      const lang = languageFor(interaction);
      await interaction.reply({
        content: lang === "pt-BR"
          ? "Você não tem o cargo necessário para usar este bot."
          : lang === "es"
            ? "No tienes el rol necesario para usar este bot."
            : "You do not have the required role to use this bot.",
        flags: 64,
      });
      return;
    }

    if (commandRequiresConfirmedLanguage(interaction)) {
      await interaction.reply({
        content: languageSetupRequiredMessage(),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "refazer_comandos" || interaction.commandName === "commands") {
      await interaction.reply({
        content: formatCommandsHelp(interaction),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "settings") {
      const language = interaction.options.getString("language");
      const currency = interaction.options.getString("currency");
      const textureTone = interaction.options.getString("texture_tone");
      const textureSaturation = interaction.options.getNumber("texture_saturation");
      const textureValue = interaction.options.getNumber("texture_value");
      const renderUpdates = {};
      const renderLighting = interaction.options.getString("render_lighting");
      const renderPov = interaction.options.getString("render_pov");
      const renderIor = interaction.options.getNumber("render_ior");
      const renderRoughness = interaction.options.getNumber("render_roughness");
      const renderExposure = interaction.options.getNumber("render_exposure");
      const renderLightPower = interaction.options.getNumber("render_light_power");
      const advancedTexturePrompt = interaction.options.getString("advanced_texture_prompt");

      if (renderLighting) renderUpdates.lighting = renderLighting;
      if (renderPov) renderUpdates.pov = renderPov;
      if (renderIor !== null) renderUpdates.ior = renderIor;
      if (renderRoughness !== null) renderUpdates.roughness = renderRoughness;
      if (renderExposure !== null) renderUpdates.exposure = renderExposure;
      if (renderLightPower !== null) renderUpdates.lightPower = renderLightPower;

      const prefs = updateWalletPreferences(interaction.user.id, {
        language,
        currency,
        textureTone,
        textureAdjustments: textureSaturation !== null || textureValue !== null
          ? {
            saturation: textureSaturation ?? walletPreferences(interaction.user.id).textureAdjustments.saturation,
            value: textureValue ?? walletPreferences(interaction.user.id).textureAdjustments.value,
          }
          : null,
        renderSettings: Object.keys(renderUpdates).length ? renderUpdates : null,
        advancedTexturePrompt: advancedTexturePrompt ? advancedTexturePrompt === "show" : undefined,
      });
      const resolvedLanguage = prefs.language === "auto" ? languageFor(interaction) : prefs.language;

      await interaction.reply({
        content: formatSettingsMessage({ prefs, resolvedLanguage }),
        flags: 64,
      });
      return;
    }

    if ([
      "refazer_mock",
      "modelo_ultimo",
      "refazer_debug",
      "velvet_admin_add",
      "velvet_admin_remover",
      "velvet_admin_compras",
      "velvet_admin_compra",
      "velvet_admin_saques",
      "velvet_admin_saque",
      "admin_add",
      "admin_buy",
      "admin_code_create",
      "admin_code_disable",
      "admin_codes",
      "admin_gift_cancel",
      "admin_credit_history",
      "admin_remove",
      "admin_purchases",
      "admin_purchase",
      "admin_withdrawals",
      "admin_withdrawal",
      "admin_post_guide",
      "admin_post_terms",
      "admin_post_info",
      "admin_post_model_starter",
      "admin_bulk_views",
      "admin_views_full",
      "model_views",
      "admin_roblox_status",
      "admin_status",
    ].includes(interaction.commandName) && !userIsAdmin(interaction)) {
      await interaction.reply({
        content: "Esse comando e reservado para a equipe.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_saldo" || interaction.commandName === "balance") {
      await interaction.reply({
        content: formatBalanceMessage({
          balance: walletBalance(interaction.user.id),
          serviceCredits: walletServiceCreditsSummary(interaction.user.id),
          language: languageFor(interaction),
        }),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_comprar" || interaction.commandName === "buy") {
      const lang = languageFor(interaction);
      const amount = interaction.options.getInteger("quantidade") || interaction.options.getInteger("amount");
      const selectedCurrency = interaction.options.getString("moeda") || interaction.options.getString("currency");
      const selectedProvider = interaction.options.getString("gateway") || interaction.options.getString("provider");
      const requestedProvider = paymentProviderFor(selectedProvider);
      const currency = requestedProvider.startsWith("mercadopago")
        ? "BRL"
        : currencyFor(interaction, selectedCurrency);
      if (amount < WALLET_MIN_PURCHASE) {
        await interaction.reply({
          content: lang === "pt-BR"
            ? `## ⚠️ Compra mínima\nA compra mínima é de **${formatTokenAmount(WALLET_MIN_PURCHASE)}**.`
            : `## ⚠️ Minimum purchase\nThe minimum purchase is **${formatTokenAmount(WALLET_MIN_PURCHASE)}**.`,
          flags: 64,
        });
        return;
      }

      const request = createPurchaseRequest({
        userId: interaction.user.id,
        amount,
        currency,
        channelId: interaction.channelId,
      });
      const priceLabel = formatCurrencyFromBrl(request.brl, currency);
      let paymentLink = null;
      let paymentProvider = "manual";
      let pixPayment = null;

      if (requestedProvider === "stripe" && STRIPE_SECRET_KEY) {
        try {
          const session = await createStripeCheckoutSession(request);
          paymentLink = session.url || null;
          paymentProvider = paymentProviderLabel(requestedProvider);
        } catch (err) {
          console.error(err);
        }
      } else if (requestedProvider === "mercadopago_pix" && MERCADO_PAGO_ACCESS_TOKEN) {
        try {
          pixPayment = await createMercadoPagoPixPayment(request);
          paymentProvider = paymentProviderLabel(requestedProvider);
        } catch (err) {
          console.error(err);
        }
      } else if (requestedProvider === "mercadopago" && MERCADO_PAGO_ACCESS_TOKEN) {
        try {
          const preference = await createMercadoPagoPreference(request);
          paymentLink = preference.init_point || preference.sandbox_init_point || null;
          paymentProvider = paymentProviderLabel(requestedProvider);
        } catch (err) {
          console.error(err);
        }
      }

      if (pixPayment) {
        await interaction.reply({
          content: formatMercadoPagoPixMessage({ request, priceLabel, payment: pixPayment, language: languageFor(interaction) }),
          files: mercadoPagoPixAttachments(pixPayment, request.id),
          flags: 64,
        });
        return;
      }

      await interaction.reply({
        content: formatPurchaseMessage({ request, priceLabel, paymentProvider, paymentLink, language: languageFor(interaction) }),
        flags: 64,
      });
      return;

      await interaction.reply({
        content: lang === "pt-BR"
          ?
          `# 🛒 Pedido de Compra\n` +
          `✅ **Seu pedido foi criado com sucesso.**\n\n` +
          `> **ID do pedido:** \`${request.id}\`\n` +
          `> **Pacote:** 💎 ${formatTokenAmount(request.amount)}\n` +
          `> **Valor:** **${priceLabel}**\n` +
          `> **Status:** ⏳ aguardando pagamento\n\n` +
          `📌 **Próximo passo**\n` +
          (paymentLink
            ? `Pague pelo ${paymentProvider}:\n${paymentLink}\n\nAssim que for confirmado, seus **Service Credits** serão liberados automaticamente.`
            : `Envie o pagamento no canal indicado pela equipe. Assim que for confirmado, seus **Service Credits** caem na carteira automaticamente.`)
          :
          `# 🛒 Purchase Request\n` +
          `✅ **Your request was created successfully.**\n\n` +
          `> **Order ID:** \`${request.id}\`\n` +
          `> **Package:** 💎 ${formatTokenAmount(request.amount)}\n` +
          `> **Price:** **${priceLabel}**\n` +
          `> **Status:** ⏳ awaiting payment\n\n` +
          `📌 **Next step**\n` +
          (paymentLink
            ? `Pay with ${paymentProvider}:\n${paymentLink}\n\nOnce confirmed, your **Service Credits** will be released automatically.`
            : `Send the payment in the channel indicated by the team. Once confirmed, your **Service Credits** will be added to your wallet automatically.`),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "affiliate") {
      if (!userIsAffiliate(interaction)) {
        await interaction.reply({
          content: "## Affiliate Program\nYou need the affiliate role to access this area.",
          flags: 64,
        });
        return;
      }

      const profile = getAffiliateProfile(interaction.user.id);
      await interaction.reply({
        content: formatAffiliateMessage(profile),
        flags: 64,
      });
      return;

      /*
      const oldProfile = getAffiliateProfile(interaction.user.id);
      const link = `https://discord.com/channels/${GUILD_ID}?ref=${oldProfile.code}`;

      await interaction.reply({
        content:
          `## 🤝 Affiliate Program\n` +
          `**Your code:** \`${profile.code}\`\n` +
          `**Your link:** ${link}\n` +
          `**Commission:** ${(AFFILIATE_COMMISSION_RATE * 100).toFixed(0)}%\n` +
          `**Pending commission:** ${formatTokenAmount(profile.affiliateBalance)}\n\n` +
        flags: 64,
      });
      return;
      */
    }

    if (interaction.commandName === "affiliate_register") {
      if (!userIsAffiliate(interaction)) {
        await interaction.reply({
          content: "## Affiliate Program\nYou need the affiliate role to register an invite.",
          flags: 64,
        });
        return;
      }

      const invite = interaction.options.getString("invite");
      const registered = registerAffiliateInvite(interaction.user.id, invite);
      await interaction.reply({
        content: registered.ok
          ? `## Affiliate Invite Registered\n**Code:** \`${registered.code}\`\n**Invite:** ${registered.inviteUrl}\n\nNew members using this invite can be linked to you automatically.`
          : `## Invite Not Registered\n${registered.reason}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "affiliate_apply") {
      getAffiliateProfile(interaction.user.id);
      const code = interaction.options.getString("code");
      const applied = applyAffiliateCode(interaction.user.id, code);

      await interaction.reply({
        content: applied.ok
          ? `## ✅ Affiliate Applied\nThis account is now linked to <@${applied.ownerId}>.`
          : `## ⚠️ Affiliate Not Applied\n${applied.reason}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "affiliate_redeem") {
      const amount = interaction.options.getInteger("amount");
      const redeemed = redeemAffiliateCommission({
        userId: interaction.user.id,
        amount,
        actorId: interaction.user.id,
      });

      await interaction.reply({
        content: redeemed.ok
          ? `## ✅ Commission Redeemed\n**Converted to Service Credits:** ${formatTokenAmount(amount)}\n**Service credit balance:** ${formatTokenAmount(redeemed.balance)}\n**Affiliate balance:** ${formatTokenAmount(redeemed.affiliateBalance)}`
          : `## ⚠️ Insufficient Affiliate Balance\n**Current balance:** ${formatTokenAmount(redeemed.balance)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "affiliate_withdraw") {
      const amount = interaction.options.getInteger("amount");
      const paymentInfo = interaction.options.getString("payment_info").trim();
      const created = createAffiliateWithdrawal({
        userId: interaction.user.id,
        amount,
        paymentInfo,
      });

      await interaction.reply({
        content: created.ok
          ? `## 🏦 Affiliate Withdrawal Requested\n**ID:** \`${created.request.id}\`\n**Amount:** ${formatTokenAmount(amount)}\n**Remaining affiliate balance:** ${formatTokenAmount(created.affiliateBalance)}\n\nThe team will review and pay it manually.`
          : `## ⚠️ Withdrawal Not Created\n${created.reason}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "subscribe") {
      const planKey = interaction.options.getString("plan");
      const email = interaction.options.getString("email").trim();
      const requestedProvider = paymentProviderFor(interaction.options.getString("provider"));
      const plan = SUBSCRIPTION_PLANS[planKey];
      const subscriptionCurrency = requestedProvider.startsWith("mercadopago") ? "BRL" : DEFAULT_CURRENCY;
      const subscriptionPriceLabel = formatCurrencyFromBrl(plan?.brl || 0, subscriptionCurrency);

      if (!plan) {
        await interaction.reply({ content: "## ⚠️ Invalid plan", flags: 64 });
        return;
      }

      if (requestedProvider === "stripe" && !STRIPE_SECRET_KEY) {
        await interaction.reply({
          content:
            `## ⚠️ Stripe checkout is not configured\n` +
            `Plan: **${plan.label}**\n` +
            `Price: **${subscriptionPriceLabel}/month**`,
          flags: 64,
        });
        return;
      }

      if (requestedProvider.startsWith("mercadopago") && !MERCADO_PAGO_ACCESS_TOKEN) {
        await interaction.reply({
          content:
            `## ⚠️ Subscription checkout is not configured\n` +
            `Plan: **${plan.label}**\n` +
            `Price: **${subscriptionPriceLabel}/month**\n\n` +
            "The team can activate it manually for now.",
          flags: 64,
        });
        return;
      }

      try {
        let link = null;
        let provider = paymentProviderLabel(requestedProvider);
        let orderId = null;
        let expiresAt = null;

        if (plan.lifetime) {
          const request = createPurchaseRequest({
            userId: interaction.user.id,
            amount: 0,
            currency: subscriptionCurrency,
            brlOverride: plan.brl,
            source: "subscription_lifetime",
            channelId: interaction.channelId,
            meta: {
              planKey,
              roleId: plan.roleId,
              lifetime: true,
              email,
            },
          });
          orderId = request.id;
          expiresAt = request.expiresAt;

          if (requestedProvider.startsWith("mercadopago")) {
            const preference = await createMercadoPagoLifetimeSubscriptionPreference(request);
            link = preference.init_point || preference.sandbox_init_point || null;
            provider = requestedProvider === "mercadopago_pix" ? "Mercado Pago Pix" : paymentProviderLabel(requestedProvider);
          } else {
            const session = await createStripeLifetimeSubscriptionSession({
              request,
              email,
              currency: subscriptionCurrency,
            });
            link = session.url || null;
          }
        } else if (requestedProvider === "mercadopago_pix") {
          const request = createPurchaseRequest({
            userId: interaction.user.id,
            amount: 0,
            currency: "BRL",
            brlOverride: plan.brl,
            source: "subscription_pix",
            channelId: interaction.channelId,
            meta: {
              planKey,
              roleId: plan.roleId,
              days: PREPAID_SUBSCRIPTION_DAYS,
              email,
            },
          });
          const preference = await createMercadoPagoPrepaidSubscriptionPreference(request);
          link = preference.init_point || preference.sandbox_init_point || null;
          provider = "Mercado Pago Pix";
          orderId = request.id;
          expiresAt = request.expiresAt;
        } else if (requestedProvider.startsWith("mercadopago")) {
          const subscription = await createMercadoPagoSubscription({
            userId: interaction.user.id,
            planKey,
            email,
          });
          link = subscription.init_point || subscription.sandbox_init_point || null;
        } else {
          const session = await createStripeSubscriptionSession({
            userId: interaction.user.id,
            planKey,
            email,
            currency: subscriptionCurrency,
          });
          link = session.url || null;
        }

        await interaction.reply({
          content: formatSubscriptionMessage({ plan, provider, email, link, orderId, priceLabel: subscriptionPriceLabel, expiresAt }),
          flags: 64,
        });
        return;
      } catch (err) {
        console.error(err);
        await interaction.reply({
          content: "## ⚠️ Subscription checkout failed\nThe team can review this manually.",
          flags: 64,
        });
      }
      return;
    }

    if (interaction.commandName === "velvet_transferir") {
      const target = interaction.options.getUser("usuario");
      const amount = interaction.options.getInteger("quantidade");

      if (target.bot || target.id === interaction.user.id) {
        await interaction.reply({ content: "Escolha outro usuario real para transferir.", flags: 64 });
        return;
      }

      const debit = removeWalletBalance({
        userId: interaction.user.id,
        amount,
        actorId: interaction.user.id,
        reason: `Transferencia para ${target.id}`,
      });

      if (!debit.ok) {
        await interaction.reply({
          content: `## ⚠️ Saldo insuficiente\n**Seu saldo:** ${formatTokenAmount(debit.balance)}`,
          flags: 64,
        });
        return;
      }

      addWalletBalance({
        userId: target.id,
        amount,
        actorId: interaction.user.id,
        reason: `Transferencia recebida de ${interaction.user.id}`,
      });

      await interaction.reply({
        content:
          `## 🤝 Transferência enviada\n` +
          `**Destino:** ${target}\n` +
          `**Quantidade:** ${formatTokenAmount(amount)}\n` +
          `**Seu novo saldo:** ${formatTokenAmount(debit.balance)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_sacar") {
      const amount = interaction.options.getInteger("quantidade");
      const robloxUsername = interaction.options.getString("roblox_usuario").trim();
      const groupConfirmed = interaction.options.getString("grupo_14_dias").trim().toUpperCase() === "SIM";

      if (!groupConfirmed) {
        await interaction.reply({
          content: "## ⚠️ Saque não criado\nPara pedir saque, confirme com `SIM` que você está no grupo há pelo menos 14 dias.",
          flags: 64,
        });
        return;
      }

      const created = createWithdrawalRequest({
        userId: interaction.user.id,
        amount,
        robloxUsername,
        groupConfirmed,
      });

      if (!created.ok) {
        await interaction.reply({
          content: `## ⚠️ Saldo insuficiente\n**Seu saldo:** ${formatTokenAmount(created.balance)}`,
          flags: 64,
        });
        return;
      }

      await interaction.reply({
        content:
          `## 🏦 Pedido de Saque Criado\n` +
          `**ID:** \`${created.request.id}\`\n` +
          `**Quantidade:** ${formatTokenAmount(amount)}\n` +
          `**Usuário Roblox:** ${robloxUsername}\n\n` +
          "A equipe vai revisar o grupo, o prazo de 14 dias e aprovar manualmente.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_admin_add" || interaction.commandName === "admin_add") {
      const target = interaction.options.getUser("usuario") || interaction.options.getUser("user");
      const amount = interaction.options.getInteger("quantidade") || interaction.options.getInteger("amount");
      const reason = interaction.options.getString("motivo") || interaction.options.getString("reason") || "Manual adjustment";
      const balance = addWalletBalance({ userId: target.id, amount, actorId: interaction.user.id, reason });

      await interaction.reply({
        content: `## Balance Added\n**User:** ${target}\n**Amount:** +${formatTokenAmount(amount)}\n**New balance:** ${formatTokenAmount(balance)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "history") {
      const limit = interaction.options.getInteger("limit") || 8;
      await interaction.reply({
        content: formatCustomerHistoryMessage({ userId: interaction.user.id, limit, language: languageFor(interaction) }),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "order_status") {
      const id = interaction.options.getString("id");
      const result = findOrderStatus(id, interaction.user.id, userIsAdmin(interaction));
      await interaction.reply({
        content: formatOrderStatusMessage(result, languageFor(interaction)),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_buy") {
      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      const priceBrl = interaction.options.getNumber("price_brl");
      const requestedProvider = paymentProviderFor(interaction.options.getString("provider"));
      const checkoutCurrency = requestedProvider.startsWith("mercadopago") ? "BRL" : DEFAULT_CURRENCY;
      const request = createPurchaseRequest({
        userId: target.id,
        amount,
        currency: checkoutCurrency,
        brlOverride: priceBrl,
        source: "admin_buy",
        channelId: interaction.channelId,
      });
      const adminPriceLabel = formatCurrencyFromBrl(priceBrl, checkoutCurrency);

      let paymentLink = null;
      let paymentProvider = paymentProviderLabel(requestedProvider);

      if (requestedProvider === "stripe" && STRIPE_SECRET_KEY) {
        try {
          const session = await createStripeCheckoutSession(request);
          paymentLink = session.url || null;
        } catch (err) {
          console.error(err);
        }
      } else if (requestedProvider.startsWith("mercadopago") && MERCADO_PAGO_ACCESS_TOKEN) {
        try {
          const preference = await createMercadoPagoPreference(request, {
            defaultPaymentMethodId: requestedProvider === "mercadopago_pix" ? "pix" : null,
          });
          paymentLink = preference.init_point || preference.sandbox_init_point || null;
        } catch (err) {
          console.error(err);
        }
      }

      await interaction.reply({
        content:
          `## 🛒 Admin Checkout Created\n` +
          `**User:** ${target}\n` +
          `**Order ID:** \`${request.id}\`\n` +
          `**Credits:** ${formatTokenAmount(amount)}\n` +
          `**Price:** ${adminPriceLabel}\n\n` +
          (paymentLink
            ? `${paymentProvider} checkout:\n${paymentLink}`
            : `${paymentProvider} checkout could not be created. Check PM2 logs.`),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "code_redeem") {
      const code = interaction.options.getString("code");
      const redeemed = redeemPromoCode({ userId: interaction.user.id, code });

      if (!redeemed.ok) {
        await interaction.reply({
          content:
            "## Code Not Redeemed\n" +
            `${redeemed.reason}`,
          flags: 64,
        });
        return;
      }

      await interaction.reply({
        content:
          "## Velvet Code Redeemed\n" +
          `**Code:** \`${redeemed.promo.code}\`\n` +
          `**Added:** ${formatTokenAmount(redeemed.promo.amount)}\n` +
          `**Type:** ${formatServiceScopes(redeemed.promo.services)}\n` +
          `**New balance:** ${formatTokenAmount(redeemed.balance)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "gift_create") {
      const recipient = interaction.options.getUser("recipient");
      const amount = interaction.options.getInteger("amount");
      const expiresDays = interaction.options.getInteger("expires_days") || GIFT_CODE_DEFAULT_EXPIRATION_DAYS;

      if (!recipient || recipient.bot || recipient.id === interaction.user.id) {
        await interaction.reply({
          content: "## Gift Not Created\nChoose another real user as the recipient.",
          flags: 64,
        });
        return;
      }

      const created = createGiftCode({
        senderId: interaction.user.id,
        recipientId: recipient.id,
        amount,
        expiresDays,
      });

      if (!created.ok) {
        await interaction.reply({
          content:
            "## Gift Not Created\n" +
            `${created.reason}\n\n` +
            `**Available balance:** ${formatTokenAmount(created.balance || walletBalance(interaction.user.id))}`,
          flags: 64,
        });
        return;
      }

      await interaction.reply({
        content:
          "# Service Credits Gift Created\n" +
          `${SERVICE_CREDITS_NOTE}\n\n` +
          `**Recipient:** ${recipient}\n` +
          `**Amount:** ${formatTokenAmount(created.gift.amount)}\n` +
          `**Gift code:** \`${created.gift.code}\`\n` +
          `**Expires:** ${created.gift.expiresAt}\n` +
          `**Your remaining balance:** ${formatTokenAmount(created.balance)}\n\n` +
          "Only the selected recipient can redeem this gift with `/gift_redeem`.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "gift_redeem") {
      const code = interaction.options.getString("code");
      const redeemed = redeemGiftCode({ userId: interaction.user.id, code });

      await interaction.reply({
        content: redeemed.ok
          ? "# Gift Redeemed\n" +
            `${SERVICE_CREDITS_NOTE}\n\n` +
            `**Code:** \`${redeemed.gift.code}\`\n` +
            `**Added:** ${formatTokenAmount(redeemed.gift.amount)}\n` +
            `**New balance:** ${formatTokenAmount(redeemed.balance)}`
          : `## Gift Not Redeemed\n${redeemed.reason}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "gift_history") {
      const limit = interaction.options.getInteger("limit") || 15;
      await interaction.reply({
        content: formatCreditHistoryMessage({
          userId: interaction.user.id,
          transactions: creditHistoryForUser(interaction.user.id, limit),
        }),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_code_create") {
      const code = interaction.options.getString("code");
      const amount = interaction.options.getInteger("amount");
      const maxUses = interaction.options.getInteger("uses");
      const services = interaction.options.getString("services") || "";
      const note = interaction.options.getString("note") || "";
      const created = createPromoCode({
        code,
        amount,
        maxUses,
        actorId: interaction.user.id,
        note,
        services,
      });

      if (!created.ok) {
        await interaction.reply({ content: `## Code Not Created\n${created.reason}`, flags: 64 });
        return;
      }

      await interaction.reply({
        content:
          "## Promo Code Created\n" +
          `**Code:** \`${created.promo.code}\`\n` +
          `**Reward:** ${formatTokenAmount(created.promo.amount)}\n` +
          `**Valid for:** ${formatServiceScopes(created.promo.services)}\n` +
          `**Uses:** 0/${created.promo.maxUses}\n` +
          `**Status:** Active`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_code_disable") {
      const code = interaction.options.getString("code");
      const disabled = disablePromoCode({ code, actorId: interaction.user.id });

      await interaction.reply({
        content: disabled.ok
          ? `## Promo Code Disabled\n**Code:** \`${disabled.promo.code}\``
          : `## Code Not Disabled\n${disabled.reason}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_codes") {
      const db = readWalletDb();
      const codes = Object.values(promoCodeList(db))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 15);

      await interaction.reply({
        content: codes.length
          ? [
            "## Promo Codes",
            ...codes.map(code =>
              `\`${code.code}\` | ${formatTokenAmount(code.amount)} | ${formatServiceScopes(code.services)} | ${code.usedBy?.length || 0}/${code.maxUses} | ${code.active ? "Active" : "Disabled"}`
            ),
          ].join("\n")
          : "## Promo Codes\nNo codes created yet.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_gift_cancel") {
      const code = interaction.options.getString("code");
      const reason = interaction.options.getString("reason") || "";
      const canceled = cancelGiftCode({ code, actorId: interaction.user.id, reason });

      await interaction.reply({
        content: canceled.ok
          ? "## Gift Code Canceled\n" +
            `**Code:** \`${canceled.gift.code}\`\n` +
            `**Sender:** <@${canceled.gift.senderId}>\n` +
            `**Recipient:** <@${canceled.gift.recipientId}>\n` +
            `**Refunded:** ${formatTokenAmount(canceled.gift.amount)}\n` +
            `**Sender balance:** ${formatTokenAmount(canceled.balance)}`
          : `## Gift Not Canceled\n${canceled.reason}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_credit_history") {
      const target = interaction.options.getUser("user");
      const limit = interaction.options.getInteger("limit") || 15;

      await interaction.reply({
        content: formatCreditHistoryMessage({
          userId: target.id,
          transactions: creditHistoryForUser(target.id, limit),
          title: "Admin Credit History",
        }),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_admin_remover" || interaction.commandName === "admin_remove") {
      const target = interaction.options.getUser("usuario") || interaction.options.getUser("user");
      const amount = interaction.options.getInteger("quantidade") || interaction.options.getInteger("amount");
      const reason = interaction.options.getString("motivo") || interaction.options.getString("reason") || "Manual adjustment";
      const debit = removeWalletBalance({ userId: target.id, amount, actorId: interaction.user.id, reason });

      if (!debit.ok) {
        await interaction.reply({
          content: `The user does not have enough Service Credits. Current balance: ${formatTokenAmount(debit.balance)}`,
          flags: 64,
        });
        return;
      }

      await interaction.reply({
        content: `## Balance Removed\n**User:** ${target}\n**Amount:** -${formatTokenAmount(amount)}\n**New balance:** ${formatTokenAmount(debit.balance)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_admin_compras" || interaction.commandName === "admin_purchases") {
      expirePendingPurchases();
      const db = readWalletDb();
      const pending = db.purchaseRequests.filter(item => item.status === "pending").slice(-10);

      await interaction.reply({
        content: pending.length
          ? [
            "## Pending Purchases",
            ...pending.map(item =>
              `\`${item.id}\` | <@${item.userId}> | **${formatTokenAmount(item.amount)}** | ${formatCurrencyFromBrl(item.brl, item.currency || DEFAULT_CURRENCY)} | expires ${purchaseExpiresAt(item) || "never"}`
            ),
          ].join("\n")
          : "## Pending Purchases\nThere are no pending purchases.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_admin_compra" || interaction.commandName === "admin_purchase") {
      const requestId = interaction.options.getString("id").trim();
      const action = interaction.options.getString("acao") || interaction.options.getString("action");
      const reason = interaction.options.getString("motivo") || interaction.options.getString("reason") || "";
      const resolved = resolvePurchase({ requestId, action, actorId: interaction.user.id, reason });

      if (!resolved.ok) {
        await interaction.reply({ content: resolved.reason, flags: 64 });
        return;
      }

      await interaction.reply({
        content:
          `## ${action === "aprovar" ? "Purchase Approved" : "Purchase Rejected"}\n` +
          `**ID:** \`${requestId}\`\n` +
          `**User:** <@${resolved.request.userId}>\n` +
          `**Amount:** ${formatTokenAmount(resolved.request.amount)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_admin_saques" || interaction.commandName === "admin_withdrawals") {
      const db = readWalletDb();
      const pending = db.withdrawalRequests.filter(item => item.status === "pending").slice(-10);

      await interaction.reply({
        content: pending.length
          ? [
            "## 🏦 Saques Pendentes",
            ...pending.map(item =>
              `\`${item.id}\` | <@${item.userId}> | **${formatTokenAmount(item.amount)}** | Roblox: ${item.robloxUsername}`
            ),
          ].join("\n")
          : "## ✅ Saques Pendentes\nNão há saques pendentes.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_admin_saque" || interaction.commandName === "admin_withdrawal") {
      const requestId = interaction.options.getString("id").trim();
      const action = interaction.options.getString("acao") || interaction.options.getString("action");
      const reason = interaction.options.getString("motivo") || interaction.options.getString("reason") || "";
      const resolved = resolveWithdrawal({ requestId, action, actorId: interaction.user.id, reason });

      if (!resolved.ok) {
        await interaction.reply({ content: resolved.reason, flags: 64 });
        return;
      }

      await interaction.reply({
        content:
          `## ${action === "aprovar" ? "✅ Saque Aprovado" : "❌ Saque Rejeitado"}\n` +
          `**ID:** \`${requestId}\`\n` +
          `**Usuário:** <@${resolved.request.userId}>\n` +
          `**Quantidade:** ${formatTokenAmount(resolved.request.amount)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_post_guide" || interaction.commandName === "admin_post_terms") {
      const language = interaction.options.getString("language");
      const kind = interaction.commandName === "admin_post_terms" ? "terms" : "guide";
      const messages = officialMessagesFor(kind, language);

      for (const message of messages) {
        await interaction.channel.send({ content: message });
      }

      await interaction.reply({
        content:
          `## Published\n` +
          `**Type:** ${kind === "terms" ? "Purchase terms" : "Usage guide"}\n` +
          `**Language:** ${language}\n` +
          `**Channel:** ${interaction.channel}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_post_info") {
      const type = interaction.options.getString("type");
      const channel = interaction.options.getChannel("channel");

      if (!channel?.isTextBased?.()) {
        await interaction.reply({
          content: "## Channel Not Supported\nChoose a text channel where the bot can send messages.",
          flags: 64,
        });
        return;
      }

      const message = formatOfficialInfoMessage(type);
      await channel.send({ content: message });
      await interaction.reply({
        content:
          `## Official Message Published\n` +
          `**Type:** ${type.replace(/_/g, " ")}\n` +
          `**Channel:** ${channel}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "generate3d") {
      const triangles = normalizeTriangleLimit(interaction.options.getInteger("triangles"));
      const prompt = normalizeModelGenerationPrompt(interaction.options.getString("prompt"));
      await interaction.reply({
        content:
          "# ✨ Start a 3D Model Request\n" +
          "**The easiest way to create a Roblox-ready 3D model with guided review.**\n\n" +
          "## 📦 Included\n" +
          "> Send **Front**, **Right**, **Left** and **Back** references.\n" +
          "> Choose the model type, detail level and alpha option.\n" +
          `> Triangle target: **${triangles}**.\n` +
          (prompt ? "> Custom prompt: enabled.\n" : "") +
          "> Review all images before the AI starts.\n" +
          "> Your final model is delivered only after generation succeeds.\n\n" +
          "## 🔒 Payment\n" +
          "> No Service Credits are charged until the final model is delivered.\n" +
          "> If your images are wrong and you approve them anyway, the final result may also be wrong.\n\n" +
          "**Click below to open your private request thread.**",
        components: [guidedModelStartButton(triangles, prompt)],
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_post_model_starter") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.isTextBased?.()) {
        await interaction.reply({
          content: "## Channel Not Supported\nChoose a text channel where the bot can send messages.",
          flags: 64,
        });
        return;
      }

      await channel.send({
        content:
          "# ✨ Create Your 3D Model\n" +
          "**Generate a Roblox-ready 3D model from images directly inside Discord.**\n\n" +
          "## 🔁 How It Works\n" +
          "> Click **Start 3D Model**.\n" +
          "> Choose type, quality and alpha option.\n" +
          "> Send **Front**, **Right**, **Left** and **Back** one by one.\n" +
          "> Review the references before generation starts.\n\n" +
          "## 💎 Launch Offer\n" +
          `> First ${AI_MODEL_LAUNCH_PROMO_FIRST_LIMIT} delivered AI models: **${formatWalletAmount(AI_MODEL_LAUNCH_PROMO_FIRST_PRICE_BRL)} each**.\n` +
          `> After that: **${formatWalletAmount(AI_MODEL_LAUNCH_PROMO_REGULAR_PRICE_BRL)} each**.\n` +
          `> Special role price: **${formatWalletAmount(AI_MODEL_LAUNCH_PROMO_ROLE_PRICE_BRL)} each** after the first ${AI_MODEL_LAUNCH_PROMO_FIRST_LIMIT}.\n\n` +
          "## 🔒 Payment\n" +
          "**No Service Credits are charged until the final model is delivered.**",
        components: [guidedModelStartButton()],
      });

      await interaction.reply({
        content: `## Starter Published\n**Channel:** ${channel}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_status") {
      const resetPause = interaction.options.getBoolean("reset_roblox_pause") || false;

      if (resetPause) {
        clearRobloxSafePause();
      }

      await interaction.reply({
        content:
          formatAdminSystemStatusMessage() +
          (resetPause ? "\n\n**Action:** Roblox Safe Mode pause cleared manually." : ""),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "admin_roblox_status") {
      const resetPause = interaction.options.getBoolean("reset_pause") || false;

      if (resetPause) {
        clearRobloxSafePause();
      }

      await interaction.reply({
        content:
          robloxStatusMessage() +
          (resetPause ? "\n\n**Action:** Safe Mode pause cleared manually." : ""),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "refazer_preco" || interaction.commandName === "price") {
      await interaction.deferReply({ flags: 64 });

      const mode = interaction.options.getString("modo");
      const texture = normalizeTextureOption(interaction.options.getString("textura") || interaction.options.getString("texture"));
      const enhancement = interaction.options.getString("melhoria") || interaction.options.getString("enhancement");
      const triangles = interaction.options.getInteger("triangles") || ROBLOX_SAFE_TRIANGLE_LIMIT;
      const quote = calculatePrice(interaction, {
        mode: mode || interaction.options.getString("mode"),
        texture,
        triangles,
        enhancement,
      });

      await interaction.editReply({
        content: formatPriceQuote({ mode: mode || interaction.options.getString("mode"), texture, triangles, enhancement, quote }),
      });
      return;
    }

    if (interaction.commandName === "sniper" || interaction.commandName === "limited_sniper") {
      await interaction.deferReply({ flags: 64 });
      const limitedOnly = interaction.commandName === "limited_sniper";

      if (!userIsAdmin(interaction)) {
        await interaction.editReply(
          "## Admin Only\n" +
          "This market radar is restricted to the team."
        );
        return;
      }

      const window = interaction.options.getString("window");
      const category = interaction.options.getString("category") || (limitedOnly ? "collectibles" : "all");
      const keyword = (interaction.options.getString("keyword") || "").trim();
      const minPriceRaw = interaction.options.getInteger("min_price");
      const maxPriceRaw = interaction.options.getInteger("max_price");
      const maxAgeDaysRaw = interaction.options.getInteger("max_age_days");
      const resultCountRaw = interaction.options.getInteger("results") || 5;
      const resultCount = Math.max(1, Math.min(50, resultCountRaw));
      const depth = interaction.options.getString("depth") || "normal";
      const minPrice = Number.isFinite(minPriceRaw) ? minPriceRaw : null;
      const maxPrice = Number.isFinite(maxPriceRaw) ? maxPriceRaw : null;
      const maxAgeDays = Number.isFinite(maxAgeDaysRaw) ? maxAgeDaysRaw : defaultSniperMaxAgeDays(window);
      const quote = {
        ...calculateSniperPrice(interaction),
        planLabel: "Admin",
        dailyLimit: null,
        walletAmount: 0,
      };

      if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
        await interaction.editReply("## Invalid price range\n`min_price` cannot be higher than `max_price`.");
        return;
      }

      const sniperTimeoutMs = Math.max(
        SNIPER_COMMAND_TIMEOUT_MS,
        depth === "deep" ? 140000 : 95000,
        resultCount > 25 ? 95000 : resultCount > 10 ? 80000 : SNIPER_COMMAND_TIMEOUT_MS
      );
      const queueWaitMs = Math.max(0, sniperBusyUntil - Date.now());

      if (queueWaitMs > SNIPER_QUEUE_WAIT_LIMIT_MS) {
        await interaction.editReply(
          "## Market Sniper cooling down\n" +
          `Try again in about **${Math.ceil(queueWaitMs / 1000)}s**. Roblox catalog searches are rate-sensitive.`
        );
        return;
      }

      if (queueWaitMs > 0) {
        await interaction.editReply(
          "## Market Sniper queued\n" +
          `Waiting **${Math.ceil(queueWaitMs / 1000)}s** so Roblox does not block the catalog scan.`
        );
        await wait(queueWaitMs);
      }

      sniperBusyUntil = Date.now() + Math.max(5000, Math.min(60000, sniperTimeoutMs));

      await interaction.editReply(
        (limitedOnly ? "## Limited Sniper\n" : "## Market Sniper\n") +
        "Scanning public catalog signals. This can take a moment..."
      );

      try {
        const startedAt = Date.now();
        const scanKey = sniperScanKey({ window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly });
        console.log(`[${limitedOnly ? "limited_sniper" : "sniper"}] start user=${interaction.user.id} window=${window} category=${category} min=${minPrice ?? ""} max=${maxPrice ?? ""} age=${maxAgeDays ?? ""} results=${resultCount} depth=${depth}`);
        const candidates = await runSniperScanOnce(scanKey, () =>
          fetchSniperCandidates({
            window,
            category,
            keyword,
            minPrice,
            maxPrice,
            maxAgeDays,
            limit: resultCount,
            depth,
            limitedOnly,
            deadlineAt: Date.now() + sniperTimeoutMs,
          })
        );
        console.log(`[${limitedOnly ? "limited_sniper" : "sniper"}] candidates=${candidates.length} elapsedMs=${Date.now() - startedAt} debug=${JSON.stringify({
          fromCache: lastSniperDebug?.fromCache,
          staleCache: lastSniperDebug?.staleCache,
          rawRows: lastSniperDebug?.rawRows,
          uniqueRows: lastSniperDebug?.uniqueRows,
          rejected: lastSniperDebug?.rejected,
          candidates: lastSniperDebug?.candidates,
          elapsedMs: lastSniperDebug?.elapsedMs,
        })}`);

        if (!candidates.length) {
          await interaction.editReply(
            "## No sniper candidates found\n" +
            "No charge was deducted. Try a broader category, remove the keyword, or change the price range."
          );
          if (userIsAdmin(interaction)) {
            await interaction.followUp({
              content:
                "## Admin diagnostic\n" +
                "No catalog rows survived the sniper search/fallback pipeline.\n" +
                "```json\n" +
                `${JSON.stringify(lastSniperDebug, null, 2).slice(0, 1800)}\n` +
                "```",
              flags: 64,
            }).catch(() => {});
          }
          return;
        }

        const selectedCandidates = pickSniperCandidates(candidates, interaction.user.id, resultCount);
        markSniperCandidatesSeen(interaction.user.id, selectedCandidates);

        await sendSniperReport(
          interaction,
          formatSniperReport({
            candidates: selectedCandidates,
            quote,
            window,
            category,
            keyword,
            minPrice,
            maxPrice,
            maxAgeDays,
            depth,
            limitedOnly,
            debug: lastSniperDebug,
          })
        );
      } catch (err) {
        console.error(err);
        const scanKey = sniperScanKey({ window, category, keyword, minPrice, maxPrice, maxAgeDays, depth, limitedOnly });
        const staleCandidates = getSniperCachedCandidates(scanKey, SNIPER_CATALOG_STALE_CACHE_TTL_MS);
        if (staleCandidates?.length) {
          lastSniperDebug = {
            ...(lastSniperDebug || {}),
            fromCache: true,
            staleCache: true,
            partial: true,
            partialReason: String(err.message || err).slice(0, 300),
            candidates: staleCandidates.length,
          };
          const selectedCandidates = pickSniperCandidates(staleCandidates, interaction.user.id, resultCount);
          markSniperCandidatesSeen(interaction.user.id, selectedCandidates);
          await sendSniperReport(
            interaction,
            formatSniperReport({
              candidates: selectedCandidates,
              quote,
              window,
              category,
              keyword,
              minPrice,
              maxPrice,
              maxAgeDays,
              depth,
              limitedOnly,
              debug: lastSniperDebug,
            })
          );
          return;
        }

        await interaction.editReply(
          "## Market Sniper unavailable\n" +
          "No charge was deducted. Roblox may be rate-limiting catalog data right now. Try again later."
        );

        if (userIsAdmin(interaction)) {
          await interaction.followUp({
            content:
              "## Admin diagnostic\n" +
              `\`\`\`\n${String(err.message || err).slice(0, 1500)}\n\`\`\``,
            flags: 64,
          }).catch(() => {});
        }
      }
      return;
    }

    if (interaction.commandName === "bulk_steal_clothing") {
      await interaction.deferReply();

      const bulkLimit = bulkClothingLimitFor(interaction);
      const ids = parseBulkClothingIds(interaction.options.getString("ids")).slice(0, bulkLimit);

      if (!ids.length) {
        await interaction.editReply(`## No valid clothing IDs found\nSend up to ${bulkLimit} IDs or links separated by space or comma.`);
        return;
      }

      const usedBefore = walletClothingUsage(interaction.user.id).count;
      const maxQuote = calculateBulkClothingCopyPrice(interaction, ids.length, usedBefore);
      const balanceBefore = walletAvailableBalance(interaction.user.id, "clothing");

      if (balanceBefore < maxQuote.walletAmount) {
        await interaction.editReply(
          `## Insufficient Balance\n` +
          `**Service:** Bulk clothing template copy\n` +
          `${formatBulkClothingAllowance(maxQuote)}\n` +
          `**Maximum price:** ${formatTokenAmount(maxQuote.walletAmount)}\n` +
          `**Your balance:** ${formatTokenAmount(balanceBefore)}\n\n` +
          "Use `/buy` to add Service Credits."
        );
        return;
      }

      await interaction.editReply(
        `## Bulk Clothing Copy\n` +
        `${formatBulkClothingAllowance(maxQuote)}\n` +
        `**Maximum price:** ${formatTokenAmount(maxQuote.walletAmount)}\n\n` +
        "Preparing templates..."
      );

      const results = [];
      const failures = [];

      for (const id of ids) {
        try {
          const result = await downloadClassicClothingTemplate(id);
          results.push(result);
        } catch (err) {
          console.error(`Bulk clothing failed for ${id}:`, err);
          failures.push({ id, error: String(err.message || err).slice(0, 180) });
        }

        if (id !== ids[ids.length - 1]) {
          await wait(BULK_ITEM_DELAY_MS);
        }
      }

      if (!results.length) {
        await interaction.editReply(
          "## No clothing templates copied\n" +
          "No charge was deducted. Check the IDs or wait a few minutes if Roblox is rate-limiting downloads."
        );

        if (userIsAdmin(interaction) && failures.length) {
          await interaction.followUp({
            content:
              "## Admin diagnostic\n" +
              `\`\`\`\n${failures.map(item => `${item.id}: ${item.error}`).join("\n").slice(0, 1800)}\n\`\`\``,
            flags: 64,
          }).catch(() => {});
        }
        return;
      }

      const finalQuote = calculateBulkClothingCopyPrice(interaction, results.length, usedBefore);
      const debit = removeWalletBalance({
        userId: interaction.user.id,
        amount: finalQuote.walletAmount,
        actorId: client.user.id,
        reason: "Bulk classic clothing templates copied",
        meta: {
          command: "bulk_steal_clothing",
          serviceKey: "clothing",
          requestedIds: ids,
          copiedIds: results.map(item => item.catalogId),
          failedIds: failures.map(item => item.id),
          priceTokens: finalQuote.walletAmount,
        },
      });
      const usage = addClothingUsage(interaction.user.id, results.length);
      const displayQuote = {
        ...finalQuote,
        usedToday: usage.count,
        freeRemaining: finalQuote.dailyLimit === null ? null : Math.max(finalQuote.dailyLimit - usage.count, 0),
      };
      const files = results.map(item => publicImageAttachment(item.filePath, `${item.catalogId}_template.png`));
      const resetActions = results.map(result =>
        createClothingTemplateAction({ userId: interaction.user.id, result, source: "bulk" })
      );
      const summary = results
        .slice(0, 12)
        .map((item, index) => `**${index + 1}.** \`${item.catalogId}\` - ${item.typeLabel}`)
        .join("\n");

      await interaction.editReply({
        content:
          `## Bulk Clothing Templates Copied\n` +
          `**Copied:** ${results.length}/${ids.length}\n` +
          `**Failed:** ${failures.length}\n` +
          `${formatBulkClothingAllowance(displayQuote)}\n` +
          `**Price:** ${formatTokenAmount(finalQuote.walletAmount)}\n` +
          `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
          `${summary}\n\n` +
          "Use the matching **Reset** button to receive that template with the visible guide on top.",
        files: files.slice(0, 10),
        components: clothingResetButtonRows(resetActions.slice(0, 10), 0),
      });

      for (let index = 10; index < files.length; index += 10) {
        await interaction.followUp({
          content: `More clothing templates (${index + 1}-${Math.min(index + 10, files.length)}):`,
          files: files.slice(index, index + 10),
          components: clothingResetButtonRows(resetActions.slice(index, index + 10), index),
        }).catch(() => {});
      }

      if (failures.length) {
        await interaction.followUp({
          content:
            "## Some templates were not copied\n" +
            failures.map(item => `\`${item.id}\` - ${item.error}`).join("\n").slice(0, 1800),
          flags: userIsAdmin(interaction) ? 64 : undefined,
        }).catch(() => {});
      }

      return;
    }

    if (interaction.commandName === "copiar" || interaction.commandName === "steal") {
      const lang = languageFor(interaction);
      const id = interaction.options.getString("id").trim();
      await interaction.deferReply();
      const target = await classifyStealTarget(id);

      if (target.kind === "clothing") {
        await handleClassicClothingSteal(interaction, id, interaction.commandName);
        return;
      }

      const quote = calculateCopyPrice(interaction);
      const allowanceText = formatCopyAllowance(quote, lang);
      const balanceBefore = walletAvailableBalance(interaction.user.id, "copy");

      if (balanceBefore < quote.walletAmount) {
        await interaction.editReply({
          content: lang === "pt-BR"
            ? `## ⚠️ Saldo insuficiente\n` +
              `**Serviço:** Copiar asset original\n` +
              `${allowanceText}\n` +
              `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
              `**Seu saldo:** ${formatTokenAmount(balanceBefore)}\n\n` +
              "Use `/buy` para adicionar Service Credits."
            : lang === "es"
              ? `## ⚠️ Saldo insuficiente\n` +
                `**Servicio:** Copiar asset original\n` +
                `${allowanceText}\n` +
                `**Precio:** ${formatTokenAmount(quote.walletAmount)}\n` +
                `**Tu saldo:** ${formatTokenAmount(balanceBefore)}\n\n` +
                "Usa `/buy` para agregar Service Credits."
              : `## ⚠️ Insufficient Balance\n` +
                `**Service:** Copy original asset\n` +
                `${allowanceText}\n` +
                `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
                `**Your balance:** ${formatTokenAmount(balanceBefore)}\n\n` +
                "Use `/buy` to add Service Credits.",
        });
        return;
      }

      await interaction.editReply(
        lang === "pt-BR"
          ? `## 📎 Copiar Asset\n` +
            `**UGC:** \`${id}\`\n` +
            `${allowanceText}\n` +
            `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n\n` +
            "⏳ Preparando arquivos originais..."
          : lang === "es"
            ? `## 📎 Copiar Asset\n` +
              `**UGC:** \`${id}\`\n` +
              `${allowanceText}\n` +
              `**Precio:** ${formatTokenAmount(quote.walletAmount)}\n\n` +
              "⏳ Preparando archivos originales..."
            : `## 📎 Copy Asset\n` +
              `**UGC:** \`${id}\`\n` +
              `${allowanceText}\n` +
              `**Price:** ${formatTokenAmount(quote.walletAmount)}\n\n` +
              "⏳ Preparing original files..."
      );

      try {
        const result = await processUGC(id, { render: false });
        const files = [
          result.glbPath,
          result.objPath,
          result.rbxmPath,
          result.hasTexture ? result.texturePath : null,
        ];

        const debit = removeWalletBalance({
          userId: interaction.user.id,
          amount: quote.walletAmount,
          actorId: client.user.id,
          reason: "Copia de modelo original",
          meta: { command: "copiar", serviceKey: "copy", ugcId: id, priceBrl: quote.price },
        });
        const usage = addCopyUsage(interaction.user.id, 1);
        const finalQuote = calculateCopyPrice(interaction, usage.count);

        await interaction.editReply({
          content: lang === "pt-BR"
            ? `## ✅ Asset copiado\n` +
              `**UGC:** \`${id}\`\n` +
              `${formatCopyAllowance(finalQuote, lang)}\n` +
              `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
              `**Saldo restante:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
              "📦 Arquivos originais anexados abaixo."
            : lang === "es"
              ? `## ✅ Asset copiado\n` +
                `**UGC:** \`${id}\`\n` +
                `${formatCopyAllowance(finalQuote, lang)}\n` +
                `**Precio:** ${formatTokenAmount(quote.walletAmount)}\n` +
                `**Saldo restante:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
                "📦 Archivos originales adjuntos abajo."
              : `## ✅ Asset Copied\n` +
                `**UGC:** \`${id}\`\n` +
                `${formatCopyAllowance(finalQuote, lang)}\n` +
                `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
                `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
                "📦 Original files are attached below.",
          files: attachmentsFromPaths(files).slice(0, 10),
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply(lang === "pt-BR"
          ? "## ⚠️ Não consegui copiar este asset\nA equipe pode revisar este ID manualmente."
          : lang === "es"
            ? "## ⚠️ No pude copiar este asset\nEl equipo puede revisar este ID manualmente."
            : "## ⚠️ I could not copy this asset\nThe team can review this ID manually.");
      }
      return;
    }

    if (interaction.commandName === "bulk_steal") {
      const bulkLimit = bulkAssetLimitFor(interaction);
      const ids = parseBulkIds(interaction.options.getString("ids")).slice(0, bulkLimit);

      if (!ids.length) {
        await interaction.reply({
          content: `## No valid IDs found\nSend up to ${bulkLimit} UGC IDs separated by space or comma.`,
          flags: 64,
        });
        return;
      }

      const usedBefore = walletCopyUsage(interaction.user.id).count;
      const quotes = ids.map((_, index) => calculateCopyPrice(interaction, usedBefore + index));
      const totalWalletAmount = quotes.reduce((sum, quote) => sum + quote.walletAmount, 0);
      const balanceBefore = walletAvailableBalance(interaction.user.id, "copy");
      const planLabel = quotes[0]?.planLabel || "Free";

      if (balanceBefore < totalWalletAmount) {
        await interaction.reply({
          content:
            `## Insufficient Balance\n` +
            `**Service:** Bulk asset copy\n` +
            `**Plan:** ${planLabel}\n` +
            `**Bulk amount:** ${ids.length}/${bulkLimit}\n` +
            `**Maximum price:** ${formatTokenAmount(totalWalletAmount)}\n` +
            `**Your balance:** ${formatTokenAmount(balanceBefore)}\n\n` +
            "Use `/buy` to add Service Credits.",
          flags: 64,
        });
        return;
      }

      await interaction.reply(
        `## Bulk Copy Started\n` +
        `**Plan:** ${planLabel}\n` +
        `**Assets:** ${ids.length}/${bulkLimit}\n` +
        `**Estimated price:** ${formatTokenAmount(totalWalletAmount)}\n` +
        `**Pace:** one item every ${Math.ceil(BULK_ITEM_DELAY_MS / 1000)}s\n\n` +
        "I will send each asset as soon as it is ready."
      );

      const results = [];
      let charged = 0;

      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        try {
          await interaction.followUp(`Preparing \`${id}\`...`).catch(() => {});
          const result = await processUGC(id, { render: false });
          const files = [
            result.glbPath,
            result.objPath,
            result.rbxmPath,
            result.hasTexture ? result.texturePath : null,
          ];

          await interaction.followUp({
            content: `## Asset Copied\n**UGC:** \`${id}\``,
            files: attachmentsFromPaths(files).slice(0, 10),
          });

          const itemQuote = calculateCopyPrice(interaction);
          if (itemQuote.walletAmount > 0) {
            const debit = removeWalletBalance({
              userId: interaction.user.id,
              amount: itemQuote.walletAmount,
              actorId: client.user.id,
              reason: "Bulk original asset copied",
              meta: {
                command: "bulk_steal",
                serviceKey: "copy",
                ugcId: id,
                priceTokens: itemQuote.walletAmount,
              },
            });
            if (debit.ok) charged += itemQuote.walletAmount;
          }

          addCopyUsage(interaction.user.id, 1);
          results.push({ id, ok: true });
        } catch (err) {
          console.error(err);
          await interaction.followUp(`I could not copy \`${id}\`.`).catch(() => {});
          results.push({ id, ok: false });
        }

        if (index < ids.length - 1) {
          await wait(BULK_ITEM_DELAY_MS);
        }
      }

      await interaction.followUp(
        `## Bulk Copy Finished\n` +
        `**Success:** ${results.filter(item => item.ok).length}/${results.length}\n` +
        `**Charged:** ${formatTokenAmount(charged)}\n` +
        `**Remaining balance:** ${formatTokenAmount(walletBalance(interaction.user.id))}\n` +
        `**Failed:** ${results.filter(item => !item.ok).map(item => `\`${item.id}\``).join(", ") || "none"}`
      ).catch(() => {});
      return;
    }

    if (interaction.commandName === "bulk_steal") {
      if (!userHasPremiumAccess(interaction) && !userIsAdmin(interaction)) {
        await interaction.reply({
          content: "## 🔒 Premium / Elite only\nBulk copy is available for Premium and Elite members.",
          flags: 64,
        });
        return;
      }

      const ids = parseBulkIds(interaction.options.getString("ids"));

      if (!ids.length) {
        await interaction.reply({ content: "## ⚠️ No valid IDs found", flags: 64 });
        return;
      }

      await interaction.reply(
        `## 📦 Bulk Copy Started\n` +
        `**Assets:** ${ids.length}/10\n` +
        `**Price:** Free for Premium and Elite\n\n` +
        "I will send each asset as soon as it is ready."
      );

      const results = [];

      for (const id of ids) {
        try {
          await interaction.followUp(`⏳ Preparing \`${id}\`...`).catch(() => {});
          const result = await processUGC(id, { render: false });
          const files = [
            result.glbPath,
            result.objPath,
            result.rbxmPath,
            result.hasTexture ? result.texturePath : null,
          ];

          await interaction.followUp({
            content: `## ✅ Asset Copied\n**UGC:** \`${id}\``,
            files: attachmentsFromPaths(files).slice(0, 10),
          });
          results.push({ id, ok: true });
        } catch (err) {
          console.error(err);
          await interaction.followUp(`⚠️ I could not copy \`${id}\`.`).catch(() => {});
          results.push({ id, ok: false });
        }
      }

      await interaction.followUp(
        `## ✅ Bulk Copy Finished\n` +
        `**Success:** ${results.filter(item => item.ok).length}/${results.length}\n` +
        `**Failed:** ${results.filter(item => !item.ok).map(item => `\`${item.id}\``).join(", ") || "none"}`
      ).catch(() => {});
      return;
    }

    if (interaction.commandName === "admin_views_full") {
      const id = interaction.options.getString("id").trim();
      const renderSettings = renderSettingsForInteraction(interaction);
      await interaction.deferReply({ flags: 64 });

      try {
        await interaction.editReply(
          "## Admin Full View Render\n" +
          `**UGC:** \`${id}\`\n\n` +
          `**Render settings:**\n${renderSettingsSummary(renderSettings)}\n\n` +
          "Rendering 10 reference angles..."
        );

        const result = await processUGC(id, {
          exportGlb: false,
          render: true,
          cacheViews: false,
          renderSettings,
        });
        const files = fullUgcViewAttachments(result.renderDir);

        await interaction.editReply({
          content:
            "## Admin Full Views Ready\n" +
            `**UGC:** \`${id}\`\n` +
            `**MeshId:** \`${result.meshId}\`\n` +
            `**TextureId:** \`${result.textureId || "not found"}\`\n\n` +
            "**Angles:** Front Left, Front, Front Right, Left, Up, Right, Back Left, Back, Back Right, Down\n\n" +
            `**Render settings:**\n${renderSettingsSummary(renderSettings)}`,
          files,
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply(
          "## Full View Rendering Failed\n" +
          "I could not render this full angle set. Check the ID or server logs."
        );
      }
      return;
    }

    if (interaction.commandName === "admin_bulk_views") {
      const ids = parseBulkIds(interaction.options.getString("ids")).slice(0, 10);
      const renderSettings = renderSettingsForInteraction(interaction);

      if (!ids.length) {
        await interaction.reply({ content: "## No valid IDs found", flags: 64 });
        return;
      }

      await interaction.reply(
        "## Admin Bulk Views Started\n" +
        `**UGCs:** ${ids.length}/10\n\n` +
        `**Render settings:**\n${renderSettingsSummary(renderSettings)}\n\n` +
        "I will send each rendered view set as soon as it is ready."
      );

      const results = [];

      for (const id of ids) {
        try {
          await interaction.followUp(`Rendering views for \`${id}\`...`).catch(() => {});

          const result = await processUGC(id, {
            exportGlb: false,
            render: true,
            cacheViews: true,
            renderSettings,
          });
          const files = ugcViewAttachments(result.renderDir);

          await interaction.followUp({
            content:
              "## UGC Views Ready\n" +
              `**UGC:** \`${id}\`\n` +
              `**MeshId:** \`${result.meshId}\`\n` +
              `**TextureId:** \`${result.textureId || "not found"}\`\n` +
              (result.cached ? "\n**Source:** cached render" : ""),
            files,
          });

          results.push({ id, ok: true });
        } catch (err) {
          console.error(err);
          await interaction.followUp(`I could not render views for \`${id}\`.`).catch(() => {});
          results.push({ id, ok: false });
        }
      }

      await interaction.followUp(
        "## Admin Bulk Views Finished\n" +
        `**Success:** ${results.filter(item => item.ok).length}/${results.length}\n` +
        `**Failed:** ${results.filter(item => !item.ok).map(item => `\`${item.id}\``).join(", ") || "none"}`
      ).catch(() => {});
      return;
    }

    if (interaction.commandName === "model_views") {
      const model = interaction.options.getAttachment("model");
      const renderSettings = renderSettingsForInteraction(interaction);
      const angleSet = interaction.options.getString("angles") || "multiview4";
      const ext = path.extname(model?.name || "").toLowerCase();
      const supportedModelExts = new Set([".glb", ".gltf", ".obj", ".fbx"]);

      if (!model || !supportedModelExts.has(ext)) {
        await interaction.reply({
          content: "## Unsupported Model File\nUpload a `.glb`, `.gltf`, `.obj` or `.fbx` file. Prefer `.glb` when possible because it keeps textures packed.",
          flags: 64,
        });
        return;
      }

      if (Number(model.size || 0) > DISCORD_MAX_ATTACHMENT_BYTES) {
        await interaction.reply({
          content:
            "## Model Too Large\n" +
            `This file is ${formatBytes(model.size)}. The current safe limit is ${formatBytes(DISCORD_MAX_ATTACHMENT_BYTES)}.`,
          flags: 64,
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const tempDir = path.join(__dirname, "temp", "refazer", `model-views-${interaction.id}`);
        const inputDir = path.join(tempDir, "input");
        fs.mkdirSync(inputDir, { recursive: true });
        const safeBase = path.basename(model.name || `model${ext}`).replace(/[^\w.-]+/g, "_");
        const modelPath = await downloadAttachmentToFile(model, path.join(inputDir, safeBase));

        await interaction.editReply(
          "## Rendering Uploaded Model\n" +
          `**File:** \`${safeBase}\`\n` +
          `**Angles:** ${angleSet}\n\n` +
          `**Render settings:**\n${renderSettingsSummary(renderSettings)}`
        );

        const renderDir = await renderImages(modelPath, "", tempDir, renderSettings);
        const files = angleSet === "full10"
          ? fullUgcViewAttachments(renderDir)
          : angleSet === "blender5"
            ? aiFiveViewAttachments(renderDir)
            : ugcViewAttachments(renderDir);

        await interaction.editReply({
          content:
            "## Model Views Ready\n" +
            `**File:** \`${safeBase}\`\n\n` +
            `**Render settings:**\n${renderSettingsSummary(renderSettings)}\n\n` +
            (angleSet === "full10"
              ? "Full 10-view Blender set ready."
              : angleSet === "blender5"
                ? "5-view Blender set ready. Use front, right, back and left for `/multiview`; keep the top view as extra reference context."
                : "Use these four images as references for `/multiview`."),
          files,
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply(
          "## Model View Rendering Failed\n" +
          "I could not render this uploaded model. Prefer `.glb` and check whether the file opens correctly in Blender."
        ).catch(() => {});

        if (userIsAdmin(interaction)) {
          await interaction.followUp({
            content:
              "## Admin diagnostic\n" +
              `\`\`\`\n${String(err.message || err).slice(0, 1500)}\n\`\`\``,
            flags: 64,
          }).catch(() => {});
        }
      }
      return;
    }

    if (interaction.commandName === "views" || interaction.commandName === "views_custom") {
      const id = interaction.options.getString("id").trim();
      const lang = languageFor(interaction);
      const renderSettings = renderSettingsForInteraction(interaction);
      const angleSet = interaction.commandName === "views"
        ? (interaction.options.getString("angles") || "multiview4")
        : "multiview4";
      const useAiFiveViews = angleSet === "ai5";

      if (useAiFiveViews && !userIsAdmin(interaction)) {
        await interaction.reply({
          content: lang === "pt-BR"
            ? "## Apenas admins\n" +
              "O conjunto Blender com 5 views está disponível apenas para admins por enquanto.\n\n" +
              "Use o conjunto padrão com 4 views no `/multiview`."
            : lang === "es"
              ? "## Solo admins\n" +
                "El conjunto Blender de 5 vistas está disponible solo para admins por ahora.\n\n" +
                "Usa el conjunto estándar de 4 vistas en `/multiview`."
              : "## Admin Only\n" +
                "The 5-view Blender reference set is available only to admins right now.\n\n" +
                "Use the default 4-view set for `/multiview`.",
          flags: 64,
        });
        return;
      }

      await interaction.deferReply();

      try {
        const angleDescription = useAiFiveViews
          ? (lang === "pt-BR"
            ? "imagens de referência de frente, direita, costas, esquerda e cima"
            : lang === "es"
              ? "imagenes de referencia de frente, derecha, atras, izquierda y arriba"
              : "front, right, back, left and up reference images")
          : (lang === "pt-BR"
            ? "imagens de referência de frente, direita, costas e esquerda"
            : lang === "es"
              ? "imagenes de referencia de frente, derecha, atras e izquierda"
              : "front, right, back and left reference images");

        await interaction.editReply(
          (lang === "pt-BR"
            ? "## Renderizando views do UGC\n"
            : lang === "es"
              ? "## Renderizando vistas del UGC\n"
              : "## Rendering UGC Views\n") +
          `**UGC:** \`${id}\`\n\n` +
          `**${lang === "pt-BR" ? "Configurações de render" : lang === "es" ? "Configuracion de render" : "Render settings"}:**\n${renderSettingsSummary(renderSettings, lang)}\n\n` +
          `${lang === "pt-BR" ? "Preparando" : lang === "es" ? "Preparando" : "Preparing"} ${angleDescription}...`
        );

        const result = await processUGC(id, {
          exportGlb: false,
          render: true,
          cacheViews: !useAiFiveViews,
          renderSettings,
        });
        const files = useAiFiveViews
          ? aiFiveViewAttachments(result.renderDir)
          : ugcViewAttachments(result.renderDir);

        await interaction.editReply({
          content:
            (lang === "pt-BR"
              ? "## Views do UGC prontas\n"
              : lang === "es"
                ? "## Vistas del UGC listas\n"
                : "## UGC Views Ready\n") +
            `**UGC:** \`${id}\`\n` +
            `**MeshId:** \`${result.meshId}\`\n` +
            `**TextureId:** \`${result.textureId || "not found"}\`\n\n` +
            `**${lang === "pt-BR" ? "Configurações de render" : lang === "es" ? "Configuracion de render" : "Render settings"}:**\n${renderSettingsSummary(renderSettings, lang)}\n\n` +
            (result.cached
              ? `**${lang === "pt-BR" ? "Fonte" : lang === "es" ? "Fuente" : "Source"}:** ${lang === "pt-BR" ? "render em cache" : lang === "es" ? "render en cache" : "cached render"}\n\n`
              : "") +
            (useAiFiveViews
              ? (lang === "pt-BR"
                ? "Conjunto Blender admin com 5 views pronto. Use frente, direita, costas e esquerda no `/multiview`; mantenha a view de cima como contexto extra."
                : lang === "es"
                  ? "Conjunto Blender admin con 5 vistas listo. Usa frente, derecha, atras e izquierda en `/multiview`; guarda la vista superior como contexto extra."
                  : "Admin 5-view Blender set ready. Use front, right, back and left for `/multiview`; keep the top view as extra reference context.")
              : (lang === "pt-BR"
                ? "Use estas quatro imagens como referências no `/multiview`."
                : lang === "es"
                  ? "Usa estas cuatro imagenes como referencias en `/multiview`."
                  : "Use these four images as references for `/multiview`.")),
          files,
        });
      } catch (err) {
        console.error(err);
        const errorMessage = String(err.message || err);
        const publicReason = errorMessage.includes("Nao tenho permissao")
          ? (lang === "pt-BR"
            ? "Não tenho permissão para acessar este item do Roblox. Ele pode estar privado, restrito, moderado ou indisponível para o cookie atual."
            : lang === "es"
              ? "No tengo permiso para acceder a este item de Roblox. Puede estar privado, restringido, moderado o no disponible para la cookie actual."
              : "I do not have permission to access this Roblox item. It may be private, restricted, moderated, or unavailable to the current Roblox cookie.")
          : errorMessage.includes("rate-limiting") || errorMessage.includes("429")
            ? (lang === "pt-BR"
              ? "O Roblox está limitando requisições agora. Aguarde alguns minutos e tente novamente."
              : lang === "es"
                ? "Roblox está limitando las solicitudes ahora. Espera unos minutos e intenta de nuevo."
                : "Roblox is rate-limiting requests right now. Wait a few minutes and try again.")
            : (lang === "pt-BR"
              ? "Não consegui renderizar este UGC. Confira se o ID é válido, público e suportado."
              : lang === "es"
                ? "No pude renderizar este UGC. Verifica si el ID es valido, publico y compatible."
                : "I could not render this UGC. Check if the ID is valid, public, and supported.");

        await interaction.editReply(
          (lang === "pt-BR"
            ? "## Falha ao renderizar views\n"
            : lang === "es"
              ? "## Error al renderizar vistas\n"
              : "## View Rendering Failed\n") +
          publicReason
        );

        if (userIsAdmin(interaction)) {
          await interaction.followUp({
            content:
              "## Admin diagnostic\n" +
              `\`\`\`\n${String(err.stack || err.message || err).slice(0, 1800)}\n\`\`\``,
            flags: 64,
          }).catch(() => {});
        }
      }
      return;
    }

    if (interaction.commandName === "bulk_remake") {
      if (!userHasPremiumAccess(interaction) && !userIsAdmin(interaction)) {
        await interaction.reply({
          content: "## 🔒 Premium / Elite only\nBulk remake is available for Premium and Elite members.",
          flags: 64,
        });
        return;
      }

      const ids = parseBulkIds(interaction.options.getString("ids")).slice(0, 10);

      if (!ids.length) {
        await interaction.reply({ content: "## ⚠️ No valid IDs found", flags: 64 });
        return;
      }

      const texture = normalizeTextureOption(interaction.options.getString("texture") || "standard");
      const enhancement = interaction.options.getString("enhancement") || "none";
      const triangles = interaction.options.getInteger("triangles") || ROBLOX_SAFE_TRIANGLE_LIMIT;
      const singleQuote = calculatePrice(interaction, {
        mode: "single",
        texture,
        triangles,
        enhancement,
      });
      const total = singleQuote.walletAmount * ids.length;

      await interaction.reply({
        content:
          `## 🧾 Bulk Remake Request\n` +
          `**Assets:** ${ids.length}/10\n` +
          `**Estimated total:** ${formatTokenAmount(total)}\n` +
          `**Per asset:** ${formatTokenAmount(singleQuote.walletAmount)}\n\n` +
          `IDs:\n${ids.map(id => `- \`${id}\``).join("\n")}\n\n` +
          "Bulk remake is prepared as a controlled request for now, so the team can approve before spending generation credits.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "generate_image") {
      await interaction.deferReply();

      const prompt = interaction.options.getString("prompt").trim();
      const quality = interaction.options.getString("quality") || "standard";
      const resolution = interaction.options.getString("resolution") || "1K";
      const aspectRatio = interaction.options.getString("aspect_ratio") || "1:1";
      const quote = calculateImageGenerationPrice(interaction, { quality, resolution });
      const { enhancementConfig, resolutionConfig, price } = quote;

      if (!GEMINI_API_KEY || !enhancementConfig.model) {
        await interaction.editReply("## Image generation unavailable\nThis service is not configured yet.");
        return;
      }

      if (quality === "economy" && resolution !== "1K") {
        await interaction.editReply(
          "## Resolution unavailable\n" +
          "Economy image generation supports 1K only. Choose Standard or Premium for 2K/4K."
        );
        return;
      }

      if (!IMAGE_ASPECT_RATIOS.has(aspectRatio)) {
        await interaction.editReply("## Invalid aspect ratio\nChoose one of the available image shapes.");
        return;
      }

      const balanceBefore = walletAvailableBalance(interaction.user.id, "image");
      if (balanceBefore < price) {
        await interaction.editReply(formatInsufficientBalanceMessage({
          service: "Reference image generation",
          price,
          balance: balanceBefore,
          language: languageFor(interaction),
        }));
        return;
      }

      const tempDir = path.join(__dirname, "temp", "refazer", `image-${interaction.id}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const imagePath = path.join(tempDir, "velvet_image.jpg");

      try {
        await interaction.editReply("## Generating Reference Image\nYour image is being prepared...");
        await generateImageWithGemini({
          prompt,
          outputPath: imagePath,
          model: enhancementConfig.model,
          imageSize: resolution,
          aspectRatio,
        });

        const debit = removeWalletBalance({
          userId: interaction.user.id,
          amount: price,
          actorId: client.user.id,
          reason: "Reference image generated",
            meta: { command: "generate_image", serviceKey: "image", quality, resolution, aspectRatio },
        });

        await interaction.editReply({
          content:
            "## Reference Image Ready\n" +
            `**Plan:** ${quote.planLabel}\n` +
            `**Quality:** ${enhancementConfig.label}\n` +
            `**Resolution:** ${resolutionConfig.label}\n` +
            `**Aspect ratio:** ${aspectRatio}\n` +
            (quote.discountTokens > 0 ? `**Plan discount:** -${formatTokenAmount(quote.discountTokens)}\n` : "") +
            `**Price:** ${formatTokenAmount(price)}\n` +
            `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
            "You can use this image with `/remake` as inspiration, or with `/multiview` if you generate the needed views.",
          files: [publicImageAttachment(imagePath)],
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply("## Image generation failed\nNo charge was deducted because no image was delivered.");
      }
      return;
    }

    if (interaction.commandName === "enhance_images") {
      await interaction.deferReply();

      const requestedQuality = interaction.options.getString("quality") || "economy";
      const quality = requestedQuality === "none" ? "economy" : requestedQuality;
      const enhancementConfig = IMAGE_ENHANCEMENTS[quality] || IMAGE_ENHANCEMENTS.standard;
      const attachments = {
        frente: interaction.options.getAttachment("front"),
        direita: interaction.options.getAttachment("right"),
        costas: interaction.options.getAttachment("back"),
        esquerda: interaction.options.getAttachment("left"),
      };
      const selectedEntries = Object.entries(attachments).filter(([, attachment]) => Boolean(attachment));

      if (!selectedEntries.length) {
        await interaction.editReply("## No images found\nAttach at least one reference image.");
        return;
      }

      if (quality !== "economy") {
        await interaction.editReply(
          "## Clean Local Only\n" +
          "Reference enhancement now uses only the safe local cleanup mode. Please run `/enhance_images` again with **Clean Local**."
        );
        return;
      }

      const quote = calculateImageEnhancementPrice(interaction, {
        quality,
        count: selectedEntries.length,
      });
      const expectedPrice = qualityUsesAiEnhancement(quality)
        ? quote.price
        : localCleanupPriceForPlan(quote.plan, selectedEntries.length);
      const balanceBefore = walletAvailableBalance(interaction.user.id, "enhancement");

      if (balanceBefore < expectedPrice) {
        await interaction.editReply(formatInsufficientBalanceMessage({
          service: "Reference image enhancement",
          price: expectedPrice,
          balance: balanceBefore,
          language: languageFor(interaction),
        }));
        return;
      }

      const tempDir = path.join(__dirname, "temp", "refazer", `enhance-images-${interaction.id}`);
      const inputDir = path.join(tempDir, "enhance_inputs");
      fs.mkdirSync(inputDir, { recursive: true });

      const viewPaths = {};

      try {
        await interaction.editReply("## Enhancing References\nPreparing your cleaned reference images...");

        for (const [view, attachment] of selectedEntries) {
          const ext = path.extname(attachment.name) || ".png";
          const outputPath = path.join(inputDir, `${view}${ext}`);
          viewPaths[view] = await downloadAttachmentToFile(attachment, outputPath);
        }

        const enhancedDir = path.join(tempDir, "nano_banana_pro");
        fs.mkdirSync(enhancedDir, { recursive: true });
        const orderedViews = MULTIVIEW_VIEW_ORDER.filter(view => viewPaths[view]);
        const failedViews = [];
        const enhancedViews = [];
        const fallbackViews = [];
        const aiFailureReasons = [];
        const useAiEnhancement = qualityUsesAiEnhancement(quality);

        for (const view of orderedViews) {
          if (!useAiEnhancement) {
            try {
              const fallbackPath = await enhanceImageLocally({
                imagePath: viewPaths[view],
                outputPath: path.join(enhancedDir, `${view}_local.png`),
              });
              viewPaths[view] = fallbackPath;
              fallbackViews.push(view);
            } catch (fallbackErr) {
              console.error(`Local enhancement failed for ${view}:`, fallbackErr);
              failedViews.push(view);
            }
            continue;
          }

          try {
            const inputPath = viewPaths[view];
            const outputPath = path.join(enhancedDir, `${view}.jpg`);
            const savedPath = await enhanceImageWithGeminiFallbacks({
              imagePath: inputPath,
              outputPath,
              model: enhancementConfig.model,
            });
            viewPaths[view] = savedPath;
            enhancedViews.push(view);
          } catch (err) {
            console.error(`Enhancement failed for ${view}:`, err);
            aiFailureReasons.push(`${view}: ${String(err.message || err).slice(0, 900)}`);
            try {
              const fallbackPath = await enhanceImageLocally({
                imagePath: viewPaths[view],
                outputPath: path.join(enhancedDir, `${view}_local.png`),
              });
              viewPaths[view] = fallbackPath;
              fallbackViews.push(view);
            } catch (fallbackErr) {
              console.error(`Local enhancement fallback failed for ${view}:`, fallbackErr);
              failedViews.push(view);
            }
          }
        }

        if (!enhancedViews.length && !fallbackViews.length) {
          await interaction.editReply(
            "## Enhancement failed\n" +
            "The image provider refused these references and local cleanup also failed. No charge was deducted.\n\n" +
            "Use the original files directly in `/multiview`."
          );
          return;
        }

        const finalQuote = calculateImageEnhancementPrice(interaction, {
          quality,
          count: enhancedViews.length,
        });
        const localCleanupPrice = localCleanupPriceForPlan(finalQuote.plan, fallbackViews.length);
        const finalPrice = finalQuote.price + localCleanupPrice;

        const debit = removeWalletBalance({
          userId: interaction.user.id,
          amount: finalPrice,
          actorId: client.user.id,
          reason: "Reference images enhanced",
          meta: {
            command: "enhance_images",
            serviceKey: "enhancement",
            quality,
            imageCount: selectedEntries.length,
            enhancedCount: enhancedViews.length,
            failedViews,
            fallbackViews,
            localCleanupPrice,
          },
        });

        const safeCleanupCount = fallbackViews.length;
        const processedCount = enhancedViews.length + fallbackViews.length;
        const modeLabel = "Clean Local";

        await interaction.editReply({
          content:
            "## Reference Cleanup Ready\n" +
            `**Plan:** ${finalQuote.planLabel}\n` +
            `**Mode:** ${modeLabel}\n` +
            `**Processed:** ${processedCount}/${selectedEntries.length}\n` +
            (safeCleanupCount ? `**Safe cleanup:** ${safeCleanupCount}/${selectedEntries.length}\n` : "") +
            (failedViews.length ? `**Kept original:** ${failedViews.join(", ")}\n` : "") +
            (finalQuote.discountTokens > 0 ? `**Plan discount:** -${formatTokenAmount(finalQuote.discountTokens)}\n` : "") +
            `**Price:** ${formatTokenAmount(finalPrice)}\n` +
            `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
            "Review every side before using it. If a side changed shape, use the original side instead. If all sides look correct, use these files in `/multiview` with **No enhancement**.",
          files: multiviewReviewAttachments(viewPaths),
        });

        if (userIsAdmin(interaction) && aiFailureReasons.length) {
          await interaction.followUp({
            content:
              "## Admin AI Diagnostic\n" +
              `\`\`\`\n${aiFailureReasons.join("\n\n").slice(0, 1800)}\n\`\`\``,
            flags: 64,
          }).catch(() => {});
        }
      } catch (err) {
        console.error(err);
        await interaction.editReply("## Enhancement failed\nNo charge was deducted because no enhanced images were delivered.");
      }
      return;
    }

    if (interaction.commandName === "prompt_model") {
      await interaction.deferReply();

      const prompt = interaction.options.getString("prompt").trim();
      const texture = normalizeTextureOption(interaction.options.getString("texture") || "standard");
      const triangles = interaction.options.getInteger("triangles") || ROBLOX_SAFE_TRIANGLE_LIMIT;
      const textureTone = textureToneForInteraction(interaction);
      const textureAdjustments = textureAdjustmentsForInteraction(interaction);
      const quote = calculatePromptModelPrice(interaction, { texture, triangles });
      const price = quote.walletAmount;

      if (!modelGenerationIsConfigured()) {
        await interaction.editReply("## Model generation unavailable\nThis service is not configured yet.");
        return;
      }

      const balanceBefore = walletAvailableBalance(interaction.user.id, "prompt_model");
      if (balanceBefore < price) {
        await interaction.editReply(formatInsufficientBalanceMessage({
          service: "Prompt model generation",
          price,
          balance: balanceBefore,
          language: languageFor(interaction),
        }));
        return;
      }

      const tempDir = path.join(__dirname, "temp", "refazer", `prompt-model-${interaction.id}`);
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        await interaction.editReply("## Generating Model\nYour prompt is being converted into a 3D model...");

        const onProgress = async ({ status, progress }) => {
          await interaction.followUp(formatGenerationProgress({ status, progress })).catch(() => {});
        };

        let model;
        if (shouldUseHyper3d()) {
          model = await generateWithOfficialHyper3d({
            imagePaths: [],
            prompt,
            texture,
            triangles,
            tempDir,
            textureTone,
            textureAdjustments,
            onProgress,
            mode: "prompt",
          });
        } else if (shouldUseTripo()) {
          model = await generatePromptModelWithOfficialTripo({
            prompt,
            texture,
            triangles,
            tempDir,
            textureTone,
            textureAdjustments,
            onProgress,
          });
        } else {
          throw new Error(`Model provider is not configured: ${activeModelEngineLabel()}`);
        }

        const debit = removeWalletBalance({
          userId: interaction.user.id,
          amount: price,
          actorId: client.user.id,
          reason: "Prompt model generated",
            meta: { command: "prompt_model", serviceKey: "prompt_model", priceTokens: price },
        });

        if (debit.ok && debit.paidWithWallet > 0) {
          creditAffiliateServiceCommission({
            buyerId: interaction.user.id,
            walletAmount: debit.paidWithWallet,
            priceBrl: debit.paidWithWallet / WALLET_TOKENS_PER_BRL,
            source: "prompt_model",
            actorId: client.user.id,
            meta: { mode: "prompt" },
          });
        }

        await interaction.followUp({
          content:
            "## Model Ready\n" +
            `**Plan:** ${quote.planLabel}\n` +
            `${quote.lines.map(line => `**${line}**`).join("\n")}\n` +
            `**Texture tone:** ${textureToneSummary(textureTone)}\n` +
            `**Texture controls:** ${textureAdjustmentsSummary(textureAdjustments)}\n` +
            `**Price:** ${formatTokenAmount(price)}\n` +
            `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}`,
          files: publicModelAttachments(model.modelPaths?.length ? model.modelPaths : [model.modelPath]),
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply("## Model generation failed\nNo charge was deducted because no final model was delivered.");
      }
      return;
    }

    if (interaction.commandName === "image_model") {
      await interaction.deferReply();

      const image = interaction.options.getAttachment("image");
      const texture = normalizeTextureOption(interaction.options.getString("texture") || "standard");
      const triangles = interaction.options.getInteger("triangles") || ROBLOX_SAFE_TRIANGLE_LIMIT;
      const textureTone = explicitTextureToneForInteraction(interaction, "normal");
      const textureAdjustments = explicitTextureAdjustmentsForInteraction(interaction, DEFAULT_TEXTURE_ADJUSTMENTS);
      const useAlpha = interaction.options.getBoolean("alpha") ?? HYPER3D_USE_ORIGINAL_ALPHA;
      const modelQuality = normalizeModelQuality(interaction.options.getString("detail_level") || "medium");
      const prompt = normalizeModelGenerationPrompt(interaction.options.getString("prompt"));
      const qualityConfig = modelQualityConfig(modelQuality);
      const enhancement = "none";
      const advancedTexture = "none";

      if (!modelGenerationIsConfigured()) {
        await interaction.editReply("## Model generation unavailable\nThis service is not configured yet.");
        return;
      }

      const quote = calculatePrice(interaction, {
        mode: "single",
        texture,
        triangles,
        enhancement,
        modelQuality,
        advancedTexture,
      });

      const balanceBefore = walletAvailableBalance(interaction.user.id, "image_model");
      if (balanceBefore < quote.walletAmount) {
        await interaction.editReply(formatInsufficientBalanceMessage({
          service: "Single image AI model",
          price: quote.walletAmount,
          balance: balanceBefore,
          language: languageFor(interaction),
        }));
        return;
      }

      const tempDir = path.join(__dirname, "temp", "refazer", `image-model-${interaction.id}`);
      const inputDir = path.join(tempDir, "image_model_inputs");
      fs.mkdirSync(inputDir, { recursive: true });

      const ext = path.extname(image.name) || ".png";
      const imagePath = await downloadAttachmentToFile(image, path.join(inputDir, `image${ext}`));

      const actionId = createPendingMultiviewAction({
        actionType: "image_model",
        userId: interaction.user.id,
        language: languageFor(interaction),
        imagePaths: [imagePath],
        viewPaths: { frente: imagePath },
        texture,
        enhancement,
        triangles,
        tempDir,
        textureTone,
        textureAdjustments,
        useAlpha,
        modelQuality,
        prompt,
        advancedTexture,
        textureSource: "none",
        advancedTexturePrompted: true,
        waitingTextureDecision: false,
        priceMode: "single",
        serviceKey: "image_model",
        serviceLabel: "Single image AI model",
        generationMode: "image",
        quoteSnapshot: quoteSnapshotFromQuote(quote, {
          mode: "single",
          texture,
          triangles,
          enhancement,
          modelQuality,
          advancedTexture,
        }),
      });

      const textureLabel = texture === "none" ? "No texture" : "Standard";

      await interaction.editReply({
        content:
          "## Single Image Model Quote\n" +
          `**Texture:** ${textureLabel}\n` +
          `**Triangles:** ${triangles} (Roblox safe default)\n` +
          `**Detail level:** ${qualityConfig.label}\n` +
          `**Texture tone:** ${textureToneSummary(textureTone)}\n` +
          `**Texture controls:** ${textureAdjustmentsSummary(textureAdjustments)}\n` +
          `**AI alpha:** ${useAlpha ? "On" : "Off"}\n\n` +
          modelPromptReviewLine(prompt) +
          `${quote.lines.map(line => `**${line}**`).join("\n")}\n\n` +
          `**Total:** ${formatTokenAmount(quote.walletAmount)}\n\n` +
          "### Reference Check\n" +
          `**Image:** \`${publicViewFileLabel("frente", imagePath)}\`\n\n` +
          "**Next step:** review the image. If it is correct, click **Generate Model**.\n" +
          "**No Service Credits are charged until the final model is delivered.**",
        files: [publicImageAttachment(imagePath, `single-image${ext}`)],
        components: [multiviewReviewButtons(actionId)],
      });
      return;
    }

    if (interaction.commandName === "refazer_multiview" || interaction.commandName === "multiview") {
      await interaction.deferReply();

      const texture = normalizeTextureOption(interaction.options.getString("textura") || interaction.options.getString("texture") || "standard");
      const enhancement = interaction.options.getString("melhoria") || interaction.options.getString("enhancement") || "none";
      const triangles = interaction.options.getInteger("triangles") || ROBLOX_SAFE_TRIANGLE_LIMIT;
      const textureTone = explicitTextureToneForInteraction(interaction, "normal");
      const textureAdjustments = explicitTextureAdjustmentsForInteraction(interaction, DEFAULT_TEXTURE_ADJUSTMENTS);
      const useAlpha = interaction.options.getBoolean("alpha") ?? HYPER3D_USE_ORIGINAL_ALPHA;
      const modelQuality = normalizeModelQuality(
        interaction.options.getString("detail_level") ||
        interaction.options.getString("model_quality") ||
        "medium"
      );
      const prompt = normalizeModelGenerationPrompt(interaction.options.getString("prompt"));
      const qualityConfig = modelQualityConfig(modelQuality);
      const advancedTexture = "none";

      if (!["none", "economy"].includes(enhancement)) {
        await interaction.editReply({
          content:
            "## Clean Local Only\n" +
            "Reference enhancement now supports only **No enhancement** or **Clean Local**. Please send the command again with one of those options.\n\n" +
            "No model-generation charge was deducted.",
        });
        return;
      }

      const quote = calculatePrice(interaction, {
        mode: "multiview",
        texture,
        triangles,
        enhancement,
        modelQuality,
        advancedTexture,
      });

      const balanceBefore = walletAvailableBalance(interaction.user.id, "multiview");
      if (balanceBefore < quote.walletAmount) {
        await interaction.editReply(formatInsufficientBalanceMessage({
          service: "Multiview AI model",
          price: quote.walletAmount,
          balance: balanceBefore,
          language: languageFor(interaction),
        }));
        return;
      }

      const attachments = {
        frente: interaction.options.getAttachment("frente") || interaction.options.getAttachment("front"),
        direita: interaction.options.getAttachment("direita") || interaction.options.getAttachment("right"),
        esquerda: interaction.options.getAttachment("esquerda") || interaction.options.getAttachment("left"),
        costas: interaction.options.getAttachment("costas") || interaction.options.getAttachment("back"),
      };

      const tempDir = path.join(__dirname, "temp", "refazer", `multiview-${interaction.id}`);
      const inputDir = path.join(tempDir, "multiview_inputs");
      fs.mkdirSync(inputDir, { recursive: true });

      const viewPaths = {};

      for (const [view, attachment] of Object.entries(attachments)) {
        const ext = path.extname(attachment.name) || ".png";
        const outputPath = path.join(inputDir, `${view}${ext}`);
        viewPaths[view] = await downloadAttachmentToFile(attachment, outputPath);
      }

      const cleanedViews = [];
      if (enhancement === "economy") {
        const enhancedDir = path.join(tempDir, "local_cleanup");
        fs.mkdirSync(enhancedDir, { recursive: true });

        for (const view of MULTIVIEW_VIEW_ORDER.filter(item => viewPaths[item])) {
          try {
            const cleanedPath = await enhanceImageLocally({
              imagePath: viewPaths[view],
              outputPath: path.join(enhancedDir, `${view}_clean.png`),
            });
            viewPaths[view] = cleanedPath;
            cleanedViews.push(view);
          } catch (err) {
            console.error(`Local cleanup failed for ${view}:`, err);
          }
        }
      }

      const actionId = createPendingMultiviewAction({
        userId: interaction.user.id,
        language: languageFor(interaction),
        viewPaths,
        texture,
        enhancement,
        triangles,
        tempDir,
        textureTone,
        textureAdjustments,
        useAlpha,
        modelQuality,
        prompt,
        advancedTexture,
        textureSource: "none",
        advancedTexturePrompted: false,
        waitingTextureDecision: false,
        quoteSnapshot: quoteSnapshotFromQuote(quote, {
          mode: "multiview",
          texture,
          triangles,
          enhancement,
          modelQuality,
          advancedTexture,
        }),
      });

      await interaction.editReply({
        content:
          formatPriceQuote({ mode: "multiview", texture, triangles, enhancement, quote }) +
          `\n**Detail level:** ${qualityConfig.label}` +
          `\n**Texture tone:** ${textureToneSummary(textureTone)}` +
          `\n**Texture controls:** ${textureAdjustmentsSummary(textureAdjustments)}` +
          `\n**AI alpha:** ${useAlpha ? "On" : "Off"}` +
          (prompt ? `\n${modelPromptReviewLine(prompt).trimEnd()}` : "") +
          "\n\n### Reference Check\n" +
          (cleanedViews.length ? `**Clean Local applied:** ${cleanedViews.map(publicViewName).join(", ")}\n` : "") +
          MULTIVIEW_VIEW_ORDER
            .filter(view => viewPaths[view])
            .map((view, index) => `**${index + 1}. ${publicViewName(view)}:** \`${publicViewFileLabel(view, viewPaths[view])}\``)
            .join("\n") +
          "\n\n**Next step:** review every side. If everything is correct, click **Generate Model**.\n" +
          "**No Service Credits are charged until the final model is delivered.**",
        files: multiviewReviewAttachments(viewPaths),
        components: [multiviewReviewButtons(actionId)],
      });
      return;
    }

    if (interaction.commandName === "modelo_ultimo") {
    await interaction.deferReply();

    const latest = newestImportedTripoModel();

    if (!latest) {
      await interaction.editReply({
        content: "Nao encontrei nenhum modelo finalizado ainda.",
      });
      return;
    }

    await interaction.editReply({
      content: "Ultimo modelo finalizado:",
      files: [publicModelAttachment(latest.modelPath)],
    });
    return;
  }

    if (interaction.commandName === "refazer_debug") {
      await interaction.deferReply({ flags: 64 });

      const latest = newestImportedTripoModel();

      if (!latest) {
        await interaction.editReply("Nenhum modelo finalizado encontrado.");
        return;
      }

      const resultPath = path.join(latest.runDir, "tripo_ai", "tripo_result.json");
      const payloadPath = path.join(latest.runDir, "tripo_ai", "tripo_payload.json");
      const taskPath = path.join(latest.runDir, "tripo_ai", "tripo_task_id.txt");
      const result = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, "utf8")) : {};
      const payload = fs.existsSync(payloadPath) ? JSON.parse(fs.readFileSync(payloadPath, "utf8")) : {};
      const taskId = fs.existsSync(taskPath) ? fs.readFileSync(taskPath, "utf8").trim() : "nao encontrado";

      await interaction.editReply([
        "Debug interno do ultimo modelo:",
        `Task: ${taskId}`,
        `Imagem usada: ${payload.source_image || "nao informado"}`,
        `Creditos consumidos: ${result.consumed_credit ?? "nao informado"}`,
        `Status: ${result.status || "nao informado"}`,
        `Arquivo: ${path.basename(latest.modelPath)}`,
      ].join("\n"));
      return;
    }

    const id = interaction.options.getString("id").trim();
  await interaction.deferReply();
  const difference = interaction.options.getInteger("diferenca") || interaction.options.getInteger("difference");
  const enhancement = interaction.options.getString("melhoria") || interaction.options.getString("enhancement") || "none";
  const texture = normalizeTextureOption(interaction.options.getString("textura") || interaction.options.getString("texture") || "standard");
  const triangles = interaction.options.getInteger("triangles") || ROBLOX_SAFE_TRIANGLE_LIMIT;
  const preferredView = interaction.options.getString("vista") || interaction.options.getString("view");
  const textureTone = textureToneForInteraction(interaction);
  const textureAdjustments = textureAdjustmentsForInteraction(interaction);

  if (!["none", "economy"].includes(enhancement)) {
    await interaction.editReply(
      "## Clean Local Only\n" +
      "Reference enhancement now supports only **No enhancement** or **Clean Local**. Please send the command again with one of those options."
    );
    return;
  }

  const quote = calculatePrice(interaction, {
    mode: "single",
    texture,
    triangles,
    enhancement,
  });
  const mockIa = interaction.commandName === "refazer_mock"
    ? true
    : interaction.options.getBoolean("mock_ia") ?? interaction.options.getBoolean("mock_ai") ?? REFAZER_MOCK_IA;

  if (!mockIa && !imageEnhancementIsReady(enhancement)) {
    await interaction.editReply("## ⚠️ Enhancement unavailable\nThis option is not configured yet. Use **No enhancement** or contact the team.");
    return;
  }

  if (!mockIa && modelGenerationIsConfigured()) {
    const balanceBefore = walletAvailableBalance(interaction.user.id, "remake");
    if (balanceBefore < quote.walletAmount) {
      await interaction.editReply(
        formatInsufficientBalanceMessage({
          service: "AI remake",
          price: quote.walletAmount,
          balance: balanceBefore,
          language: languageFor(interaction),
        })
      );
      return;
    }
  }

  if (!mockIa && !imageEnhancementIsReady(enhancement)) {
    await interaction.reply({
      content: "## ⚠️ Melhoria indisponível\nEssa opção ainda não está configurada. Use **Sem melhoria** ou chame a equipe.",
      flags: 64,
    });
    return;
  }

  if (!mockIa && modelGenerationIsConfigured()) {
    const balanceBefore = walletAvailableBalance(interaction.user.id, "remake");
    if (balanceBefore < quote.walletAmount) {
      await interaction.reply({
        content:
          `## ⚠️ Saldo insuficiente\n` +
          `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Seu saldo:** ${formatTokenAmount(balanceBefore)}\n\n` +
          "Use `/velvet_comprar` para criar um pedido de compra.",
        flags: 64,
      });
      return;
    }
  }

  await interaction.editReply(
    `## 🎨 UGC Remake\n` +
    `**UGC:** \`${id}\`\n` +
    `**Difference:** ${difference}/10\n` +
    `**Texture:** ${texture === "none" ? "No texture" : "Standard"}\n` +
    `**Enhancement:** ${(IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none).label}\n` +
    `**Texture tone:** ${textureToneSummary(textureTone)}\n` +
    `**Texture controls:** ${textureAdjustmentsSummary(textureAdjustments)}\n` +
    `**Triangles:** ${triangles || "No special limit"}\n` +
    `**Reference mode:** ${preferredView ? `Single view (${preferredView})` : "Auto multiview from rendered views"}\n` +
    `**Estimated price:** ${formatTokenAmount(quote.walletAmount)}\n` +
    `**Test mode:** ${mockIa ? "yes" : "no"}\n\n` +
    "⏳ **Step 1/3:** preparing the UGC and rendering reference views..."
  );

  let result;

  try {
    result = await processUGC(id);

    await interaction.editReply(
      `## 🎨 UGC Remake\n` +
      `**UGC:** \`${id}\`\n` +
      `**MeshId:** \`${result.meshId}\`\n` +
      `**TextureId:** \`${result.textureId || "not found"}\`\n\n` +
      "⏳ **Step 2/3:** preparing reference images..."
    );

    const enhanced = await enhanceImagesWithNanoBanana(result.renderDir, difference, result.tempDir, mockIa, enhancement);

    if (enhanced.skipped) {
      await interaction.followUp(
        "🖼️ Using the original rendered views as references."
      );
    } else if (enhanced.mocked) {
      await interaction.followUp({
        content: "Modo teste pronto. Usei copias das fotos base para testar a entrega:",
        files: attachmentsFromPaths(enhanced.imagePaths).slice(0, 5),
      });
    } else if (enhanced.local) {
      await interaction.followUp({
        content: "Reference cleanup ready. These cleaned images will be used for model generation:",
        files: attachmentsFromPaths(enhanced.imagePaths).slice(0, 5),
      });
    } else {
      await interaction.followUp({
        content: "✨ Fotos melhoradas/variadas prontas:",
        files: attachmentsFromPaths(enhanced.imagePaths).slice(0, 5),
      });
    }

    await interaction.followUp("⏳ **Step 3/3:** generating the final model...");

    let progressMessage = null;
    const tripo = await generateModelWithTripo(
      enhanced.imagePaths,
      difference,
      result.tempDir,
      result.glbPath,
      result.objPath,
      mockIa,
      {
        texture,
        triangles,
        preferredView,
        textureTone,
        textureAdjustments,
        onProgress: async ({ status, progress }) => {
          const content = formatGenerationProgress({ status, progress });
          if (progressMessage) {
            await progressMessage.edit(content).catch(async () => {
              progressMessage = await interaction.followUp(content).catch(() => null);
            });
          } else {
            progressMessage = await interaction.followUp(content).catch(() => null);
          }
        },
      }
    );

    const files = [
      tripo.modelPath,
      result.glbPath,
      result.objPath,
      result.rbxmPath,
      result.hasTexture ? result.texturePath : null,
    ];

    if (tripo.skipped) {
      await interaction.followUp({
        content:
          `Fluxo de teste finalizado sem geracao real configurada.\n` +
          "Anexei os arquivos originais e as fotos base para validar a primeira parte.",
        files: attachmentsFromPaths([...files, ...getRenderPaths(result.renderDir)]).slice(0, 10),
      });
    } else if (tripo.mocked) {
      await interaction.followUp({
        content:
          `Fluxo completo simulado para o UGC ${id}.\n` +
          `Nivel de diferenca usado: ${difference}/10\n` +
          "O arquivo refeito_mock e uma copia do GLB original, apenas para testar o envio final sem API.",
        files: attachmentsFromPaths(files).slice(0, 10),
      });
    } else if (tripo.official) {
      const referenceMode = tripo.autoMultiview
        ? "Auto multiview"
        : `Single view (${tripo.sourceImage || "auto"})`;
      const balanceBeforeDelivery = walletAvailableBalance(interaction.user.id, "remake");
      if (balanceBeforeDelivery < quote.walletAmount) {
        throw new Error("Insufficient Service Credits before final delivery.");
      }

      const finalMessage = await interaction.followUp({
        content:
          `## ✅ Final Model Generated\n` +
          `**UGC:** \`${id}\`\n` +
          `**Reference mode:** ${referenceMode}\n` +
          `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Remaining balance:** updating...`,
        files: publicModelAttachments(tripo.modelPaths?.length ? tripo.modelPaths : [tripo.modelPath]),
      });

      const debit = removeWalletBalance({
        userId: interaction.user.id,
        amount: quote.walletAmount,
        actorId: client.user.id,
        reason: tripo.autoMultiview ? "Modelo por multiview automatico gerado" : "Modelo por imagem unica gerado",
        meta: { command: "refazer", serviceKey: "remake", ugcId: id, priceBrl: quote.price },
      });
      if (debit.ok && debit.paidWithWallet > 0) {
        creditAffiliateServiceCommission({
          buyerId: interaction.user.id,
          walletAmount: debit.paidWithWallet,
          priceBrl: debit.paidWithWallet / WALLET_TOKENS_PER_BRL,
          source: tripo.autoMultiview ? "remake_auto_multiview" : "remake_single",
          actorId: client.user.id,
          meta: { ugcId: id, mode: tripo.autoMultiview ? "auto_multiview" : "single" },
        });
      }

      await finalMessage.edit({
        content:
          `## ✅ Final Model Generated\n` +
          `**UGC:** \`${id}\`\n` +
          `**Reference mode:** ${referenceMode}\n` +
          `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}`,
      }).catch(() => {});
    } else {
      await interaction.followUp({
        content:
          `Modelo refeito gerado para o UGC ${id}.\n` +
          `Nivel de diferenca usado: ${difference}/10\n` +
          "Revise o GLB antes de subir no Roblox.",
        files: attachmentsFromPaths(files).slice(0, 10),
      });
    }
  } catch (err) {
    console.error(err);

    const failureMessage =
      "## ⚠️ Model generation failed\n" +
      "No remake charge was deducted because no final model was delivered.\n\n" +
      "The team can review this manually. If this keeps happening, check the API balance/limits and server logs.";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(failureMessage);
      if (userIsAdmin(interaction)) {
        await interaction.followUp({
          content:
            "## Admin diagnostic\n" +
            `\`\`\`\n${String(err.message || err).slice(0, 1500)}\n\`\`\``,
          flags: 64,
        }).catch(() => {});
      }
    } else {
      await interaction.reply(failureMessage);
    }
  }
  } catch (err) {
    console.error(err);

    const message = "## Command failed\nSomething went wrong while processing this command. No charge was deducted if no final delivery happened.";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, flags: 64 }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: 64 }).catch(() => {});
    }

    if (userIsAdmin(interaction)) {
      const diagnostic =
        "## Admin diagnostic\n" +
        `\`\`\`\n${String(err?.stack || err?.message || err).slice(0, 1800)}\n\`\`\``;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: diagnostic, flags: 64 }).catch(() => {});
      }
    }
  }
});

registerCommands()
  .then(() => client.login(TOKEN))
  .catch(err => {
    console.error("Erro ao iniciar bot laboratorio:", err);
  });







