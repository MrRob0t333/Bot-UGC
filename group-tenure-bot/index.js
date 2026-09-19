require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const TOKEN = String(process.env.DISCORD_TOKEN || "").trim();
const CLIENT_ID = String(process.env.CLIENT_ID || "").trim();
const GUILD_ID = String(process.env.GUILD_ID || "").trim();
const ROBLOX_OPEN_CLOUD_API_KEY = String(process.env.ROBLOX_OPEN_CLOUD_API_KEY || "").trim();
const ADMIN_USER_IDS = new Set(
  String(process.env.ADMIN_USER_IDS || "")
    .split(/[\s,;]+/)
    .map(value => value.trim())
    .filter(Boolean)
);
const COMMAND_CHANNEL_ID = String(process.env.COMMAND_CHANNEL_ID || "").trim();
const DATA_PATH = path.join(__dirname, "data", "group-tenure.json");

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !ROBLOX_OPEN_CLOUD_API_KEY) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID, GUILD_ID or ROBLOX_OPEN_CLOUD_API_KEY in .env.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("group_add")
    .setDescription("Admin: adicionar um grupo Roblox ao monitoramento")
    .addStringOption(option => option.setName("group_id").setDescription("ID do grupo Roblox").setRequired(true))
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("group_remove")
    .setDescription("Admin: remover um grupo Roblox monitorado")
    .addStringOption(option => option.setName("group_id").setDescription("ID do grupo Roblox").setRequired(true))
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("group_list")
    .setDescription("Listar os grupos Roblox monitorados neste servidor")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("group_time")
    .setDescription("Consultar o tempo atual de um usuário nos grupos")
    .addStringOption(option => option.setName("username").setDescription("Nome de usuário Roblox").setRequired(true))
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("link_roblox")
    .setDescription("Vincular sua conta Discord a um usuário Roblox")
    .addStringOption(option => option.setName("username").setDescription("Seu nome de usuário Roblox").setRequired(true))
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("my_group_time")
    .setDescription("Consultar sua conta Roblox vinculada nos grupos")
    .setDMPermission(false),
].map(command => command.toJSON());

function readData() {
  const defaults = { guilds: {} };
  try {
    if (!fs.existsSync(DATA_PATH)) return defaults;
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return { ...defaults, ...(data || {}), guilds: data?.guilds || {} };
  } catch (error) {
    console.warn("Could not read group tenure data:", error.message);
    return defaults;
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  const temporaryPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryPath, DATA_PATH);
}

function guildState(data, guildId) {
  data.guilds[guildId] ||= { groups: [], links: {} };
  data.guilds[guildId].groups ||= [];
  data.guilds[guildId].links ||= {};
  return data.guilds[guildId];
}

function isAdmin(interaction) {
  return ADMIN_USER_IDS.has(interaction.user.id)
    || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function validGroupId(value) {
  const id = String(value || "").trim();
  return /^\d{1,20}$/.test(id) ? id : null;
}

async function robloxFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "x-api-key": ROBLOX_OPEN_CLOUD_API_KEY,
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  let json = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    // Keep a short text snippet for useful diagnostics.
  }
  if (!response.ok) {
    const detail = json?.message || body.slice(0, 220) || response.statusText;
    throw new Error(`Roblox API ${response.status}: ${detail}`);
  }
  return json;
}

async function resolveRobloxUser(username) {
  const cleanUsername = String(username || "").trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(cleanUsername)) {
    throw new Error("Use a valid Roblox username.");
  }
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: false }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.data?.length) {
    throw new Error("Roblox username not found.");
  }
  return json.data[0];
}

async function membershipForUser(groupId, userId) {
  const url = new URL(`https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships`);
  url.searchParams.set("maxPageSize", "10");
  url.searchParams.set("filter", `user == 'users/${userId}'`);
  const response = await robloxFetch(url);
  return response?.groupMemberships?.[0] || null;
}

async function publicRobloxFetch(url) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Roblox public API ${response.status}.`);
  }
  return json;
}

async function groupProfile(groupId) {
  const [group, thumbnails, roles] = await Promise.all([
    publicRobloxFetch(`https://groups.roblox.com/v1/groups/${groupId}`),
    publicRobloxFetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`),
    publicRobloxFetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`).catch(() => ({ roles: [] })),
  ]);
  return {
    id: String(groupId),
    name: group?.name || `Grupo ${groupId}`,
    iconUrl: thumbnails?.data?.[0]?.imageUrl || null,
    roles: roles?.roles || [],
  };
}

async function userAvatar(userId) {
  const thumbnails = await publicRobloxFetch(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
  );
  return thumbnails?.data?.[0]?.imageUrl || null;
}

function membershipRole(membership, group) {
  const role = membership?.role;
  if (typeof role === "string" && role.trim()) {
    const roleId = role.match(/(\d+)$/)?.[1];
    const matchedRole = group?.roles?.find(entry => String(entry.id) === roleId);
    return matchedRole?.name || "Membro";
  }
  return role?.displayName || role?.name || membership?.roleName || "Membro";
}

