const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const authDir = path.join(rootDir, ".auth");
const storagePath = path.join(authDir, "tripo-storage.json");
const startUrl = process.env.TRIPO_STUDIO_URL || "https://studio.tripo3d.ai/workspace/generate";
const browserChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL || "chrome";

async function waitForEnter(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await rl.question(message);
  rl.close();
}

(async () => {
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
    channel: browserChannel,
  });

  const context = await browser.newContext({
    viewport: null,
  });
  const page = await context.newPage();

  console.log("Abrindo Tripo. Faca login manualmente na janela que abriu.");
  console.log("Quando sua conta estiver logada, volte aqui e aperte Enter.");

  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  await waitForEnter("\nPressione Enter depois de concluir o login no Tripo...");

  await context.storageState({ path: storagePath });
  await browser.close();

  console.log(`Sessao salva em ${storagePath}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
