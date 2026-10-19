"use strict";

/**
 * Integração com o discord.js: login, registro dos comandos no servidor,
 * roteamento de interações e envio de mensagens/alertas.
 */

const { Client, GatewayIntentBits, REST, Routes, Events } = require("discord.js");
const { COMMANDS } = require("./commands");
const { alertEmbed } = require("./embeds");

async function registerCommands({ token, clientId, guildId, logger }) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: COMMANDS });
  logger?.info(`${COMMANDS.length} comandos registrados no servidor ${guildId}.`);
}

function createDiscordBot({ config, logger, handlers }) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const channelCache = new Map();
  let ready = false;

  async function getChannel(channelId) {
    if (channelCache.has(channelId)) return channelCache.get(channelId);
    const channel = await client.channels.fetch(channelId);
    if (!channel || typeof channel.send !== "function") {
      throw new Error(`Canal ${channelId} não encontrado ou não é um canal de texto que o bot consiga ver.`);
    }
    channelCache.set(channelId, channel);
    return channel;
  }

  async function send(channelId, payload) {
    if (!ready) throw new Error("Bot do Discord ainda não está conectado.");
    const channel = await getChannel(channelId);
    return channel.send({ allowedMentions: { parse: [] }, ...payload });
  }

  async function sendAlert(alert) {
    const payload = { embeds: [alertEmbed(alert)], allowedMentions: { parse: [] } };
    if (config.discord.alertChannelId) {
      await send(config.discord.alertChannelId, payload);
      return;
    }
    for (const ownerId of config.ownerIds) {
      try {
        const user = await client.users.fetch(ownerId);
        await user.send(payload);
      } catch (error) {
        logger?.warn(`Não foi possível mandar DM de alerta para ${ownerId}:`, error?.message || error);
      }
    }
  }

  client.on(Events.InteractionCreate, interaction => {
    handlers.handle(interaction).catch(error => logger?.error("Falha não tratada na interação:", error));
  });
  client.on(Events.Error, error => logger?.error("Erro do cliente Discord:", error));
  client.on(Events.ShardDisconnect, () => logger?.warn("Desconectado do Discord; o discord.js vai reconectar."));

  return {
    client,
    send,
    sendAlert,
    isReady: () => ready,
    async start() {
      await registerCommands({ ...config.discord, logger });
      const readyPromise = new Promise(resolve => client.once(Events.ClientReady, resolve));
      await client.login(config.discord.token);
      await readyPromise;
      ready = true;
      logger?.info(`Bot de vendas pronto como ${client.user.tag}.`);
    },
    async stop() {
      ready = false;
      await client.destroy();
    },
  };
}

module.exports = { createDiscordBot, registerCommands };
