const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const rootDir = path.resolve(__dirname, "..");
const refazerTempDir = path.join(rootDir, "temp", "refazer");

function newestMockDirectory(parentDir) {
  if (!fs.existsSync(parentDir)) return null;

  return fs.readdirSync(parentDir)
    .map(name => path.join(parentDir, name))
    .filter(file => fs.statSync(file).isDirectory())
    .filter(file => fs.existsSync(path.join(file, "nano_banana_pro", "mock_result.json")))
    .filter(file => fs.existsSync(path.join(file, "tripo_ai", "mock_result.json")))
    .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file || null;
}

function fileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

test("ultimo /refazer mock tem fotos e modelo para revisar", async ({ page }) => {
  const runDir = newestMockDirectory(refazerTempDir);

  test.skip(!runDir, "Rode /refazer com mock_ia:true no Discord antes deste teste.");

  const rendersDir = path.join(runDir, "renders");
  const nanoDir = path.join(runDir, "nano_banana_pro");
  const tripoDir = path.join(runDir, "tripo_ai");

  const renderImages = ["frente.png", "direita.png", "costas.png", "esquerda.png", "isometrica.png"]
    .map(name => path.join(rendersDir, name));

  for (const imagePath of renderImages) {
    expect(fs.existsSync(imagePath), `${path.basename(imagePath)} precisa existir`).toBe(true);
  }

  expect(fs.existsSync(path.join(nanoDir, "mock_result.json"))).toBe(true);
  expect(fs.existsSync(path.join(tripoDir, "mock_result.json"))).toBe(true);

  const mockModel = fs.readdirSync(tripoDir).find(name => name.startsWith("refeito_mock."));
  expect(mockModel, "modelo mock precisa existir").toBeTruthy();

  const htmlPath = path.join(runDir, "playwright_report.html");
  const imageTags = renderImages
    .map(imagePath => `<figure><img src="${fileUrl(imagePath)}"><figcaption>${path.basename(imagePath)}</figcaption></figure>`)
    .join("\n");

  fs.writeFileSync(htmlPath, `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatorio /refazer mock</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #f6f7f9; color: #20242a; }
    main { max-width: 980px; margin: 0 auto; }
    h1 { font-size: 24px; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
    figure { margin: 0; background: white; border: 1px solid #d9dde3; border-radius: 8px; padding: 8px; }
    img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; background: #eef0f3; }
    figcaption { font-size: 12px; margin-top: 6px; text-align: center; }
    code { background: #e8ebef; padding: 2px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Teste /refazer mock</h1>
    <p>Modelo mock: <code>${mockModel}</code></p>
    <section class="grid">${imageTags}</section>
  </main>
</body>
</html>`);

  await page.goto(fileUrl(htmlPath));
  await expect(page.getByRole("heading", { name: "Teste /refazer mock" })).toBeVisible();
  await expect(page.locator("img")).toHaveCount(5);
});
