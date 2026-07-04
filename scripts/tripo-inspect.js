const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const storagePath = path.join(rootDir, ".auth", "tripo-storage.json");
const outDir = path.join(rootDir, "output", "tripo-inspect");
const startUrl = process.env.TRIPO_STUDIO_URL || "https://studio.tripo3d.ai/workspace/generate";
const browserChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL || "chrome";

async function collectUi(page) {
  return page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    const clean = text => (text || "").replace(/\s+/g, " ").trim();

    return [...document.querySelectorAll("button, a, input, textarea, [role='button'], [role='tab'], [role='menuitem']")]
      .filter(visible)
      .slice(0, 250)
      .map((element, index) => ({
        index,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        role: element.getAttribute("role"),
        text: clean(element.innerText || element.value || element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder")),
        id: element.id || null,
        name: element.getAttribute("name"),
        className: typeof element.className === "string" ? element.className.slice(0, 180) : null,
      }));
  });
}

(async () => {
  if (!fs.existsSync(storagePath)) {
    console.error("Sessao do Tripo nao encontrada. Rode primeiro: npm.cmd run tripo:login");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

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
await page.goto(startUrl, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

  const screenshotPath = path.join(outDir, "tripo-current.png");
  const uiPath = path.join(outDir, "tripo-ui.json");
  const textPath = path.join(outDir, "tripo-text.txt");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(uiPath, JSON.stringify(await collectUi(page), null, 2));
  fs.writeFileSync(textPath, await page.locator("body").innerText().catch(() => ""));

  console.log(`Screenshot salvo: ${screenshotPath}`);
console.log(`Mapa de botoes/inputs salvo: ${uiPath}`);
console.log(`Texto da pagina salvo: ${textPath}`);
console.log("Inspecao finalizada.");

await browser.close();
})();
