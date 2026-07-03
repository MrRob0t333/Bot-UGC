require("dotenv").config();

const fs = require("fs");
const path = require("path");
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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ROBLOSECURITY = process.env.ROBLOSECURITY;

const PREMIUM_ROLE = "1521989120745013459";
const NORMAL_ROLE = "1521959526394237089";

const BLENDER_PATH =
    process.env.BLENDER_PATH ||
    "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe";

const UPLOAD_COST = 300;
const MAX_BULK = 20;
const COOLDOWN_MS = 5000;

const cooldowns = new Map();

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Falta DISCORD_TOKEN, CLIENT_ID ou GUILD_ID no .env");
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

const ByteReader = require("./parsers/ByteReader.js");
global.ByteReader = ByteReader;

const DracoBitstream = require("./parsers/DracoBitstream.js");
global.DracoBitstream = DracoBitstream;

const RBXMeshParser = require("./parsers/MeshParser.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const photoOption = option =>
  option
    .setName("fotos")
    .setDescription("Gerar fotos? Premium apenas")
    .setRequired(false)
    .addChoices(
      { name: "Sim", value: "sim" },
      { name: "Não", value: "nao" }
    );

const commands = [
  new SlashCommandBuilder()
    .setName("ugc")
    .setDescription("Baixa GLB, OBJ, PNG e RBXM de um UGC")
    .addStringOption(o =>
      o.setName("id").setDescription("ID do UGC").setRequired(true)
    )
    .addStringOption(photoOption)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("ugc_bulk")
    .setDescription("Baixa até 20 UGCs de uma vez. Premium apenas")
    .addStringOption(o =>
      o.setName("ids").setDescription("IDs separados por vírgula ou espaço").setRequired(true)
    )
    .addStringOption(photoOption)
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  console.log("🔄 Limpando comandos globais antigos...");
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

  console.log("🔄 Registrando comandos no servidor...");
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });

  console.log("✅ Comandos registrados.");
}

function hasRole(interaction, roleId) {
  return interaction.member.roles.cache.has(roleId);
}

function userIsPremium(interaction) {
  return hasRole(interaction, PREMIUM_ROLE);
}

function userIsAllowed(interaction) {
  return hasRole(interaction, PREMIUM_ROLE) || hasRole(interaction, NORMAL_ROLE);
}

