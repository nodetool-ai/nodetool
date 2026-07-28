#!/usr/bin/env npx tsx
/**
 * Capture screenshots from the mockup HTML files in `mobile-mockups/`.
 *
 * Usage:
 *   npx tsx scripts/screenshot-mobile-mockups.ts
 *
 * Outputs to docs/assets/screenshots/.
 */

import { chromium } from "@playwright/test";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MOCKUPS_DIR = resolve(__dirname, "mobile-mockups");
const OUTPUT_DIR = resolve(__dirname, "..", "..", "docs", "assets", "screenshots");

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const SCREENS = [
  { html: "graph-editor-empty.html", output: "mobile-graph-editor-empty.png", ...PHONE },
  { html: "graph-editor-chain.html", output: "mobile-graph-editor-chain.png", ...PHONE },
  { html: "graph-editor-picker.html", output: "mobile-graph-editor-picker.png", ...PHONE },
  { html: "graph-editor-overview.html", output: "mobile-graph-editor-overview.png", ...PHONE },
  // Mini apps on mobile
  { html: "mini-apps-list.html", output: "mobile-mini-apps-list.png", ...PHONE },
  { html: "mini-app-run.html", output: "mobile-mini-app-running.png", ...PHONE },
  { html: "mini-app-result.html", output: "mobile-mini-app-result.png", ...PHONE },
  { html: "mini-app-chat.html", output: "mobile-mini-app-chat.png", ...PHONE },
  // Web chain editor screenshots (desktop)
  { html: "web-chain-editor-empty.html", output: "web-chain-editor-empty.png", ...DESKTOP },
  { html: "web-chain-editor-chain.html", output: "web-chain-editor-chain.png", ...DESKTOP },
  { html: "web-chain-editor-picker.html", output: "web-chain-editor-picker.png", ...DESKTOP },
];

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch();

  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: 2, // Retina-quality
    });
    const page = await context.newPage();

    const filePath = resolve(MOCKUPS_DIR, screen.html);
    console.log(`Loading ${screen.html}...`);
    await page.goto(`file://${filePath}`, { waitUntil: "networkidle" });

    const outPath = resolve(OUTPUT_DIR, screen.output);
    await page.screenshot({
      path: outPath,
      type: "png",
      clip: { x: 0, y: 0, width: screen.width, height: screen.height },
    });
    console.log(`  Saved: ${outPath}`);
    await context.close();
  }

  await browser.close();
  console.log("Done! All screenshots captured.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
