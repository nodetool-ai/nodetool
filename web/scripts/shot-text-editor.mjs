import { chromium } from "playwright";

const URL = "http://localhost:3000/preview/text-editor";
const OUT = process.argv[2] || "/tmp/text-editor.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1680, height: 1200 },
  deviceScaleFactor: 2,
  colorScheme: "dark"
});

// Make sure the app boots straight into the preview (skip onboarding redirects)
// and open the editor at a tall height so every panel is visible.
await page.addInitScript(() => {
  try {
    localStorage.setItem(
      "onboarding",
      JSON.stringify({ state: { dismissed: true, completed: {} }, version: 2 })
    );
    localStorage.setItem("textEditorModal_height", "1020");
  } catch {
    /* ignore */
  }
});

page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE ERROR:", m.text());
});

await page.goto(URL, { waitUntil: "domcontentloaded" });

await page.waitForSelector(".modal-content", { timeout: 30000 });

// Wait for Monaco to mount (line numbers) and variable highlighting to paint.
await page
  .waitForSelector(".monaco-editor .view-lines", { timeout: 30000 })
  .catch(() => console.log("monaco view-lines not found (continuing)"));
await page
  .waitForSelector(".editor-variable-token", { timeout: 15000 })
  .catch(() => console.log("variable token not found (continuing)"));
await page
  .waitForSelector(".editor-variables-panel .variable-chip", { timeout: 10000 })
  .catch(() => console.log("variable chips not found (continuing)"));

// Let fonts / layout settle.
await page.waitForTimeout(1500);

const modal = page.locator(".modal-content").first();
await modal.screenshot({ path: OUT });
console.log("saved", OUT);

await browser.close();
