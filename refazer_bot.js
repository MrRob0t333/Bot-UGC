require("dotenv").config();

console.log("Iniciando bot laboratorio /refazer...");

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
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
} = require("discord.js");

const TOKEN = process.env.REFAZER_DISCORD_TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.REFAZER_CLIENT_ID || process.env.CLIENT_ID;
const GUILD_ID = process.env.REFAZER_GUILD_ID || process.env.GUILD_ID;
const ROBLOSECURITY = process.env.ROBLOSECURITY;

const PREMIUM_ROLE = process.env.REFAZER_PREMIUM_ROLE || "1521989120745013459";
const NORMAL_ROLE = process.env.REFAZER_NORMAL_ROLE || "1521959526394237089";
const ADMIN_ROLE = process.env.REFAZER_ADMIN_ROLE || "1522293475801038868";

const BLENDER_PATH =
  process.env.BLENDER_PATH ||
  "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe";

const NANO_BANANA_PRO_ENDPOINT = process.env.NANO_BANANA_PRO_ENDPOINT;
const NANO_BANANA_PRO_API_KEY = process.env.NANO_BANANA_PRO_API_KEY;
const TRIPO_AI_ENDPOINT = process.env.TRIPO_AI_ENDPOINT;
const TRIPO_AI_API_KEY = process.env.TRIPO_AI_API_KEY;
const TRIPO_API_KEY = process.env.TRIPO_API_KEY || TRIPO_AI_API_KEY;
const TRIPO_API_BASE = process.env.TRIPO_API_BASE || "https://api.tripo3d.ai/v2/openapi";
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || "stripe").toLowerCase();
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const MERCADO_PAGO_PUBLIC_KEY = process.env.MERCADO_PAGO_PUBLIC_KEY;
const MERCADO_PAGO_WEBHOOK_URL = process.env.MERCADO_PAGO_WEBHOOK_URL;
const MERCADO_PAGO_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
const MERCADO_PAGO_SUCCESS_URL = process.env.MERCADO_PAGO_SUCCESS_URL || "https://discord.com";
const MERCADO_PAGO_FAILURE_URL = process.env.MERCADO_PAGO_FAILURE_URL || "https://discord.com";
const MERCADO_PAGO_PENDING_URL = process.env.MERCADO_PAGO_PENDING_URL || "https://discord.com";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_WEBHOOK_URL = process.env.STRIPE_WEBHOOK_URL;
const STRIPE_SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || "https://discord.com";
const STRIPE_CANCEL_URL = process.env.STRIPE_CANCEL_URL || "https://discord.com";
const WEBHOOK_HOST = process.env.WEBHOOK_HOST || "0.0.0.0";
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT || 3001);
const REFAZER_MOCK_IA = process.env.REFAZER_MOCK_IA === "true";

const COOLDOWN_MS = 10000;
const cooldowns = new Map();

const PRICE_CONFIG = {
  baseNormal: 25,
  basePremium: 20,
  copyNormal: 1,
  copyPremium: 1,
  multiviewExtra: 5,
  hdTextureExtra: 5,
  noTextureDiscount: 3,
  lowPolyExtra: 3,
  maxTriangles: 3950,
};

const IMAGE_ENHANCEMENTS = {
  none: {
    label: "Sem melhoria",
    model: null,
    priceExtra: 0,
  },
  economy: {
    label: "Melhoria economica",
    model: "gemini-3.1-flash-lite-image",
    priceExtra: 2,
  },
  standard: {
    label: "Melhoria padrao",
    model: "gemini-3.1-flash-image",
    priceExtra: 3,
  },
  premium: {
    label: "Melhoria premium",
    model: "gemini-3-pro-image",
    priceExtra: 6,
  },
};