function formatDuration(start) {
  const elapsed = Math.max(0, Date.now() - new Date(start).getTime());
  const totalMinutes = Math.floor(elapsed / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days % 30;
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? "ano" : "anos"}`);
  if (months) parts.push(`${months} ${months === 1 ? "mês" : "meses"}`);
  if (remainingDays || !parts.length) parts.push(`${remainingDays} ${remainingDays === 1 ? "dia" : "dias"}`);
  if (!years && !months && hours) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
  return parts.slice(0, 3).join(", ");
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

async function buildGroupTenureEmbeds(username, userId, groups) {
  const avatarUrl = await userAvatar(userId).catch(() => null);
  const results = await Promise.all(groups.map(async groupId => {
    const [profileResult, membershipResult] = await Promise.allSettled([
      groupProfile(groupId),
      membershipForUser(groupId, userId),
    ]);
    const profile = profileResult.status === "fulfilled"
      ? profileResult.value
      : { id: groupId, name: `Grupo ${groupId}`, iconUrl: null, roles: [] };
    const membership = membershipResult.status === "fulfilled" ? membershipResult.value : null;
    const error = membershipResult.status === "rejected" ? membershipResult.reason : null;
    return { profile, membership, error };
  }));

  return results.map(({ profile, membership, error }) => {
    const joinedAt = membership?.createTime ? new Date(membership.createTime) : null;
    const joinedTimestamp = joinedAt ? Math.floor(joinedAt.getTime() / 1000) : null;
    const isMember = Boolean(joinedAt);
    const embed = new EmbedBuilder()
      .setColor(isMember ? 0x57F287 : 0xED4245)
      .setAuthor(avatarUrl ? { name: "Velvet Group Check", iconURL: avatarUrl } : { name: "Velvet Group Check" })
      .setTitle(isMember ? "Membro do grupo" : "Membro não encontrado")
      .setDescription(`**${username}** · Roblox ID: \`${userId}\``)
      .addFields(
        { name: "Grupo", value: `[${profile.name}](https://www.roblox.com/communities/${profile.id})`, inline: true },
        { name: "Cargo", value: isMember ? membershipRole(membership, profile) : "Não é membro atualmente", inline: true },
        {
          name: "Tempo no grupo",
          value: isMember
            ? `\`${formatDuration(membership.createTime)}\`\nEntrou em <t:${joinedTimestamp}:D> (<t:${joinedTimestamp}:R>)`
            : error ? "Não foi possível consultar agora." : "Sem vínculo atual com este grupo.",
          inline: false,
        }
      )
      .setFooter({ text: "O tempo considera a associação atual. Sair e entrar novamente reinicia a contagem." })
      .setTimestamp();
    if (profile.iconUrl) embed.setThumbnail(profile.iconUrl);
    return embed;
  });
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`Registered ${commands.length} group tenure commands.`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Group tenure bot ready as ${client.user.tag}.`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  const data = readData();
  const state = guildState(data, interaction.guildId);

  if (COMMAND_CHANNEL_ID && interaction.channelId !== COMMAND_CHANNEL_ID) {
    await interaction.reply({ content: `## Use the commands channel\nUse this bot in <#${COMMAND_CHANNEL_ID}>.`, ephemeral: true });
    return;
  }

  if (["group_add", "group_remove"].includes(interaction.commandName) && !isAdmin(interaction)) {
    await interaction.reply({ content: "## Admin only\nThis command is restricted to bot administrators.", ephemeral: true });
    return;
  }

  if (interaction.commandName === "group_add") {
    const groupId = validGroupId(interaction.options.getString("group_id"));
    if (!groupId) {
      await interaction.reply({ content: "## Invalid group ID\nUse a numeric Roblox group ID.", ephemeral: true });
      return;
    }
    if (!state.groups.includes(groupId)) state.groups.push(groupId);
    writeData(data);
    await interaction.reply({ content: `## Group added\nRoblox group \`${groupId}\` is now monitored.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === "group_remove") {
    const groupId = validGroupId(interaction.options.getString("group_id"));
    state.groups = state.groups.filter(id => id !== groupId);
    writeData(data);
    await interaction.reply({ content: `## Group removed\nRoblox group \`${groupId || "unknown"}\` is no longer monitored.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === "group_list") {
    await interaction.reply({ content: state.groups.length
      ? `## Grupos monitorados\n${state.groups.map(id => `- [Grupo ${id}](https://www.roblox.com/communities/${id})`).join("\n")}`
      : "## Grupos monitorados\nNenhum grupo foi configurado ainda. Um admin pode usar `/group_add`.", ephemeral: true });
    return;
  }

  if (interaction.commandName === "link_roblox") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const user = await resolveRobloxUser(interaction.options.getString("username"));
      state.links[interaction.user.id] = { id: String(user.id), username: user.name, linkedAt: new Date().toISOString() };
      writeData(data);
      await interaction.editReply(`## Roblox account linked\n**Account:** ${user.name} (\`${user.id}\`)\nUse \/my_group_time to check your configured groups.`);
    } catch (error) {
      await interaction.editReply(`## Could not link account\n${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "group_time" || interaction.commandName === "my_group_time") {
    if (!state.groups.length) {
      await interaction.reply({ content: "## No monitored groups\nAn admin must add a group first with `/group_add`.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    try {
      const linked = state.links[interaction.user.id];
      const user = interaction.commandName === "my_group_time"
        ? linked
        : await resolveRobloxUser(interaction.options.getString("username"));
      if (!user) throw new Error("No Roblox account linked. Use /link_roblox first.");
      const embeds = await buildGroupTenureEmbeds(user.username || user.name, user.id, state.groups);
      await interaction.editReply({ embeds: embeds.slice(0, 10) });
      for (let offset = 10; offset < embeds.length; offset += 10) {
        await interaction.followUp({ embeds: embeds.slice(offset, offset + 10) });
      }
    } catch (error) {
      await interaction.editReply(`## Could not check group time\n${error.message}`);
    }
  }
});

registerCommands()
  .then(() => client.login(TOKEN))
  .catch(error => {
    console.error("Startup failed:", error);
    process.exit(1);
  });
