import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { chromium, type Browser, type LaunchOptions } from "playwright";
import { z } from "zod";
import type { GameInputFrame3D } from "@nodetool-ai/protocol";

export interface GameSmokeOptions {
  readonly frames?: number;
  readonly timeoutMs?: number;
  readonly executablePath?: string;
  readonly signal?: AbortSignal;
}
export interface GameSmokeReport {
  readonly ok: boolean;
  readonly frames: number;
  readonly ticks: number;
  readonly errors: readonly string[];
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".glb": "model/gltf-binary", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".ttf": "font/ttf", ".otf": "font/otf"
};
const smokeDocument = z.object({ schemaVersion: z.number(), inputActions: z.array(z.string()) });

/** Serve the exported player without outside network access and exercise its renderer and simulation. */
export async function smokeStandaloneGame(directory: string, options: GameSmokeOptions = {}): Promise<GameSmokeReport> {
  const frames = options.frames ?? 300;
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(frames) || frames < 1 || frames > 10_000) { throw new Error("Smoke frames must be between 1 and 10000"); }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) { throw new Error("Smoke timeout must be between 1 and 120000 milliseconds"); }
  options.signal?.throwIfAborted();
  const root = await realpath(directory);
  const document = smokeDocument.parse(JSON.parse(await readFile(join(root, "game.json"), "utf8")));
  const errors = new Set<string>();
  let ticks = 0;
  let rendered = 0;
  let browser: Browser | undefined;
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      if (pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
      const path = await realpath(join(root, pathname === "/" ? "index.html" : pathname.slice(1)));
      if (!path.startsWith(`${root}${sep}`)) { response.writeHead(403); response.end(); return; }
      const bytes = await readFile(path);
      response.setHeader("content-type", TYPES[extname(path)] ?? "application/octet-stream");
      response.end(bytes);
    })().catch(() => { response.writeHead(404); response.end(); });
  });
  const controller = new AbortController();
  const abort = (): void => controller.abort(options.signal?.reason);
  const closeBrowser = (): void => { void browser?.close(); };
  options.signal?.addEventListener("abort", abort, { once: true });
  controller.signal.addEventListener("abort", closeBrowser, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error(`Smoke timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") { throw new Error("Smoke static server did not bind"); }
    const origin = `http://127.0.0.1:${address.port}`;
    const launchOptions: LaunchOptions = { headless: true, chromiumSandbox: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };
    if (options.executablePath) { launchOptions.executablePath = options.executablePath; }
    browser = await chromium.launch(launchOptions);
    controller.signal.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) { return route.continue(); }
      errors.add(`Outside network request: ${route.request().url()}`);
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.on("pageerror", error => errors.add(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.add(message.text()); } });
    page.on("requestfailed", request => errors.add(`Request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
    page.on("response", response => { if (!response.ok()) { errors.add(`HTTP ${response.status()}: ${response.url()}`); } });
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(window.nativeGame3DPlayer || window.nativeGamePlayer));
    await page.evaluate(async () => {
      const player = window.nativeGame3DPlayer || window.nativeGamePlayer;
      player.pause();
      await player.reset();
    });
    for (let frame = 0; frame < frames; frame += 1) {
      controller.signal.throwIfAborted();
      const input: GameInputFrame3D = document.schemaVersion === 3
        ? { pressed: frame % 60 === 0 ? ["jump"] : [], justPressed: frame % 60 === 0 ? ["jump"] : [],
          axes: { moveX: Math.floor(frame / 75) % 2 ? -0.5 : 0.5, moveZ: -0.5 }, look: { x: 0, y: 0 } }
        : { pressed: document.inputActions.filter(action => [Math.floor(frame / 75) % 2 ? "left" : "right", Math.floor(frame / 75) % 2 ? "a" : "d"].includes(action)), justPressed: [], axes: {}, look: { x: 0, y: 0 } };
      const tick = await page.evaluate(async ({ input, dimension }) => {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (dimension === 3) {
          await window.nativeGame3DPlayer.step(input);
          return window.nativeGame3DPlayer.snapshot().tick;
        }
        await window.nativeGamePlayer.step(input);
        return window.nativeGamePlayer.snapshot().tick;
      }, { input, dimension: document.schemaVersion });
      rendered += 1;
      if (tick !== ticks + 1) { errors.add(`Player tick stalled or jumped at frame ${rendered}: expected ${ticks + 1}, received ${tick}`); break; }
      ticks = tick;
      const status = await page.locator("#status").textContent();
      if (status && /failed|error|missing|unavailable|could not|lost/i.test(status)) { errors.add(`Player status: ${status}`); }
      if (errors.size) { break; }
    }
  } catch (error) {
    options.signal?.throwIfAborted();
    const failure = controller.signal.aborted ? controller.signal.reason : error;
    errors.add(failure instanceof Error ? failure.message : String(failure));
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", closeBrowser);
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  return { ok: errors.size === 0 && rendered === frames && ticks === frames, frames: rendered, ticks, errors: [...errors] };
}
