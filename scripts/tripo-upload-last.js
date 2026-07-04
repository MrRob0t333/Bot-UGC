const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const storagePath = path.join(rootDir, ".auth", "tripo-storage.json");
const refazerTempDir = path.join(rootDir, "temp", "refazer");
const startUrl = process.env.TRIPO_STUDIO_URL || "https://studio.tripo3d.ai/workspace/generate";
const browserChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL || "chrome";
const shouldGenerate = process.argv.includes("--generate");
const shouldInspect = process.argv.includes("--inspect");

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
  const preferredOrder = ["isometrica.png", "frente.png", "direita.png", "costas.png", "esquerda.png"];

  return preferredOrder
    .map(name => path.join(rendersDir, name))
    .filter(file => fs.existsSync(file));
}

async function clickModelMode(page) {
  const modelTab = page.getByText("Modelo", { exact: true }).first();
  if (await modelTab.count()) {
    await modelTab.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function clickGenerate(page) {
  const candidates = [
    page.getByRole("button", { name: /Gerar modelo/i }).last(),
    page.locator("button").filter({ hasText: /Gerar modelo/i }).last(),
    page.locator("text=/Gerar modelo/i").last(),
  ];

  for (const candidate of candidates) {
    try {
      await candidate.waitFor({ state: "visible", timeout: 5000 });
      await candidate.click({ force: true });
      return;
    } catch {}
  }

  const debugDir = path.join(rootDir, "output", "tripo-upload-debug");
  fs.mkdirSync(debugDir, { recursive: true });
  await page.screenshot({ path: path.join(debugDir, "after-upload.png"), fullPage: true });
  fs.writeFileSync(
    path.join(debugDir, "after-upload-text.txt"),
    await page.locator("body").innerText().catch(() => "")
  );

  throw new Error(`Nao encontrei o botao Gerar modelo. Debug salvo em ${debugDir}`);
}

async function waitForUploadReady(page) {
  await page.waitForTimeout(1000);

  for (let attempt = 0; attempt < 30; attempt++) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const isUploading = /Enviando|Uploading|Carregando|Loading/i.test(bodyText);
    const hasGenerate = /Gerar modelo/i.test(bodyText);

    if (!isUploading && hasGenerate) {
      await page.waitForTimeout(1500);
      return;
    }

    await page.waitForTimeout(1000);
  }

  console.warn("Aviso: nao consegui confirmar o fim do upload antes de continuar.");
}

(async () => {
  if (!fs.existsSync(storagePath)) {
    console.error("Sessao do Tripo nao encontrada. Rode primeiro: npm.cmd run tripo:login");
    process.exit(1);
  }

  const runDir = newestDirectory(refazerTempDir);

  if (!runDir) {
    console.error("Nenhuma execucao do /refazer encontrada.");
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

  console.log(`Abrindo Tripo: ${startUrl}`);
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  await clickModelMode(page);

  const fileInput = page.locator("input[type='file']").first();
  await fileInput.waitFor({ state: "attached", timeout: 15000 });

  const uploadImages = images.slice(0, 1);
  await fileInput.setInputFiles(uploadImages);

  console.log("Imagem enviada para o Tripo:");
  for (const image of uploadImages) {
    console.log(`- ${image}`);
  }

  await waitForUploadReady(page);

  if (shouldInspect) {
    const debugDir = path.join(rootDir, "output", "tripo-upload-debug");
    fs.mkdirSync(debugDir, { recursive: true });
    await page.screenshot({ path: path.join(debugDir, "after-upload.png"), fullPage: true });
    fs.writeFileSync(
      path.join(debugDir, "after-upload-text.txt"),
      await page.locator("body").innerText().catch(() => "")
    );
    console.log(`Inspecao pos-upload salva em ${debugDir}`);
    await browser.close();
    return;
  }

  if (!shouldGenerate) {
    const debugDir = path.join(rootDir, "output", "tripo-upload-debug");
    fs.mkdirSync(debugDir, { recursive: true });
    await page.screenshot({ path: path.join(debugDir, "after-upload.png"), fullPage: true });
    console.log("\nUpload feito. Print salvo para conferencia:");
    console.log(path.join(debugDir, "after-upload.png"));
    console.log("Para gastar credito e clicar em Gerar modelo automaticamente, rode:");
    console.log("npm.cmd run tripo:upload-last -- --generate");
    await browser.close();
    return;
  }

  console.log("Clicando em Gerar modelo. Isto pode gastar creditos do Tripo.");
  await clickGenerate(page);
  console.log("Geracao iniciada. Acompanhe na janela do Tripo ate aparecer o resultado/exportacao.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
