#!/usr/bin/env npx tsx
/**
 * Screenshot a workflow graph using headless Chrome + Puppeteer.
 * Uses the standalone graph-entry.tsx React app with real ReactFlow nodes.
 *
 * Usage:
 *   npx tsx scripts/screenshot-workflow.ts <workflow.json> [output.png] [options]
 *
 * Options:
 *   --width   Viewport width  (default: 1920)
 *   --height  Viewport height (default: 1080)
 *   --bg      Background color (default: #0F172A)
 *   --port    Dev server port  (default: 3199)
 */

import puppeteer from "puppeteer";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn, ChildProcess } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

function getFlag(name: string, defaultVal: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) {
    const val = args[idx + 1];
    args.splice(idx, 2);
    return val;
  }
  return defaultVal;
}

const width = Number(getFlag("width", "1920"));
const height = Number(getFlag("height", "1080"));
const bgColor = getFlag("bg", "#0F172A");
const port = Number(getFlag("port", "3199"));

const positional = args.filter((a) => !a.startsWith("--"));
const workflowJsonPath = positional[0] || "";
const outputPath = positional[1] || "/tmp/workflow-graph.png";

if (!workflowJsonPath) {
  console.error(
    "Usage: npx tsx scripts/screenshot-workflow.ts <workflow.json> [output.png]"
  );
  process.exit(1);
}

async function waitForServer(url: string, maxWait = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return; // 404 is fine, server is up
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${maxWait}ms`);
}

async function main() {
  const baseUrl = `http://localhost:${port}`;
  const jsonContent = readFileSync(resolve(workflowJsonPath), "utf-8");
  const b64 = Buffer.from(jsonContent).toString("base64");
  const graphUrl = `${baseUrl}/graph.html?data=${encodeURIComponent(b64)}&bg=${encodeURIComponent(bgColor)}`;

  // Start vite dev server
  let viteProcess: ChildProcess | null = null;
  let serverAlreadyRunning = false;

  try {
    const res = await fetch(baseUrl);
    serverAlreadyRunning = true;
    console.log(`Using existing server at ${baseUrl}`);
  } catch {
    console.log(`Starting vite dev server on port ${port}...`);
    viteProcess = spawn(
      "npx",
      ["vite", "--host", "0.0.0.0", "--port", String(port), "--strictPort"],
      {
        cwd: resolve(__dirname, ".."),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BROWSER: "none" },
      }
    );

    viteProcess.stdout?.on("data", (d: Buffer) => {
      const line = d.toString();
      if (line.includes("ready in") || line.includes("Local:")) {
        console.log(`  ${line.trim()}`);
      }
    });
    viteProcess.stderr?.on("data", () => {}); // Suppress warnings
  }

  try {
    await waitForServer(baseUrl);

    console.log(`Launching browser (${width}x${height})...`);
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        `--window-size=${width},${height}`,
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height });

    // Capture errors
    page.on("pageerror", (err) => console.error(`[browser] ${err.message}\n${err.stack}`));

    console.log("Loading graph...");
    await page.goto(graphUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for ReactFlow to finish rendering
    try {
      await page.waitForSelector('[data-ready="true"]', { timeout: 20000 });
    } catch {
      // Save debug screenshot
      const debugPath = resolve(outputPath.replace(".png", "-debug.png"));
      await page.screenshot({ path: debugPath, type: "png" });
      console.error(`Graph didn't reach ready state. Debug: ${debugPath}`);
      const readyVal = await page.evaluate(() =>
        document.querySelector("[data-ready]")?.getAttribute("data-ready")
      );
      console.error(`data-ready=${readyVal}`);
      throw new Error("Graph failed to render");
    }

    // Brief pause for edge animations
    await new Promise((r) => setTimeout(r, 300));

    const outFile = resolve(outputPath);
    await page.screenshot({ path: outFile, type: "png" });
    console.log(`Screenshot saved: ${outFile}`);

    await browser.close();
  } finally {
    if (viteProcess) {
      viteProcess.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
