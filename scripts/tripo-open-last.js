const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const storagePath = path.join(rootDir, ".auth", "tripo-storage.json");
const refazerTempDir = path.join(rootDir, "temp", "refazer");
const startUrl = process.env.TRIPO_STUDIO_URL || "https://studio.tripo3d.ai/workspace/generate";
const browserChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL || "chrome";

function newestDirectory(parentDir) {
  if (!fs.existsSync(parentDir)) return null;

  return fs.readdirSync(parentDir)
    .map(name => path.join(parentDir, name))
    .filter(file => fs.statSync(file).isDirectory())
    .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file || null;
}

function renderImages(runDir) {
  const rendersDir = path.join(runDir, "renders");

  return ["frente.png", "direita.png", "costas.png", "esquerda.png", "isometrica.png"]
    .map(name => path.join(rendersDir, name))
    .filter(file => fs.existsSync(file));
}

(async () => {
  if (!fs.existsSync(storagePath)) {
    console.error("Sessao do Tripo nao encontrada. Rode primeiro: npm.cmd run tripo:login");
    process.exit(1);
  }

  const runDir = newestDirectory(refazerTempDir);

  if (!runDir) {
    console.error("Nenhuma execucao do /refazer encontrada. Rode /refazer_mock ou /refazer no Discord primeiro.");
    process.exit(1);
  }

  const images = renderImages(runDir);

  if (!images.length) {
    console.error(`Nao encontrei imagens renderizadas em ${runDir}`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
    channel: browserChannel,
  });

  const context = await browser.newContext({
    storageState: storagePath,
    viewport: null,
  });
  const page = await context.newPage();

  console.log("Abrindo Tripo com sua sessao salva.");
  console.log("Imagens da ultima execucao para enviar:");

  for (const image of images) {
    console.log(`- ${image}`);
  }

  console.log("\nNesta etapa voce ainda envia manualmente no site.");
  console.log("Dica: se o Tripo pedir upload, selecione exatamente as imagens listadas acima.");
  console.log("Depois que eu souber os botoes/telas exatos da sua conta, automatizamos upload e download.");

  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
})().catch(err => {
  console.error(err);
  process.exit(1);
});
