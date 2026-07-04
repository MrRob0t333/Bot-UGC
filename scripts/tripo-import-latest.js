const fs = require("fs");
const path = require("path");
const os = require("os");

const rootDir = path.resolve(__dirname, "..");
const refazerTempDir = path.join(rootDir, "temp", "refazer");
const downloadsDir = process.env.TRIPO_DOWNLOADS_DIR || path.join(os.homedir(), "Downloads");
const explicitFile = process.argv[2] ? path.resolve(process.argv[2]) : null;

function newestDirectory(parentDir) {
  if (!fs.existsSync(parentDir)) return null;

  return fs.readdirSync(parentDir)
    .map(name => path.join(parentDir, name))
    .filter(file => fs.statSync(file).isDirectory())
    .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file || null;
}

function ugcIdFromRunDir(runDir) {
  return path.basename(runDir).split("-")[0];
}

function modelFiles(parentDir) {
  if (!fs.existsSync(parentDir)) return null;

  return fs.readdirSync(parentDir)
    .map(name => path.join(parentDir, name))
    .filter(file => fs.statSync(file).isFile())
    .filter(file => [".glb", ".gltf", ".fbx", ".obj", ".zip"].includes(path.extname(file).toLowerCase()))
    .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function newestModelFile(parentDir, ugcId) {
  const files = modelFiles(parentDir) || [];
  const exactMatch = files.find(item => path.basename(item.file).includes(ugcId));

  return exactMatch?.file || null;
}

function recentModelFiles(parentDir) {
  return (modelFiles(parentDir) || []).slice(0, 8);
}

const runDir = newestDirectory(refazerTempDir);

if (!runDir) {
  console.error("Nenhuma execucao em temp/refazer encontrada.");
  process.exit(1);
}

const ugcId = ugcIdFromRunDir(runDir);
const downloadedModel = explicitFile || newestModelFile(downloadsDir, ugcId);

if (!downloadedModel) {
  console.error(`Nao encontrei modelo baixado que pareca ser do UGC ${ugcId} em ${downloadsDir}`);
  const recent = recentModelFiles(downloadsDir);

  if (recent.length) {
    console.error("\nModelos recentes encontrados:");
    for (const item of recent) {
      console.error(`- ${item.file}`);
    }
  }

  console.error("Baixe/exporte o modelo do Tripo primeiro, ou informe o arquivo manualmente:");
  console.error("npm.cmd run tripo:import-latest -- C:\\caminho\\do\\modelo.glb");
  process.exit(1);
}

if (!fs.existsSync(downloadedModel)) {
  console.error(`Arquivo informado nao existe: ${downloadedModel}`);
  process.exit(1);
}

const tripoDir = path.join(runDir, "tripo_ai");
fs.mkdirSync(tripoDir, { recursive: true });

const outputPath = path.join(tripoDir, `tripo_real${path.extname(downloadedModel).toLowerCase()}`);
fs.copyFileSync(downloadedModel, outputPath);

console.log(`Modelo importado: ${outputPath}`);
console.log(`Arquivo original: ${downloadedModel}`);