async function checkCooldown(interaction) {
  const userId = interaction.user.id;
  const now = Date.now();
  const last = cooldowns.get(userId) || 0;

  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);

    await interaction.reply({
      content: `⏳ Espere ${wait}s para usar outro comando.`,
      ephemeral: true,
    });

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
    console.error("[downloadBuffer]", {
      status: res.status,
      statusText: res.statusText,
      url,
    });

    if (res.status === 404) {
      throw new Error("Não consegui processar esse item. Ele pode ser um bundle, cabeça dinâmica, emote, corpo ou roupa 3D ainda não suportado.");
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error("Não tenho permissão para acessar esse item.");
    }

    throw new Error(`Falha ao processar o item. Código: ${res.status}`);
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

  if (!vertices?.length) throw new Error("Mesh sem vértices.");
  if (!faces?.length) throw new Error("Mesh sem faces.");

  let obj = "";

  let outIndex = 1;

  for (let i = 0; i < faces.length; i += 3) {
    const faceVerts = [faces[i], faces[i + 1], faces[i + 2]];

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

async function processUGC(ugcId, shouldRender) {
  const tempDir = path.join(__dirname, "temp", String(ugcId));
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
    throw new Error(`Não consegui encontrar MeshId no UGC ${ugcId}.`);
  }

  console.log("UGC:", ugcId);
  console.log("MeshId:", meshId);
  console.log("TextureId:", textureId || "não encontrado");

  const meshBuffer = await downloadRobloxAsset(meshId);
  const mesh = RBXMeshParser.parse(meshBuffer);

  let hasTexture = false;

  if (textureId) {
    try {
      const textureBuffer = await downloadRobloxAsset(textureId);
      fs.writeFileSync(texturePath, textureBuffer);
      hasTexture = true;
    } catch (err) {
      console.warn("⚠️ Não consegui baixar textura:", err.message);
    }
  }

  writeObj(mesh, objPath);

  try {
    console.log("📦 Exportando GLB...");
    await exportGlb(objPath, hasTexture ? texturePath : "", glbPath);
    console.log("✅ GLB exportado.");
  } catch (err) {
    console.warn("⚠️ Não consegui exportar GLB:", err.message);
  }

  let renderDir = null;

  if (shouldRender) {
    console.log("🎥 Renderizando imagens...");
    renderDir = await renderImages(objPath, hasTexture ? texturePath : "", tempDir);
    console.log("✅ Renders finalizados.");
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

function getMainFiles(result) {
  const files = [];

  if (fs.existsSync(result.glbPath)) files.push(new AttachmentBuilder(result.glbPath));
  files.push(new AttachmentBuilder(result.objPath));
  files.push(new AttachmentBuilder(result.rbxmPath));

  if (result.hasTexture) files.push(new AttachmentBuilder(result.texturePath));

  return files;
}

function getRenderFiles(result) {
  if (!result.renderDir || !fs.existsSync(result.renderDir)) return [];

  return ["frente.png", "direita.png", "costas.png", "esquerda.png", "isometrica.png"]
    .map(f => path.join(result.renderDir, f))
    .filter(p => fs.existsSync(p))
    .map(p => new AttachmentBuilder(p));
}

client.once("clientReady", () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!await checkCooldown(interaction)) return;

  if (!userIsAllowed(interaction)) {
    await interaction.reply({
      content: "❌ Você não tem cargo permitido para usar esse bot.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "ugc") {
    const id = interaction.options.getString("id").trim();
    const wantsPhotos = interaction.options.getString("fotos") === "sim";
    const premium = userIsPremium(interaction);
    const shouldRender = wantsPhotos && premium;

    await interaction.reply(
      `⏳ Processando UGC: ${id}\n` +
      `💰 Custo estimado de upload: ${UPLOAD_COST} Robux\n` +
      `📸 Fotos: ${shouldRender ? "sim" : wantsPhotos ? "apenas premium" : "não"}`
    );

    try {
      const result = await processUGC(id, false);

      await interaction.editReply({
        content:
          `✅ Arquivos principais prontos!\n` +
          `MeshId: ${result.meshId}\n` +
          `TextureId: ${result.textureId || "não encontrado"}\n` +
          `💰 Custo estimado de upload: ${UPLOAD_COST} Robux\n` +
          (shouldRender ? `📸 As fotos serão entregues em alguns segundos...` : ""),
        files: getMainFiles(result),
      });

      if (shouldRender) {
        try {
          result.renderDir = await renderImages(
            result.objPath,
            result.hasTexture ? result.texturePath : "",
            result.tempDir
          );

          const renderFiles = getRenderFiles(result);

          if (renderFiles.length) {
            await interaction.followUp({
              content: `📸 Fotos do UGC ${id}:`,
              files: renderFiles,
            });
          }
        } catch (err) {
          await interaction.followUp(`⚠️ Não consegui gerar as fotos: ${err.message}`);
        }
      }

      setTimeout(() => {
        try {
          fs.rmSync(result.tempDir, { recursive: true, force: true });
        } catch {}
      }, 30000);

    } catch (err) {
      console.error(err);
      await interaction.editReply(`❌ Erro: ${err.message}`);
    }
  }

  if (interaction.commandName === "ugc_bulk") {
    const premium = userIsPremium(interaction);

    if (!premium) {
      await interaction.reply({
        content: "❌ Esse comando é apenas para premium.",
        ephemeral: true,
      });
      return;
    }

    const idsRaw = interaction.options.getString("ids");
    const wantsPhotos = interaction.options.getString("fotos") === "sim";

    const ids = idsRaw
      .split(/[,\s]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, MAX_BULK);

    if (!ids.length) {
      await interaction.reply("❌ Envie pelo menos 1 ID.");
      return;
    }

    const totalCost = ids.length * UPLOAD_COST;

    await interaction.reply(
      `⏳ Processando ${ids.length} UGCs...\n` +
      `💰 Custo estimado de upload: ${totalCost} Robux\n` +
      `📸 Fotos: ${wantsPhotos ? "sim" : "não"}\n` +
      `📦 Limite: ${MAX_BULK} UGCs por bulk`
    );

    const results = [];
    const failed = [];

    for (const id of ids) {
      try {
        const result = await processUGC(id, false);
        results.push(result);

        await interaction.followUp({
          content:
            `✅ UGC ${result.ugcId} pronto!\n` +
            `MeshId: ${result.meshId}\n` +
            `TextureId: ${result.textureId || "não encontrado"}\n` +
            `💰 Custo estimado de upload desse item: ${UPLOAD_COST} Robux`,
          files: getMainFiles(result),
        });

        if (wantsPhotos) {
          await interaction.followUp(`📸 UGC ${result.ugcId}: gerando fotos...`);

          try {
            result.renderDir = await renderImages(
              result.objPath,
              result.hasTexture ? result.texturePath : "",
              result.tempDir
            );

            const renderFiles = getRenderFiles(result);

            if (renderFiles.length) {
              await interaction.followUp({
                content: `📸 Fotos do UGC ${result.ugcId}:`,
                files: renderFiles,
              });
            }
          } catch (err) {
            await interaction.followUp(`⚠️ UGC ${result.ugcId}: não consegui gerar fotos: ${err.message}`);
          }
        }

      } catch (err) {
        failed.push(`${id}: ${err.message}`);
        await interaction.followUp(`❌ Falha no UGC ${id}: ${err.message}`);
      }
    }

    await interaction.followUp(
      `✅ Bulk finalizado!\n` +
      `Itens processados: ${results.length}/${ids.length}\n` +
      `💰 Custo estimado total de upload: ${totalCost} Robux\n` +
      (failed.length ? `\nFalhas:\n${failed.slice(0, 10).join("\n")}` : "")
    );

    setTimeout(() => {
      try {
        for (const r of results) {
          fs.rmSync(r.tempDir, { recursive: true, force: true });
        }
      } catch {}
    }, 60000);
  }
});

registerCommands()
  .then(() => client.login(TOKEN))
  .catch(err => {
    console.error("❌ Erro ao iniciar:", err);
  });