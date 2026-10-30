import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import { exportNativeCppGame } from "@nodetool-ai/game-runtime/native";
import { gameFontFamily } from "../src/fonts.js";
import { nativePlayerStartupExportFixture } from "./fixtures/nativePlayerStartup.js";

it.runIf(process.env.NODETOOL_NATIVE_BROWSER_PROFILE === "1")("starts the installed environment-bearing 3D export with its closed HUD font prepared before the first completed frame", async () => {
  const root = await mkdtemp(join(tmpdir(), "native-player-startup-"));
  const source = join(root, "source"), output = join(root, "export");
  await mkdir(source);
  const fixture = await nativePlayerStartupExportFixture();
  for (const [path, bytes] of fixture.files) { await writeFile(join(source, path), bytes); }
  const profile = process.env.NODETOOL_NATIVE_STARTUP_PROFILE_DIR;
  if (profile) {
    const documentPath = join(source, "game.json");
    await writeFile(documentPath, JSON.stringify(fixture.document));
    const runtime = Object.fromEntries(["native-game.mjs", "native-game.wasm", "native-game-worker.js", "native-game-player.js", "native-game-browser.json", "native-game-notices.txt"].map(name => [name, join(profile, name)]));
    const result = await promisify(execFile)(process.execPath, [
      fileURLToPath(import.meta.resolve("@nodetool-ai/game-runtime/native-game-web-export.mjs")),
      JSON.stringify({ document: documentPath, assetsRoot: source, output, runtime })
    ], { timeout: 30000 });
    await writeFile(join(root, "exporter.stdout"), result.stdout);
    await writeFile(join(root, "exporter.stderr"), result.stderr);
  } else {
    await exportNativeCppGame(fixture.document, { target: "web", assetsDir: source, out: output });
  }
  const inventory: { files: { path: string; digest: string }[] } = JSON.parse(await readFile(join(output, "bundle.json"), "utf8"));
  const files = new Map<string, Uint8Array>();
  for (const entry of inventory.files) { files.set(`/${entry.path}`, await readFile(join(output, entry.path))); }
  const requests: string[] = [], errors: string[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    requests.push(path);
    const key = path === "/" ? "/index.html" : path, bytes = files.get(key);
    if (!bytes) { response.writeHead(404); response.end(); return; }
    const type = key.endsWith(".wasm") ? "application/wasm" : /\.(mjs|js)$/.test(key) ? "text/javascript" : key.endsWith(".html") ? "text/html" : key.endsWith(".css") ? "text/css" : "application/octet-stream";
    response.writeHead(200, { "content-type": type }); response.end(bytes);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") { server.close(); throw new Error("Startup fixture did not bind"); }
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
    const origin = `http://127.0.0.1:${address.port}`;
    await page.route("**/*", route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => document.addEventListener("native-game-frame-complete", () => {
      Reflect.set(window, "nativeStartupFonts", Array.from(document.fonts, face => ({ family: face.family, status: face.status })));
    }, { once: true, capture: true }));
    await page.goto(`${origin}/?benchmark=1`);
    await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.nativeCompletedFrames) >= 1, undefined, { timeout: 15000 }).catch(async (cause: unknown) => {
      const failure = { errors, status: await page.locator("#status").textContent(), root, profile: profile ?? "installed",
        dataset: await page.evaluate(() => ({ ...document.querySelector("canvas")?.dataset })) };
      await writeFile(join(root, "failure.json"), JSON.stringify(failure, null, 2));
      await page.locator("canvas").screenshot({ path: join(root, "failure.png"), timeout: 5000 });
      throw new Error(JSON.stringify(failure), { cause });
    });
    const fonts = await page.evaluate(() => Reflect.get(window, "nativeStartupFonts"));
    expect(fonts).toContainEqual({ family: gameFontFamily(fixture.document.id, "font-display"), status: "loaded" });
    expect(await page.locator("#status").textContent()).toBe("");
    expect(errors).toEqual([]);
    expect(requests.filter(path => path === "/assets/font-display.ttf")).toHaveLength(1);
    expect(requests.filter(path => path !== "/" && path !== "/favicon.ico" && !files.has(path))).toEqual([]);
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) { throw new Error("Startup canvas is missing"); }
      const copy = document.createElement("canvas"); copy.width = canvas.width; copy.height = canvas.height;
      const context = copy.getContext("2d");
      if (!context) { throw new Error("Startup readback context is missing"); }
      context.drawImage(canvas, 0, 0);
      const image = context.getImageData(0, 0, copy.width, copy.height);
      let hudPixels = 0;
      for (let y = 12; y < 48; y++) { for (let x = 12; x < 250; x++) {
        const offset = (y * image.width + x) * 4;
        if (Math.min(image.data[offset], image.data[offset + 1], image.data[offset + 2]) > 200) { hudPixels++; }
      } }
      const center = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4;
      return { hudPixels, center: Array.from(image.data.slice(center, center + 4)) };
    });
    expect(pixels.hudPixels).toBeGreaterThan(30);
    expect(pixels.center[0]).toBeGreaterThan(pixels.center[2] + 30);
    await page.locator("canvas").screenshot({ path: join(root, "startup.png") });
    await writeFile(join(root, "report.json"), JSON.stringify({ fonts, pixels, requests, errors, inventory, profile: profile ?? "installed" }, null, 2));
  } finally { await browser?.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}, 60000);