const WALLET_TOKEN_NAME = "Velvet Coins";
const WALLET_TOKENS_PER_BRL = 1000 / 30;
const WALLET_MIN_PURCHASE = 1000;
const AFFILIATE_COMMISSION_RATE = 0.10;
const AFFILIATE_WITHDRAW_MIN = 1000;
const SUBSCRIPTION_PLANS = {
  basic: {
    label: "Basic",
    brl: 99,
    roleId: NORMAL_ROLE,
  },
  premium: {
    label: "Premium",
    brl: 199,
    roleId: PREMIUM_ROLE,
  },
};
const DEFAULT_CURRENCY = "BRL";
const DEFAULT_LANGUAGE = "en";
const CURRENCIES = {
  BRL: { symbol: "R$", brlRate: 1 },
  USD: { symbol: "$", brlRate: 5.5 },
  EUR: { symbol: "€", brlRate: 6 },
  GBP: { symbol: "£", brlRate: 7 },
};
const MULTIVIEW_VIEW_ORDER = ["frente", "direita", "costas", "esquerda"];
const WALLET_DB_PATH = path.join(__dirname, "data", "refazer_wallet.json");

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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

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
        .setRequired(false)
        .addChoices(
          { name: "Auto", value: "auto" },
          { name: "English", value: "en" },
          { name: "Português", value: "pt-BR" }
        )
    )
    .addStringOption(o =>
      o
        .setName("currency")
        .setDescription("Payment currency")
        .setRequired(false)
        .addChoices(
          { name: "BRL - Real", value: "BRL" },
          { name: "USD - Dollar", value: "USD" },
          { name: "EUR - Euro", value: "EUR" },
          { name: "GBP - Pound", value: "GBP" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_saldo")
    .setDescription("Mostra seu saldo de Velvet Coins")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Shows your Velvet Coins balance")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_comprar")
    .setDescription("Cria um pedido de compra de Velvet Coins")
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Velvet Coins")
        .setRequired(true)
        .setMinValue(WALLET_MIN_PURCHASE)
    )
    .addStringOption(o =>
      o
        .setName("moeda")
        .setDescription("Moeda de pagamento")
        .setRequired(false)
        .addChoices(
          { name: "BRL - Real", value: "BRL" },
          { name: "USD - Dollar", value: "USD" },
          { name: "EUR - Euro", value: "EUR" },
          { name: "GBP - Pound", value: "GBP" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Creates a Velvet Coins purchase request")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("Velvet Coins amount")
        .setRequired(true)
        .setMinValue(WALLET_MIN_PURCHASE)
    )
    .addStringOption(o =>
      o
        .setName("currency")
        .setDescription("Payment currency")
        .setRequired(false)
        .addChoices(
          { name: "BRL - Real", value: "BRL" },
          { name: "USD - Dollar", value: "USD" },
          { name: "EUR - Euro", value: "EUR" },
          { name: "GBP - Pound", value: "GBP" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate")
    .setDescription("Shows your affiliate code, link and commission balance")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate_apply")
    .setDescription("Applies an affiliate code to your account")
    .addStringOption(o =>
      o.setName("code").setDescription("Affiliate code").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate_redeem")
    .setDescription("Moves affiliate commission into your Velvet Coins balance")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Velvet Coins amount").setRequired(true).setMinValue(1)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("affiliate_withdraw")
    .setDescription("Creates an affiliate commission withdrawal request")
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Velvet Coins amount").setRequired(true).setMinValue(AFFILIATE_WITHDRAW_MIN)
    )
    .addStringOption(o =>
      o.setName("payment_info").setDescription("Where/how the team should pay you").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("subscribe")
    .setDescription("Creates a Basic or Premium subscription link")
    .addStringOption(o =>
      o
        .setName("plan")
        .setDescription("Subscription plan")
        .setRequired(true)
        .addChoices(
          { name: "Basic - R$ 99/month", value: "basic" },
          { name: "Premium - R$ 199/month", value: "premium" }
        )
    )
    .addStringOption(o =>
      o.setName("email").setDescription("Payment email").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_transferir")
    .setDescription("Transfere Velvet Coins para outro usuário")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário que vai receber").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Velvet Coins")
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
        .setDescription("Quantidade de Velvet Coins")
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
    .setDescription("Admin: adiciona Velvet Coins para um usuário")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário que vai receber").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Velvet Coins")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(o =>
      o.setName("motivo").setDescription("Motivo do ajuste").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("velvet_admin_remover")
    .setDescription("Admin: remove Velvet Coins de um usuário")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário que vai perder saldo").setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("quantidade")
        .setDescription("Quantidade de Velvet Coins")
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
    .setDescription("Copies the original asset files without recreating")
    .addStringOption(o =>
      o.setName("id").setDescription("Original UGC ID").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("bulk_steal")
    .setDescription("Premium: copies up to 10 original assets")
    .addStringOption(o =>
      o.setName("ids").setDescription("Up to 10 UGC IDs, separated by space or comma").setRequired(true)
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
          { name: "Economy", value: "economy" },
          { name: "Standard", value: "standard" },
          { name: "Premium", value: "premium" }
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
          { name: "HD", value: "hd" }
        )
    )
    .addIntegerOption(o =>
      o.setName("triangles").setDescription("Triangle limit. Max: 3950").setRequired(false).setMinValue(500).setMaxValue(3950)
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
          { name: "Economy", value: "economy" },
          { name: "Standard", value: "standard" },
          { name: "Premium", value: "premium" }
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
          { name: "HD", value: "hd" }
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
          { name: "HD", value: "hd" }
        )
    )
    .addStringOption(o =>
      o
        .setName("enhancement")
        .setDescription("Reference image enhancement")
        .setRequired(true)
        .addChoices(
          { name: "No enhancement", value: "none" },
          { name: "Economy", value: "economy" },
          { name: "Standard", value: "standard" },
          { name: "Premium", value: "premium" }
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
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_add")
    .setDescription("Admin: adds Velvet Coins to a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Velvet Coins amount").setRequired(true).setMinValue(1)
    )
    .addStringOption(o =>
      o.setName("reason").setDescription("Adjustment reason").setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("admin_remove")
    .setDescription("Admin: removes Velvet Coins from a user")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Velvet Coins amount").setRequired(true).setMinValue(1)
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
        .setRequired(true)
        .addChoices(
          { name: "No texture", value: "none" },
          { name: "Standard", value: "standard" },
          { name: "HD", value: "hd" }
        )
    )
    .addStringOption(o =>
      o
        .setName("confirm")
        .setDescription("Type YES after checking the images")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("generate")
        .setDescription("Start generation now?")
        .setRequired(true)
        .addChoices(
          { name: "No, quote only", value: "nao" },
          { name: "Yes, generate now", value: "sim" }
        )
    )
    .addStringOption(o =>
      o
        .setName("enhancement")
        .setDescription("Reference image enhancement")
        .setRequired(true)
        .addChoices(
          { name: "No enhancement", value: "none" },
          { name: "Economy", value: "economy" },
          { name: "Standard", value: "standard" },
          { name: "Premium", value: "premium" }
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
          { name: "Economica", value: "economy" },
          { name: "Padrao", value: "standard" },
          { name: "Premium", value: "premium" }
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
          { name: "HD", value: "hd" }
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
          { name: "HD", value: "hd" }
        )
    )
    .addStringOption(o =>
      o
        .setName("melhoria")
        .setDescription("Melhoria das imagens antes da modelagem")
        .setRequired(true)
        .addChoices(
          { name: "Sem melhoria", value: "none" },
          { name: "Economica", value: "economy" },
          { name: "Padrao", value: "standard" },
          { name: "Premium", value: "premium" }
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
        .setRequired(true)
        .addChoices(
          { name: "Sem textura", value: "none" },
          { name: "Padrao", value: "standard" },
          { name: "HD", value: "hd" }
        )
    )
    .addStringOption(o =>
      o
        .setName("confirmar")
        .setDescription("Digite SIM para confirmar que as fotos estao nas posicoes certas")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("gerar")
        .setDescription("Iniciar a geracao agora?")
        .setRequired(true)
        .addChoices(
          { name: "Nao, apenas orcamento", value: "nao" },
          { name: "Sim, gerar agora", value: "sim" }
        )
    )
    .addStringOption(o =>
      o
        .setName("melhoria")
        .setDescription("Melhoria das imagens antes da modelagem")
        .setRequired(true)
        .addChoices(
          { name: "Sem melhoria", value: "none" },
          { name: "Economica", value: "economy" },
          { name: "Padrao", value: "standard" },
          { name: "Premium", value: "premium" }
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
  const hiddenPortugueseCommands = new Set([
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
  ]);
  const registeredCommands = commands.filter(command => !hiddenPortugueseCommands.has(command.name));

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

function calculatePrice(interaction, { mode, texture, triangles, enhancement }) {
  const premium = userIsPremium(interaction);
  const enhancementConfig = IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none;
  let price = premium ? PRICE_CONFIG.basePremium : PRICE_CONFIG.baseNormal;
  const lines = [`Base ${premium ? "premium" : "normal"}: ${formatWalletAmount(price)}`];

  if (mode === "multiview") {
    price += PRICE_CONFIG.multiviewExtra;
    lines.push(`Multiview: +${formatWalletAmount(PRICE_CONFIG.multiviewExtra)}`);
  }

  if (texture === "hd") {
    price += PRICE_CONFIG.hdTextureExtra;
    lines.push(`Textura HD: +${formatWalletAmount(PRICE_CONFIG.hdTextureExtra)}`);
  } else if (texture === "none") {
    price -= PRICE_CONFIG.noTextureDiscount;
    lines.push(`Sem textura: -${formatWalletAmount(PRICE_CONFIG.noTextureDiscount)}`);
  }

  const lowPoly = Boolean(triangles);

  if (lowPoly) {
    price += PRICE_CONFIG.lowPolyExtra;
    lines.push(`Limite de triangulos (${triangles}): +${formatWalletAmount(PRICE_CONFIG.lowPolyExtra)}`);
  }

  if (enhancementConfig.priceExtra > 0) {
    price += enhancementConfig.priceExtra;
    lines.push(`${enhancementConfig.label}: +${formatWalletAmount(enhancementConfig.priceExtra)}`);
  }

  return {
    premium,
    price,
    walletAmount: brlToWalletTokens(price),
    lines,
    apiCredits: apiCreditsFor({ mode, texture, lowPoly }),
  };
}

function calculateCopyPrice(interaction) {
  const premium = userIsPremium(interaction) || userIsAdmin(interaction);
  const price = premium ? 0 : PRICE_CONFIG.copyNormal;

  return {
    premium,
    price,
    walletAmount: brlToWalletTokens(price),
  };
}

function brlToWalletTokens(value) {
  return Math.ceil(value * WALLET_TOKENS_PER_BRL);
}

function formatWalletAmount(value) {
  return `${brlToWalletTokens(value)} ${WALLET_TOKEN_NAME}`;
}

function emptyWalletDb() {
  return {
    users: {},
    purchaseRequests: [],
    withdrawalRequests: [],
    affiliateWithdrawals: [],
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
      language: DEFAULT_LANGUAGE,
      currency: DEFAULT_CURRENCY,
      affiliateCode: null,
      referredBy: null,
      affiliateBalance: 0,
      createdAt: new Date().toISOString(),
    };
  }

  db.users[userId].language ||= DEFAULT_LANGUAGE;
  db.users[userId].currency ||= DEFAULT_CURRENCY;
  db.users[userId].affiliateBalance ||= 0;

  return db.users[userId];
}

function walletBalance(userId) {
  const db = readWalletDb();
  return walletUser(db, userId).balance;
}

function walletPreferences(userId) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  return {
    language: user.language || DEFAULT_LANGUAGE,
    currency: user.currency || DEFAULT_CURRENCY,
  };
}

function updateWalletPreferences(userId, updates) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  if (updates.language) user.language = updates.language;
  if (updates.currency && CURRENCIES[updates.currency]) user.currency = updates.currency;
  writeWalletDb(db);
  return {
    language: user.language,
    currency: user.currency,
  };
}

function languageFor(interaction) {
  const prefs = walletPreferences(interaction.user.id);
  if (prefs.language !== "auto") return prefs.language;
  return "en";
}

function currencyFor(interaction, selectedCurrency) {
  const prefs = walletPreferences(interaction.user.id);
  return CURRENCIES[selectedCurrency] ? selectedCurrency : prefs.currency || DEFAULT_CURRENCY;
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
  if (user.balance < amount) {
    return { ok: false, balance: user.balance };
  }

  user.balance -= amount;
  walletTransaction(db, { userId, type: "debit", amount: -amount, actorId, reason, meta });
  writeWalletDb(db);
  return { ok: true, balance: user.balance };
}

function formatCurrencyFromBrl(brl, currencyCode = DEFAULT_CURRENCY) {
  const currency = CURRENCIES[currencyCode] || CURRENCIES[DEFAULT_CURRENCY];
  const value = brl / currency.brlRate;
  return `${currency.symbol} ${value.toFixed(2)} ${currencyCode}`;
}

async function mercadoPagoRequest(endpoint, body) {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN nao configurado.");
  }

  const res = await fetch(`https://api.mercadopago.com${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
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
      type: "velvet_coins",
      user_id: request.userId,
      amount: request.amount,
      request_id: request.id,
    },
    line_items: [
      {
        price_data: {
          currency: "brl",
          unit_amount: Math.round(request.brl * 100),
          product_data: {
            name: `${request.amount} Velvet Coins`,
            description: "Velvet Coins wallet top-up",
          },
        },
        quantity: 1,
      },
    ],
    automatic_payment_methods: {
      enabled: true,
    },
  });
}

async function createStripeSubscriptionSession({ userId, planKey, email }) {
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
          currency: "brl",
          unit_amount: Math.round(plan.brl * 100),
          recurring: { interval: "month" },
          product_data: { name: `Velvet ${plan.label}` },
        },
        quantity: 1,
      },
    ],
    automatic_payment_methods: {
      enabled: true,
    },
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

async function createMercadoPagoPreference(request) {
  const payload = {
    items: [
      {
        id: request.id,
        title: `${request.amount} Velvet Coins`,
        description: "Velvet Coins wallet top-up",
        quantity: 1,
        currency_id: "BRL",
        unit_price: request.brl,
      },
    ],
    external_reference: request.id,
    metadata: {
      type: "velvet_coins",
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

function makeAffiliateCode(userId) {
  return `VELVET${String(userId).slice(-6)}`;
}

function findAffiliateOwner(db, code) {
  const normalized = String(code || "").trim().toUpperCase();
  return Object.entries(db.users).find(([, user]) => user.affiliateCode === normalized)?.[0] || null;
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
    referredBy: user.referredBy,
    affiliateBalance: user.affiliateBalance || 0,
  };
}

function applyAffiliateCode(userId, code) {
  const db = readWalletDb();
  const user = walletUser(db, userId);
  const normalized = String(code || "").trim().toUpperCase();
  const ownerId = findAffiliateOwner(db, normalized);

  if (!ownerId) return { ok: false, reason: "Affiliate code not found." };
  if (ownerId === userId) return { ok: false, reason: "You cannot use your own affiliate code." };
  if (user.referredBy) return { ok: false, reason: "An affiliate code is already applied to this account." };

  user.referredBy = ownerId;
  writeWalletDb(db);
  return { ok: true, ownerId };
}

function creditAffiliateCommission(db, purchaseRequest, actorId) {
  const buyer = walletUser(db, purchaseRequest.userId);
  if (!buyer.referredBy) return null;

  const affiliate = walletUser(db, buyer.referredBy);
  const commission = Math.floor(purchaseRequest.amount * AFFILIATE_COMMISSION_RATE);
  if (commission <= 0) return null;

  affiliate.affiliateBalance = (affiliate.affiliateBalance || 0) + commission;
  walletTransaction(db, {
    userId: buyer.referredBy,
    type: "affiliate_commission",
    amount: commission,
    actorId,
    reason: "Affiliate commission",
    meta: { purchaseId: purchaseRequest.id, buyerId: purchaseRequest.userId },
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

function createPurchaseRequest({ userId, amount, currency = DEFAULT_CURRENCY }) {
  const db = readWalletDb();
  const brl = Number((amount / WALLET_TOKENS_PER_BRL).toFixed(2));
  const request = {
    id: `compra-${Date.now()}`,
    userId,
    amount,
    brl,
    currency,
    currencyAmount: Number((brl / (CURRENCIES[currency]?.brlRate || 1)).toFixed(2)),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.purchaseRequests.push(request);
  writeWalletDb(db);
  return request;
}

function resolvePurchase({ requestId, action, actorId, reason }) {
  const db = readWalletDb();
  const request = db.purchaseRequests.find(item => item.id === requestId);
  if (!request) return { ok: false, reason: "Pedido nao encontrado." };
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
    creditAffiliateCommission(db, request, actorId);
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

  const resolved = resolvePurchase({
    requestId,
    action: "aprovar",
    actorId: "mercado_pago",
    reason: `Mercado Pago payment ${paymentId}`,
  });

  if (resolved.ok) {
    console.log(`Compra aprovada automaticamente: ${requestId}`);
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

  if (metadata.type === "velvet_coins" && session.payment_status === "paid") {
    const requestId = metadata.request_id || session.client_reference_id;
    const resolved = resolvePurchase({
      requestId,
      action: "aprovar",
      actorId: "stripe",
      reason: `Stripe checkout session ${session.id}`,
    });

    if (resolved.ok) {
      console.log(`Compra Stripe aprovada automaticamente: ${requestId}`);
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
    console.log(`Assinatura Stripe ativada: ${session.id}`);
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

async function processStripeWebhook(event) {
  if (event.type === "checkout.session.completed") {
    await handleStripeCheckoutSession(event.data?.object || {});
    return;
  }

  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.paused") {
    await handleStripeSubscription(event.data?.object || {}, false);
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
  return `${amount} ${WALLET_TOKEN_NAME}`;
}

function imageEnhancementIsReady(enhancement) {
  const enhancementConfig = IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none;
  return enhancementConfig.model === null || Boolean(NANO_BANANA_PRO_ENDPOINT);
}

function formatPriceQuote({ mode, texture, triangles, enhancement, quote }) {
  const textureLabel = texture === "none" ? "sem textura" : texture === "hd" ? "HD" : "padrao";
  const enhancementLabel = (IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none).label;

  return [
    "## 💎 Orçamento do Refazer",
    `**Modo:** ${mode === "multiview" ? "Multiview" : "Imagem única"}`,
    `**Textura:** ${textureLabel}`,
    `**Melhoria:** ${enhancementLabel}`,
    `**Triangles:** ${triangles || "sem limite especial"}`,
    "",
    ...quote.lines,
    "",
    `### Total: **${formatTokenAmount(quote.walletAmount)}**`,
  ].join("\n");
}

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

function userIsPremium(interaction) {
  return hasRole(interaction, PREMIUM_ROLE);
}

function userIsAdmin(interaction) {
  return hasRole(interaction, ADMIN_ROLE);
}

function userIsAllowed(interaction) {
  return userIsAdmin(interaction) || hasRole(interaction, PREMIUM_ROLE) || hasRole(interaction, NORMAL_ROLE);
}

async function checkCooldown(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const last = cooldowns.get(userId) || 0;

  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);

    await interaction.reply({
      content: `⏳ Wait ${wait}s before using another command.`,
      flags: 64,
    }).catch(() => {});

    return false;
  }

  cooldowns.set(userId, now);
  return true;
}

async function downloadBuffer(url) {
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
      throw new Error("Nao tenho permissao para acessar esse item.");
    }

    throw new Error(`Falha ao processar o item. Codigo: ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function downloadRobloxAsset(assetId) {
  return downloadBuffer(`https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`);
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

async function renderImages(objPath, texturePath, tempDir) {
  const renderDir = path.join(tempDir, "renders");
  fs.mkdirSync(renderDir, { recursive: true });

  await execFileAsync(BLENDER_PATH, [
    "--background",
    "--python",
    path.join(__dirname, "render_views.py"),
    "--",
    objPath,
    texturePath || "",
    renderDir,
  ]);

  return renderDir;
}

function exportGlb(objPath, texturePath, glbPath) {
  execFileSync(
    BLENDER_PATH,
    [
      "--background",
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

async function processUGC(ugcId, options = {}) {
  const shouldExportGlb = options.exportGlb !== false;
  const shouldRender = options.render !== false;
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

  const meshBuffer = await downloadRobloxAsset(meshId);
  const mesh = loadMeshParser().parse(meshBuffer);

  let hasTexture = false;

  if (textureId) {
    try {
      const textureBuffer = await downloadRobloxAsset(textureId);
      fs.writeFileSync(texturePath, textureBuffer);
      hasTexture = true;
    } catch (err) {
      console.warn("Nao consegui baixar textura:", err.message);
    }
  }

  writeObj(mesh, objPath);

  if (shouldExportGlb) {
    try {
      exportGlb(objPath, hasTexture ? texturePath : "", glbPath);
    } catch (err) {
      console.warn("Nao consegui exportar GLB original:", err.message);
    }
  }

  const renderDir = shouldRender
    ? await renderImages(objPath, hasTexture ? texturePath : "", tempDir)
    : null;

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
    return "Improve clarity, texture detail and lighting while keeping the accessory very close to the original Roblox UGC.";
  }

  if (difference <= 7) {
    return "Create a cleaner redesigned variation inspired by the original Roblox UGC, changing visible details while preserving the general category and silhouette.";
  }

  return "Create a strongly different Roblox-ready accessory concept inspired by the original only as a loose reference, with a new visual identity and clear modelable details.";
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nao consegui baixar retorno da IA. Codigo: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function getImageContentType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
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
  for (let attempt = 0; attempt < 180; attempt++) {
    const json = await tripoRequest(`/task/${taskId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = json?.data || {};
    const status = data.status;
    const progress = data.progress ?? 0;

    if (onProgress && attempt % 5 === 0) {
      await onProgress({ status, progress, consumedCredit: data.consumed_credit });
    }

    if (status === "success") return data;

    if (["failed", "banned", "expired", "cancelled", "unknown"].includes(status)) {
      throw new Error(`Task Tripo terminou com status ${status}.`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error("Tempo limite aguardando task do Tripo.");
}

function selectBestTripoModelUrl(output) {
  return output?.model || output?.pbr_model || output?.base_model;
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

async function generateModelWithOfficialTripo({ imagePaths, texture, triangles, tempDir, preferredView, onProgress }) {
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
    model_version: "P1-20260311",
    texture: texture !== "none",
    pbr: texture !== "none",
  };

  if (texture === "hd") payload.texture_quality = "detailed";
  if (triangles) payload.face_limit = triangles;

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

async function generateMultiviewWithOfficialTripo({ viewPaths, texture, triangles, tempDir, onProgress }) {
  const tripoDir = path.join(tempDir, "tripo_ai");
  fs.mkdirSync(tripoDir, { recursive: true });

  const viewOrder = MULTIVIEW_VIEW_ORDER;
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
    model_version: "P1-20260311",
    texture: texture !== "none",
    pbr: texture !== "none",
  };

  if (texture === "hd") payload.texture_quality = "detailed";
  if (triangles) payload.face_limit = triangles;

  fs.writeFileSync(path.join(tripoDir, "tripo_payload.json"), JSON.stringify({
    ...payload,
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

  return {
    taskId,
    consumedCredit: task.consumed_credit,
    outputDir: tripoDir,
    modelPath,
  };
}

async function enhanceImagePaths(inputPaths, difference, tempDir, mockIa, enhancement = "none") {
  const enhancementConfig = IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none;
  const enhancedDir = path.join(tempDir, "nano_banana_pro");
  fs.mkdirSync(enhancedDir, { recursive: true });

  if (enhancementConfig.model === null) {
    return {
      skipped: true,
      reason: "melhoria desativada",
      imagePaths: inputPaths,
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

  if (!NANO_BANANA_PRO_ENDPOINT) {
    return {
      skipped: true,
      reason: "NANO_BANANA_PRO_ENDPOINT nao configurado",
      imagePaths: inputPaths,
      outputDir: enhancedDir,
    };
  }

  const imagePaths = [];

  for (const inputPath of inputPaths) {
    const form = new FormData();
    const imageBuffer = fs.readFileSync(inputPath);
    const imageBlob = new Blob([imageBuffer], { type: "image/png" });

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
      throw new Error(`Nano Banana Pro falhou em ${path.basename(inputPath)}. Codigo: ${res.status}`);
    }

    const outputPath = path.join(enhancedDir, path.basename(inputPath));
    const jsonPath = path.join(enhancedDir, `${path.parse(inputPath).name}.json`);
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

  if (TRIPO_API_KEY) {
    return generateModelWithOfficialTripo({
      imagePaths,
      texture: options.texture || "standard",
      triangles: options.triangles || null,
      tempDir,
      preferredView: options.preferredView || null,
      onProgress: options.onProgress,
    });
  }

  if (!TRIPO_AI_ENDPOINT) {
    return {
      skipped: true,
      reason: "TRIPO_AI_ENDPOINT nao configurado",
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

function multiviewReviewAttachments(viewPaths) {
  return MULTIVIEW_VIEW_ORDER
    .map((view, index) => {
      const file = viewPaths[view];
      if (!file || !fs.existsSync(file)) return null;
      const ext = path.extname(file) || ".png";
      const label = String(index + 1).padStart(2, "0");
      return new AttachmentBuilder(file, { name: `${label}-${view}${ext}` });
    })
    .filter(Boolean);
}

function parseBulkIds(raw) {
  return [...new Set(String(raw || "")
    .split(/[\s,;]+/)
    .map(id => id.trim())
    .filter(id => /^\d+$/.test(id)))]
    .slice(0, 10);
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
    "💎 `/affiliate_redeem` - turns commission into Velvet Coins",
    "🏦 `/affiliate_withdraw` - requests affiliate payout",
    "🤝 `/velvet_transferir` - envia Velvet Coins para outro usuário",
    "🏦 `/velvet_sacar` - cria um pedido de saque",
    "🧾 `/refazer_preco` - calcula o valor do modelo",
    "📎 `/copiar` - envia o modelo original e textura",
    "📎 `/steal` - copies original asset files",
    "📦 `/bulk_steal` - premium copies up to 10 assets",
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
      "🏦 `/velvet_admin_saques` - lista saques pendentes",
      "☑️ `/velvet_admin_saque` - aprova ou rejeita saque"
    );
  }

  return lines.join("\n");
}

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
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    console.log("Webhook Mercado Pago nao iniciado: MERCADO_PAGO_ACCESS_TOKEN ausente.");
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
    console.log(`Webhook Mercado Pago online em http://${WEBHOOK_HOST}:${WEBHOOK_PORT}/mercadopago/webhook`);
  });
}

client.once("clientReady", () => {
  console.log(`Bot laboratorio online como ${client.user.tag}`);
  startWebhookServer();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (![
    "refazer_comandos",
    "commands",
    "settings",
    "velvet_saldo",
    "balance",
    "velvet_comprar",
    "buy",
    "affiliate",
    "affiliate_apply",
    "affiliate_redeem",
    "affiliate_withdraw",
    "subscribe",
    "velvet_transferir",
    "velvet_sacar",
    "velvet_admin_add",
    "velvet_admin_remover",
    "velvet_admin_compras",
    "velvet_admin_compra",
    "velvet_admin_saques",
    "velvet_admin_saque",
    "admin_add",
    "admin_remove",
    "admin_purchases",
    "admin_purchase",
    "admin_withdrawals",
    "admin_withdrawal",
    "copiar",
    "steal",
    "bulk_steal",
    "bulk_remake",
    "remake",
    "price",
    "multiview",
    "refazer",
    "refazer_mock",
    "modelo_ultimo",
    "refazer_debug",
    "refazer_preco",
    "refazer_multiview",
  ].includes(interaction.commandName)) return;
  try {
    if (!await checkCooldown(interaction)) return;

    if (!userIsAllowed(interaction)) {
      await interaction.reply({
        content: "You do not have the required role to use this bot.",
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
      const prefs = updateWalletPreferences(interaction.user.id, { language, currency });
      const resolvedLanguage = prefs.language === "auto" ? "Auto" : prefs.language;

      await interaction.reply({
        content:
          `## ⚙️ Velvet Settings\n` +
          `**Language:** ${resolvedLanguage}\n` +
          `**Currency:** ${prefs.currency}\n\n` +
          `Payment previews will use **${prefs.currency}**. Bot messages will follow your language preference when available.`,
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
      "admin_remove",
      "admin_purchases",
      "admin_purchase",
      "admin_withdrawals",
      "admin_withdrawal",
    ].includes(interaction.commandName) && !userIsAdmin(interaction)) {
      await interaction.reply({
        content: "Esse comando e reservado para a equipe.",
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_saldo" || interaction.commandName === "balance") {
      const lang = interaction.commandName === "balance" ? "en" : languageFor(interaction);
      await interaction.reply({
        content: lang === "pt-BR"
          ? `## 💎 Carteira Velvet\n**Saldo atual:** ${formatTokenAmount(walletBalance(interaction.user.id))}`
          : `## 💎 Velvet Wallet\n**Current balance:** ${formatTokenAmount(walletBalance(interaction.user.id))}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_comprar" || interaction.commandName === "buy") {
      const lang = interaction.commandName === "buy" ? "en" : languageFor(interaction);
      const amount = interaction.options.getInteger("quantidade") || interaction.options.getInteger("amount");
      const selectedCurrency = interaction.options.getString("moeda") || interaction.options.getString("currency");
      const currency = currencyFor(interaction, selectedCurrency);
      if (amount < WALLET_MIN_PURCHASE) {
        await interaction.reply({
          content: lang === "pt-BR"
            ? `## ⚠️ Compra mínima\nA compra mínima é de **${formatTokenAmount(WALLET_MIN_PURCHASE)}**.`
            : `## ⚠️ Minimum purchase\nThe minimum purchase is **${formatTokenAmount(WALLET_MIN_PURCHASE)}**.`,
          flags: 64,
        });
        return;
      }

      const request = createPurchaseRequest({ userId: interaction.user.id, amount, currency });
      const priceLabel = formatCurrencyFromBrl(request.brl, currency);
      let paymentLink = null;
      let paymentProvider = "manual";

      if (PAYMENT_PROVIDER === "stripe" && STRIPE_SECRET_KEY) {
        try {
          const session = await createStripeCheckoutSession(request);
          paymentLink = session.url || null;
          paymentProvider = "Stripe";
        } catch (err) {
          console.error(err);
        }
      } else if (PAYMENT_PROVIDER === "mercadopago" && MERCADO_PAGO_ACCESS_TOKEN) {
        try {
          const preference = await createMercadoPagoPreference(request);
          paymentLink = preference.init_point || preference.sandbox_init_point || null;
          paymentProvider = "Mercado Pago";
        } catch (err) {
          console.error(err);
        }
      }

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
            ? `Pague pelo ${paymentProvider}:\n${paymentLink}\n\nAssim que for confirmado, seus **Velvet Coins** serão liberados automaticamente.`
            : `Envie o pagamento no canal indicado pela equipe. Assim que for confirmado, seus **Velvet Coins** caem na carteira automaticamente.`)
          :
          `# 🛒 Purchase Request\n` +
          `✅ **Your request was created successfully.**\n\n` +
          `> **Order ID:** \`${request.id}\`\n` +
          `> **Package:** 💎 ${formatTokenAmount(request.amount)}\n` +
          `> **Price:** **${priceLabel}**\n` +
          `> **Status:** ⏳ awaiting payment\n\n` +
          `📌 **Next step**\n` +
          (paymentLink
            ? `Pay with ${paymentProvider}:\n${paymentLink}\n\nOnce confirmed, your **Velvet Coins** will be released automatically.`
            : `Send the payment in the channel indicated by the team. Once confirmed, your **Velvet Coins** will be added to your wallet automatically.`),
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "affiliate") {
      const profile = getAffiliateProfile(interaction.user.id);
      const link = `https://discord.com/channels/${GUILD_ID}?ref=${profile.code}`;

      await interaction.reply({
        content:
          `## 🤝 Affiliate Program\n` +
          `**Your code:** \`${profile.code}\`\n` +
          `**Your link:** ${link}\n` +
          `**Commission:** ${(AFFILIATE_COMMISSION_RATE * 100).toFixed(0)}%\n` +
          `**Pending commission:** ${formatTokenAmount(profile.affiliateBalance)}\n\n` +
          `Use \`/affiliate_redeem\` to turn commission into Velvet Coins, or \`/affiliate_withdraw\` after ${formatTokenAmount(AFFILIATE_WITHDRAW_MIN)}.`,
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
          ? `## ✅ Commission Redeemed\n**Added to wallet:** ${formatTokenAmount(amount)}\n**Wallet balance:** ${formatTokenAmount(redeemed.balance)}\n**Affiliate balance:** ${formatTokenAmount(redeemed.affiliateBalance)}`
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
      const plan = SUBSCRIPTION_PLANS[planKey];

      if (!plan) {
        await interaction.reply({ content: "## ⚠️ Invalid plan", flags: 64 });
        return;
      }

      if (PAYMENT_PROVIDER === "stripe" && !STRIPE_SECRET_KEY) {
        await interaction.reply({
          content:
            `## ⚠️ Stripe checkout is not configured\n` +
            `Plan: **${plan.label}**\n` +
            `Price: **R$ ${plan.brl.toFixed(2)}/month**`,
          flags: 64,
        });
        return;
      }

      if (PAYMENT_PROVIDER === "mercadopago" && !MERCADO_PAGO_ACCESS_TOKEN) {
        await interaction.reply({
          content:
            `## ⚠️ Subscription checkout is not configured\n` +
            `Plan: **${plan.label}**\n` +
            `Price: **R$ ${plan.brl.toFixed(2)}/month**\n\n` +
            "The team can activate it manually for now.",
          flags: 64,
        });
        return;
      }

      try {
        let link = null;
        let provider = "Stripe";

        if (PAYMENT_PROVIDER === "mercadopago") {
          const subscription = await createMercadoPagoSubscription({
            userId: interaction.user.id,
            planKey,
            email,
          });
          link = subscription.init_point || subscription.sandbox_init_point || null;
          provider = "Mercado Pago";
        } else {
          const session = await createStripeSubscriptionSession({
            userId: interaction.user.id,
            planKey,
            email,
          });
          link = session.url || null;
        }

        await interaction.reply({
          content:
            `# ⭐ Velvet ${plan.label}\n` +
            `**Price:** R$ ${plan.brl.toFixed(2)}/month\n` +
            `**Provider:** ${provider}\n` +
            `**Email:** ${email}\n\n` +
            (link
              ? `Complete your subscription here:\n${link}`
              : "Subscription created, but Mercado Pago did not return a checkout link."),
          flags: 64,
        });
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
        content: `## ➕ Saldo Adicionado\n**Usuário:** ${target}\n**Valor:** +${formatTokenAmount(amount)}\n**Novo saldo:** ${formatTokenAmount(balance)}`,
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
          content: `Saldo insuficiente no usuario. Saldo atual: ${formatTokenAmount(debit.balance)}`,
          flags: 64,
        });
        return;
      }

      await interaction.reply({
        content: `## ➖ Saldo Removido\n**Usuário:** ${target}\n**Valor:** -${formatTokenAmount(amount)}\n**Novo saldo:** ${formatTokenAmount(debit.balance)}`,
        flags: 64,
      });
      return;
    }

    if (interaction.commandName === "velvet_admin_compras" || interaction.commandName === "admin_purchases") {
      const db = readWalletDb();
      const pending = db.purchaseRequests.filter(item => item.status === "pending").slice(-10);

      await interaction.reply({
        content: pending.length
          ? [
            "## 🧾 Compras Pendentes",
            ...pending.map(item =>
              `\`${item.id}\` | <@${item.userId}> | **${formatTokenAmount(item.amount)}** | R$ ${item.brl.toFixed(2)}`
            ),
          ].join("\n")
          : "## ✅ Compras Pendentes\nNão há compras pendentes.",
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
          `## ${action === "aprovar" ? "✅ Compra Aprovada" : "❌ Compra Rejeitada"}\n` +
          `**ID:** \`${requestId}\`\n` +
          `**Usuário:** <@${resolved.request.userId}>\n` +
          `**Quantidade:** ${formatTokenAmount(resolved.request.amount)}`,
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

    if (interaction.commandName === "refazer_preco" || interaction.commandName === "price") {
      await interaction.deferReply({ flags: 64 });

      const mode = interaction.options.getString("modo");
      const texture = interaction.options.getString("textura") || interaction.options.getString("texture");
      const enhancement = interaction.options.getString("melhoria") || interaction.options.getString("enhancement");
      const triangles = interaction.options.getInteger("triangles");
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

    if (interaction.commandName === "copiar" || interaction.commandName === "steal") {
      const lang = interaction.commandName === "steal" ? "en" : languageFor(interaction);
      const id = interaction.options.getString("id").trim();
      const quote = calculateCopyPrice(interaction);
      const balanceBefore = walletBalance(interaction.user.id);

      if (balanceBefore < quote.walletAmount) {
        await interaction.reply({
          content: lang === "pt-BR"
            ?
            `## ⚠️ Saldo insuficiente\n` +
            `**Serviço:** Copiar modelo original\n` +
            `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
            `**Seu saldo:** ${formatTokenAmount(balanceBefore)}\n\n` +
            "Use `/velvet_comprar` para criar um pedido de compra."
            :
            `## ⚠️ Insufficient Balance\n` +
            `**Service:** Copy original asset\n` +
            `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
            `**Your balance:** ${formatTokenAmount(balanceBefore)}\n\n` +
            "Use `/buy` to create a purchase request.",
          flags: 64,
        });
        return;
      }

      await interaction.reply(
        lang === "pt-BR"
          ? `## 📎 Copiar Modelo\n` +
            `**UGC:** \`${id}\`\n` +
            `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n\n` +
            "⏳ Preparando arquivos originais..."
          : `## 📎 Copy Asset\n` +
            `**UGC:** \`${id}\`\n` +
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
          meta: { command: "copiar", ugcId: id, priceBrl: quote.price },
        });

        await interaction.editReply({
          content: lang === "pt-BR"
            ?
            `## ✅ Modelo Copiado\n` +
            `**UGC:** \`${id}\`\n` +
            `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
            `**Saldo restante:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
            "📦 Arquivos originais anexados abaixo."
            :
            `## ✅ Asset Copied\n` +
            `**UGC:** \`${id}\`\n` +
            `**Price:** ${formatTokenAmount(quote.walletAmount)}\n` +
            `**Remaining balance:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}\n\n` +
            "📦 Original files are attached below.",
          files: attachmentsFromPaths(files).slice(0, 10),
        });
      } catch (err) {
        console.error(err);
        await interaction.editReply(lang === "pt-BR"
          ? "## ⚠️ Não consegui copiar esse modelo\nA equipe pode revisar o ID manualmente."
          : "## ⚠️ I could not copy this asset\nThe team can review this ID manually.");
      }
      return;
    }

    if (interaction.commandName === "bulk_steal") {
      if (!userIsPremium(interaction) && !userIsAdmin(interaction)) {
        await interaction.reply({
          content: "## 🔒 Premium only\nBulk copy is available for premium members.",
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
        `**Price:** Free for premium\n\n` +
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

    if (interaction.commandName === "bulk_remake") {
      if (!userIsPremium(interaction) && !userIsAdmin(interaction)) {
        await interaction.reply({
          content: "## 🔒 Premium only\nBulk remake is available for premium members.",
          flags: 64,
        });
        return;
      }

      const ids = parseBulkIds(interaction.options.getString("ids"));

      if (!ids.length) {
        await interaction.reply({ content: "## ⚠️ No valid IDs found", flags: 64 });
        return;
      }

      const texture = interaction.options.getString("texture") || "standard";
      const enhancement = interaction.options.getString("enhancement") || "none";
      const triangles = interaction.options.getInteger("triangles");
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

    if (interaction.commandName === "refazer_multiview" || interaction.commandName === "multiview") {
      await interaction.deferReply();

      const confirmation = (interaction.options.getString("confirmar") || interaction.options.getString("confirm")).trim().toUpperCase();

      if (!["SIM", "YES"].includes(confirmation)) {
        await interaction.editReply({
          content: "## ⚠️ Request not confirmed\nSend it again with `confirm: YES` after checking **front**, **right**, **back** and **left**.",
        });
        return;
      }

      const texture = interaction.options.getString("textura") || interaction.options.getString("texture");
      const enhancement = interaction.options.getString("melhoria") || interaction.options.getString("enhancement");
      const shouldGenerateNow = (interaction.options.getString("gerar") || interaction.options.getString("generate")) === "sim";
      const triangles = interaction.options.getInteger("triangles") || PRICE_CONFIG.maxTriangles;
      const quote = calculatePrice(interaction, {
        mode: "multiview",
        texture,
        triangles,
        enhancement,
      });

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

      await interaction.editReply({
        content:
          formatPriceQuote({ mode: "multiview", texture, triangles, enhancement, quote }) +
          "\n\n### 🖼️ Conferência das Fotos\n" +
          MULTIVIEW_VIEW_ORDER
            .filter(view => viewPaths[view])
            .map((view, index) => `**${index + 1}. ${view}:** \`${path.basename(viewPaths[view])}\``)
            .join("\n") +
          (shouldGenerateNow
            ? "\n\n✅ **Confirmado.** Iniciando a geração do modelo final..."
            : "\n\n👀 Confira os anexos. Se algum lado estiver trocado, envie o comando novamente antes de gerar."),
        files: multiviewReviewAttachments(viewPaths),
      });

      if (!shouldGenerateNow) {
        return;
      }

      if (!TRIPO_API_KEY) {
        await interaction.followUp("Geracao real ainda nao configurada. Chame o suporte.");
        return;
      }

      if (!imageEnhancementIsReady(enhancement)) {
        await interaction.followUp({
          content: "## ⚠️ Melhoria indisponível\nEssa opção ainda não está configurada. Use **Sem melhoria** ou chame a equipe.",
          flags: 64,
        });
        return;
      }

      const balanceBefore = walletBalance(interaction.user.id);
      if (balanceBefore < quote.walletAmount) {
        await interaction.followUp({
          content:
            `## ⚠️ Saldo insuficiente\n` +
            `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
            `**Seu saldo:** ${formatTokenAmount(balanceBefore)}\n\n` +
            "Use `/velvet_comprar` para criar um pedido de compra.",
          flags: 64,
        });
        return;
      }

      if ((IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none).model !== null) {
        await interaction.followUp("✨ **Melhorando imagens de referência...**");
        const orderedPaths = MULTIVIEW_VIEW_ORDER.map(view => viewPaths[view]).filter(Boolean);
        const enhanced = await enhanceImagePaths(orderedPaths, 5, tempDir, false, enhancement);
        MULTIVIEW_VIEW_ORDER.forEach((view, index) => {
          if (enhanced.imagePaths[index]) viewPaths[view] = enhanced.imagePaths[index];
        });
      }

      const model = await generateMultiviewWithOfficialTripo({
        viewPaths,
        texture,
        triangles,
        tempDir,
        onProgress: async ({ status, progress }) => {
          await interaction.followUp(`Geracao: ${status || "processando"} ${progress || 0}%`).catch(() => {});
        },
      });

      const debit = removeWalletBalance({
        userId: interaction.user.id,
        amount: quote.walletAmount,
        actorId: client.user.id,
        reason: "Modelo multiview gerado",
        meta: { command: "refazer_multiview", priceBrl: quote.price },
      });

      await interaction.followUp({
        content:
          `## ✅ Modelo Final Gerado\n` +
          `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Saldo restante:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}`,
        files: attachmentsFromPaths([model.modelPath]).slice(0, 1),
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
      content: `Ultimo modelo finalizado:\n${path.basename(latest.modelPath)}`,
      files: [new AttachmentBuilder(latest.modelPath)],
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
  const difference = interaction.options.getInteger("diferenca") || interaction.options.getInteger("difference");
  const enhancement = interaction.options.getString("melhoria") || interaction.options.getString("enhancement") || "none";
  const texture = interaction.options.getString("textura") || interaction.options.getString("texture") || "standard";
  const triangles = interaction.options.getInteger("triangles");
  const preferredView = interaction.options.getString("vista") || interaction.options.getString("view");
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
    await interaction.reply({
      content: "## ⚠️ Melhoria indisponível\nEssa opção ainda não está configurada. Use **Sem melhoria** ou chame a equipe.",
      flags: 64,
    });
    return;
  }

  if (!mockIa && TRIPO_API_KEY) {
    const balanceBefore = walletBalance(interaction.user.id);
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

  await interaction.reply(
    `## 🎨 Refazer UGC\n` +
    `**UGC:** \`${id}\`\n` +
    `**Diferença:** ${difference}/10\n` +
    `**Textura:** ${texture === "none" ? "sem textura" : texture === "hd" ? "HD" : "padrão"}\n` +
    `**Melhoria:** ${(IMAGE_ENHANCEMENTS[enhancement] || IMAGE_ENHANCEMENTS.none).label}\n` +
    `**Triangles:** ${triangles || "sem limite especial"}\n` +
    `**Vista de referência:** ${preferredView || "auto"}\n` +
    `**Preço estimado:** ${formatTokenAmount(quote.walletAmount)}\n` +
    `**Modo teste:** ${mockIa ? "sim" : "não"}\n\n` +
    "⏳ **Etapa 1/3:** preparando o UGC e gerando fotos base..."
  );

  let result;

  try {
    result = await processUGC(id);

    await interaction.editReply(
      `## 🎨 Refazer UGC\n` +
      `**UGC:** \`${id}\`\n` +
      `**MeshId:** \`${result.meshId}\`\n` +
      `**TextureId:** \`${result.textureId || "não encontrado"}\`\n\n` +
      "⏳ **Etapa 2/3:** preparando imagens de referência..."
    );

    const enhanced = await enhanceImagesWithNanoBanana(result.renderDir, difference, result.tempDir, mockIa, enhancement);

    if (enhanced.skipped) {
      await interaction.followUp(
        "🖼️ Usando as fotos renderizadas originais como referência."
      );
    } else if (enhanced.mocked) {
      await interaction.followUp({
        content: "Modo teste pronto. Usei copias das fotos base para testar a entrega:",
        files: attachmentsFromPaths(enhanced.imagePaths).slice(0, 5),
      });
    } else {
      await interaction.followUp({
        content: "✨ Fotos melhoradas/variadas prontas:",
        files: attachmentsFromPaths(enhanced.imagePaths).slice(0, 5),
      });
    }

    await interaction.followUp("⏳ **Etapa 3/3:** gerando o modelo final...");

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
        onProgress: async ({ status, progress }) => {
          await interaction.followUp(`Geracao: ${status || "processando"} ${progress || 0}%`).catch(() => {});
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
      const debit = removeWalletBalance({
        userId: interaction.user.id,
        amount: quote.walletAmount,
        actorId: client.user.id,
        reason: "Modelo por imagem unica gerado",
        meta: { command: "refazer", ugcId: id, priceBrl: quote.price },
      });

      await interaction.followUp({
        content:
          `## ✅ Modelo Final Gerado\n` +
          `**UGC:** \`${id}\`\n` +
          `**Imagem usada:** ${tripo.sourceImage || "não informado"}\n` +
          `**Preço:** ${formatTokenAmount(quote.walletAmount)}\n` +
          `**Saldo restante:** ${formatTokenAmount(debit.ok ? debit.balance : walletBalance(interaction.user.id))}`,
        files: attachmentsFromPaths([tripo.modelPath]).slice(0, 1),
      });
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

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp("Erro ao gerar o modelo. O pedido sera revisado manualmente.");
    } else {
      await interaction.reply("Erro ao gerar o modelo. O pedido sera revisado manualmente.");
    }
  }
  } catch (err) {
    console.error(err);

    const message = "Erro ao processar o comando. Tente novamente ou chame o suporte.";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, flags: 64 }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: 64 }).catch(() => {});
    }
  }
});

registerCommands()
  .then(() => client.login(TOKEN))
  .catch(err => {
    console.error("Erro ao iniciar bot laboratorio:", err);
  });
