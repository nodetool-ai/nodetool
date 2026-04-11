#!/usr/bin/env npx tsx
/**
 * Capture screenshots from mobile mockup HTML files using Puppeteer.
 *
 * Usage:
 *   npx tsx scripts/screenshot-mobile-mockups.ts
 *
 * Outputs to docs/assets/screenshots/mobile-graph-editor-*.png
 */

import puppeteer from "puppeteer";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MOCKUPS_DIR = resolve(__dirname, "mobile-mockups");
const OUTPUT_DIR = resolve(__dirname, "..", "..", "docs", "assets", "screenshots");

const SCREENS = [
  {
    html: "graph-editor-empty.html",
    output: "mobile-graph-editor-empty.png",
    width: 390,
    height: 844,
  },
  {
    html: "graph-editor-chain.html",
    output: "mobile-graph-editor-chain.png",
    width: 390,
    height: 844,
  },
  {
    html: "graph-editor-picker.html",
    output: "mobile-graph-editor-picker.png",
    width: 390,
    height: 844,
  },
  {
    html: "graph-editor-overview.html",
    output: "mobile-graph-editor-overview.png",
    width: 390,
    height: 844,
  },
  // Web chain editor screenshots (desktop)
  {
    html: "web-chain-editor-empty.html",
    output: "web-chain-editor-empty.png",
    width: 1280,
    height: 800,
  },
  {
    html: "web-chain-editor-chain.html",
    output: "web-chain-editor-chain.png",
    width: 1280,
    height: 800,
  },
  {
    html: "web-chain-editor-picker.html",
    output: "web-chain-editor-picker.png",
    width: 1280,
    height: 800,
  },
];

async function main() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  for (const screen of SCREENS) {
    const page = await browser.newPage();
    await page.setViewport({
      width: screen.width,
      height: screen.height,
      deviceScaleFactor: 2, // Retina-quality
    });

    const filePath = resolve(MOCKUPS_DIR, screen.html);
    console.log(`Loading ${screen.html}...`);
    await page.goto(`file://${filePath}`, { waitUntil: "networkidle0" });

    // Brief pause for rendering
    await new Promise((r) => setTimeout(r, 200));

    const outPath = resolve(OUTPUT_DIR, screen.output);
    await page.screenshot({
      path: outPath,
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: screen.width,
        height: screen.height,
      },
    });
    console.log(`  Saved: ${outPath}`);
    await page.close();
  }

  await browser.close();
  console.log("Done! All screenshots captured.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
