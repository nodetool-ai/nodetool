import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { chromium } from "@playwright/test";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { expect, it } from "vitest";
import { buildStandaloneGame } from "../src/build.js";

declare global {
  interface Window {
    requiredEffectRafRequests: number;
    requiredEffectReadyShown: boolean;
    requiredEffectErrors: string[];
  }
}

it("does not expose playback or schedule ticks when the required LUT fails its first exported presentation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "game-required-effect-"));
  const output = join(directory, "game");
  const canvas = createCanvas(4, 2);
  canvas.getContext("2d").fillRect(0, 0, 4, 2);
  const bytes = canvas.toBuffer("image/png");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const game = { ...createTopDownRoomGame("required-effect-browser"), schemaVersion: 2 as const };
  game.assets.grade = { assetId: "d".repeat(32), digest, mediaKind: "image", width: 4, height: 2,
    pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
  game.renderEffects = [{ kind: "lut", assetId: "grade", size: 2, intensity: 1, required: true,
    domainMin: [0, 0, 0], domainMax: [1, 1, 1] }];
  const server = createServer((request, response) => {
    const file = request.url === "/" ? "index.html" : request.url?.slice(1);
    if (!file || file.includes("..") || file === `assets/${digest}.png`) {
      response.writeHead(404); response.end(); return;
    }
    void readFile(join(output, file)).then((data) => {
      response.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".wasm") ? "application/wasm" :
        file.endsWith(".json") ? "application/json" : file.endsWith(".png") ? "image/png" : file.endsWith(".css") ? "text/css" : "text/html");
      response.end(data);
    }).catch(() => { response.writeHead(404); response.end(); });
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await buildStandaloneGame({ document: game, outputDir: output,
      resolveAsset: async (id) => id === game.assets.grade.assetId ? { bytes, mimeType: "image/png" } : null });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") { throw new Error("Required effect control server did not bind"); }
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20_000);
    const responses: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      responses.push({ url: response.url(), status: response.status() });
      if (response.status() >= 400) console.info("Required effect HTTP failure", response.status(), response.url());
    });
    page.on("console", (message) => { if (message.type() === "error") console.info("Required effect browser error", message.text()); });
    page.on("pageerror", (error) => console.info("Required effect page error", error.message));
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText}`));
    await page.addInitScript(() => {
      window.requiredEffectErrors = [];
      window.addEventListener("error", (event) => { if (event instanceof ErrorEvent) window.requiredEffectErrors.push(event.message); });
      window.requiredEffectRafRequests = 0;
      window.requiredEffectReadyShown = false;
      const requestFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => { window.requiredEffectRafRequests++; return requestFrame(callback); };
      document.addEventListener("DOMContentLoaded", () => {
        new MutationObserver(() => {
          const status = document.getElementById("status")?.textContent ?? "";
          if (status.includes("Ready")) window.requiredEffectReadyShown = true;
          if (status) console.info("Required effect host status", status);
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
      }, { once: true });
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    const capabilities = await page.evaluate(async () => ({ gpu: !!navigator.gpu,
      adapter: !!await navigator.gpu?.requestAdapter(), deviceConstructor: typeof GPUDevice, status: document.getElementById("status")?.textContent,
      errors: window.requiredEffectErrors, api: typeof window.nativeGamePlayer }));
    console.info("Required effect native capabilities", JSON.stringify(capabilities));
    expect(capabilities.gpu).toBe(true);
    expect(capabilities.adapter).toBe(true);
    expect(capabilities.errors).toEqual([]);
    await page.waitForFunction(() => {
      const text = document.getElementById("status")?.textContent ?? "";
      return (text !== "" && !text.startsWith("Ready")) || window.requiredEffectErrors.length > 0;
    }, undefined, { polling: 25 });
    const observed = await page.evaluate(() => ({ status: document.getElementById("status")?.textContent,
      errors: window.requiredEffectErrors, api: typeof window.nativeGamePlayer, raf: window.requiredEffectRafRequests }));
    console.info("Required effect native result", JSON.stringify({ ...observed, consoleErrors, failedRequests, responses }));
    expect(observed.errors).toEqual([]);
    expect(observed.status).toContain("LUT grade is missing");
    expect(responses.some((response) => response.url.endsWith(`/assets/${digest}.png`) && response.status === 404)).toBe(true);
    expect(await page.evaluate(() => window.requiredEffectReadyShown)).toBe(false);
    expect(await page.evaluate(() => window.requiredEffectRafRequests)).toBe(0);
    expect(await page.evaluate(() => window.nativeGamePlayer === undefined)).toBe(true);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
