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
const GROUP_PROFILE_CACHE_MS = 10 * 60 * 1000;
const groupProfileCache = new Map();

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !ROBLOX_OPEN_CLOUD_API_KEY) {
  console.error("Faltam DISCORD_TOKEN, CLIENT_ID, GUILD_ID ou ROBLOX_OPEN_CLOUD_API_KEY no .env.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("adicionar_grupo")
    .setDescription("Admin: adicionar um grupo à lista de consulta")
    .addStringOption(option => option.setName("id").setDescription("ID numérico do grupo Roblox").setRequired(true))
    .addStringOption(option => option.setName("nome").setDescription("Nome que aparecerá para escolha").setRequired(true).setMaxLength(100))
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("consultar")
    .setDescription("Consultar há quanto tempo uma pessoa está em um grupo")
    .addStringOption(option => option.setName("usuario").setDescription("Nome de usuário Roblox").setRequired(true))
    .addStringOption(option => option.setName("grupo").setDescription("Grupo monitorado").setAutocomplete(true).setRequired(true))
    .setDMPermission(false),
].map(command => command.toJSON());

function readData() {
  const defaults = { guilds: {} };
  try {
    if (!fs.existsSync(DATA_PATH)) return defaults;
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    return { ...defaults, ...(data || {}), guilds: data?.guilds || {} };
  } catch (error) {
    console.warn("Não foi possível ler os dados de tempo em grupo:", error.message);
    return defaults;
  }
}

function guildState(data, guildId) {
  data.guilds[guildId] ||= { groups: [] };
  data.guilds[guildId].groups ||= [];
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

function groupRecord(entry) {
  if (typeof entry === "string") return { id: entry, name: "" };
  return { id: String(entry?.id || ""), name: String(entry?.name || "").trim() };
}

function groupIdExists(groups, groupId) {
  return groups.some(entry => groupRecord(entry).id === groupId);
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  const temporaryPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryPath, DATA_PATH);
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
    throw new Error("Use um nome de usuário Roblox válido.");
  }
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: false }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.data?.length) {
    throw new Error("Usuário Roblox não encontrado.");
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
  const cached = groupProfileCache.get(String(groupId));
  if (cached && Date.now() - cached.savedAt < GROUP_PROFILE_CACHE_MS) return cached.profile;
  const [group, thumbnails, roles] = await Promise.all([
    publicRobloxFetch(`https://groups.roblox.com/v1/groups/${groupId}`),
    publicRobloxFetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=150x150&format=Png&isCircular=false`),
    publicRobloxFetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`).catch(() => ({ roles: [] })),
  ]);
  const profile = {
    id: String(groupId),
    name: group?.name || `Grupo ${groupId}`,
    iconUrl: thumbnails?.data?.[0]?.imageUrl || null,
    roles: roles?.roles || [],
  };
  groupProfileCache.set(String(groupId), { profile, savedAt: Date.now() });
  return profile;
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

async function groupChoices(groups, query = "") {
  const needle = String(query).trim().toLocaleLowerCase("pt-BR");
  const profiles = await Promise.all(groups.map(async entry => {
    const record = groupRecord(entry);
    try {
      const profile = await groupProfile(record.id);
      return { ...profile, name: record.name || profile.name };
    } catch {
      return { id: record.id, name: record.name || `Grupo ${record.id}` };
    }
  }));
  return profiles
    .filter(profile => !needle || profile.name.toLocaleLowerCase("pt-BR").includes(needle) || profile.id.includes(needle))
    .slice(0, 25)
    .map(profile => ({ name: `${profile.name} (${profile.id})`.slice(0, 100), value: profile.id }));
}

async function buildGroupTenureEmbeds(username, userId, groups) {
  const avatarUrl = await userAvatar(userId).catch(() => null);
  const results = await Promise.all(groups.map(async entry => {
    const record = groupRecord(entry);
    const [profileResult, membershipResult] = await Promise.allSettled([
      groupProfile(record.id),
      membershipForUser(record.id, userId),
    ]);
    const loadedProfile = profileResult.status === "fulfilled"
      ? profileResult.value
      : { id: record.id, name: `Grupo ${record.id}`, iconUrl: null, roles: [] };
    const profile = { ...loadedProfile, name: record.name || loadedProfile.name };
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
      .setAuthor(avatarUrl ? { name: "Velvet | Consulta de Grupo", iconURL: avatarUrl } : { name: "Velvet | Consulta de Grupo" })
      .setTitle(isMember ? "Membro do grupo" : "Membro não encontrado")
      .setDescription(`**${username}** · ID Roblox: \`${userId}\``)
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
  console.log(`${commands.length} comandos de grupos registrados.`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Bot de grupos pronto como ${client.user.tag}.`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.guildId) return;
  const data = readData();
  const state = guildState(data, interaction.guildId);

  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== "consultar") return;
    try {
      await interaction.respond(await groupChoices(state.groups, interaction.options.getFocused()));
    } catch (error) {
      console.warn("Não foi possível completar grupos:", error.message);
      await interaction.respond([]);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (COMMAND_CHANNEL_ID && interaction.channelId !== COMMAND_CHANNEL_ID) {
    await interaction.reply({ content: `## Use o canal de comandos\nUse este bot em <#${COMMAND_CHANNEL_ID}>.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === "adicionar_grupo" && !isAdmin(interaction)) {
    await interaction.reply({ content: "## Apenas administradores\nEste comando é restrito aos administradores do bot.", ephemeral: true });
    return;
  }

  if (interaction.commandName === "adicionar_grupo") {
    const groupId = validGroupId(interaction.options.getString("id"));
    const groupName = String(interaction.options.getString("nome") || "").trim();
    if (!groupId || !groupName) {
      await interaction.reply({ content: "## Dados inválidos\nInforme um ID numérico e um nome para o grupo.", ephemeral: true });
      return;
    }
    state.groups = state.groups.map(groupRecord);
    const existing = state.groups.find(entry => entry.id === groupId);
    if (existing) existing.name = groupName;
    else state.groups.push({ id: groupId, name: groupName });
    writeData(data);
    await interaction.reply({ content: `## Grupo salvo\n**${groupName}** estará disponível no campo \`grupo\` de \/consultar.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === "consultar") {
    if (!state.groups.length) {
      await interaction.reply({ content: "## Nenhum grupo configurado\nNenhum grupo está disponível para consulta.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    try {
      const user = await resolveRobloxUser(interaction.options.getString("usuario"));
      const groupId = String(interaction.options.getString("grupo") || "").trim();
      if (!groupId || !groupIdExists(state.groups, groupId)) throw new Error("Selecione um grupo monitorado na lista.");
      const selectedGroup = state.groups.find(entry => groupRecord(entry).id === groupId);
      const embeds = await buildGroupTenureEmbeds(user.username || user.name, user.id, [selectedGroup]);
      await interaction.editReply({ embeds });
    } catch (error) {
      console.warn("Não foi possível consultar tempo no grupo:", error.message);
      await interaction.editReply(`## Não foi possível consultar o tempo no grupo\n${error.message}`);
    }
  }
});

registerCommands()
  .then(() => client.login(TOKEN))
  .catch(error => {
    console.error("Startup failed:", error);
    process.exit(1);
  });
