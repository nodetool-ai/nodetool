import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

declare global {
  interface Window { gpuParity: typeof import("./fixtures/webgpuBrowserHarness.js") }
}

describe("actual Chromium WebGPU sprite composition", () => {
  let browser: Browser;
  let page: Page;
  let script: string;

  beforeAll(async () => {
    const bundle = await build({ stdin: {
      contents: 'import * as parity from "./tests/fixtures/webgpuBrowserHarness.ts"; window.gpuParity = parity;',
      resolveDir: resolve("."), sourcefile: "gpu-parity.ts"
    }, bundle: true, platform: "browser", format: "iife", write: false, conditions: ["nodetool-dev"] });
    const output = bundle.outputFiles?.[0];
    if (!output) { throw new Error("WebGPU parity browser bundle is missing"); }
    script = output.text;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    console.info(`GPU parity Chromium: ${browser.version()}`);
  });
  beforeEach(async () => {
    page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 64, height: 64 } });
    page.on("console", (message) => {
      if (message.text().startsWith("GPU parity adapter:")) { console.info(message.text()); }
    });
    await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }) : route.abort());
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: script });
  });
  afterEach(async () => { await page?.close(); });
  afterAll(async () => { await browser?.close(); });

  it("does not publish a stale HUD key after invalidation during image gathering", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, pixel } = window.gpuParity;
      const red = await image(1, 1, [255, 0, 0, 255]);
      const blue = await image(1, 1, [0, 0, 255, 255]);
      let release!: (value: ImageBitmap) => void;
      let started!: () => void;
      const loading = new Promise<void>((resolve) => { started = resolve; });
      let first = true;
      const gpu = await createGpu(async () => {
        if (!first) { return blue; }
        first = false;
        started();
        return new Promise<ImageBitmap>((resolve) => { release = resolve; });
      });
      try {
        const sample = frame([], { ui: { safeArea: false, focusNavigation: false,
          nodes: [{ kind: "image", id: "hud", assetId: "hud", width: 16, height: 16, offset: { x: 24, y: 24 } }] } });
        const pending = gpu.renderer.render(sample, 1);
        await loading;
        gpu.renderer.invalidateAsset("hud");
        release(red);
        await pending;
        const old = pixel(await gpu.read(), 32, 32);
        await gpu.renderer.render(sample, 1);
        const next = pixel(await gpu.read(), 32, 32);
        await gpu.settleValidation();
        return { old, next, errors: [...gpu.validationErrors] };
      } finally { gpu.dispose(); red.close(); blue.close(); }
    });
    expect(result.old).toEqual([255, 0, 0, 255]);
    expect(result.next).toEqual([0, 0, 255, 255]);
    expect(result.errors).toEqual([]);
  });

  it("repaints a same-ID image in both the world and cached HUD", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite, pixel } = window.gpuParity;
      const red = await image(1, 1, [255, 0, 0, 255]);
      const blue = await image(1, 1, [0, 0, 255, 255]);
      let current = red;
      const gpu = await createGpu(async () => current);
      try {
        const sample = frame([sprite("shared", { x: -16, previousX: -16 })], { ui: {
          safeArea: false, focusNavigation: false,
          nodes: [{ kind: "image", id: "image", assetId: "shared", width: 16, height: 16, offset: { x: 40, y: 24 } }]
        } });
        await gpu.renderer.render(sample, 1);
        const before = await gpu.read();
        current = blue;
        gpu.renderer.invalidateAsset("shared");
        await gpu.renderer.render(sample, 1);
        const after = await gpu.read();
        return { beforeWorld: pixel(before, 16, 32), beforeHud: pixel(before, 48, 32),
          afterWorld: pixel(after, 16, 32), afterHud: pixel(after, 48, 32) };
      } finally { gpu.dispose(); red.close(); blue.close(); }
    });
    expect(result.beforeWorld).toEqual([255, 0, 0, 255]);
    expect(result.beforeHud).toEqual(result.beforeWorld);
    expect(result.afterWorld).toEqual([0, 0, 255, 255]);
    expect(result.afterHud).toEqual(result.afterWorld);
  });

  it("includes game font identity when reusing the HUD texture", async () => {
    const font = Array.from(await readFile(new URL("../../cli/tests/fixtures/game-golden-fonts/DejaVuSans.ttf", import.meta.url)));
    console.info(`GPU parity font SHA-256: ${createHash("sha256").update(Uint8Array.from(font)).digest("hex")}`);
    const result = await page.evaluate(async (bytes) => {
      const { createGpu, frame, gameFontFamily } = window.gpuParity;
      const small = new FontFace(gameFontFamily("small", "shared"), Uint8Array.from(bytes).buffer,
        { weight: "600", sizeAdjust: "50%" });
      const large = new FontFace(gameFontFamily("large", "shared"), Uint8Array.from(bytes).buffer,
        { weight: "600", sizeAdjust: "100%" });
      await Promise.all([small.load(), large.load()]);
      document.fonts.add(small);
      document.fonts.add(large);
      const reused = await createGpu(async () => null);
      const fresh = await createGpu(async () => null);
      try {
        const sample = frame([], { gameId: "small", hud: [{ text: "MMMM", x: 4, y: 8, size: 16, fontId: "shared" }] });
        await reused.renderer.render(sample, 1);
        const first = await reused.read();
        const second = { ...sample, gameId: "large" };
        await reused.renderer.render(second, 1);
        await fresh.renderer.render(second, 1);
        return { first, reused: await reused.read(), fresh: await fresh.read(), adjustments: [small.sizeAdjust, large.sizeAdjust] };
      } finally { reused.dispose(); fresh.dispose(); document.fonts.delete(small); document.fonts.delete(large); }
    }, font);
    expect(result.adjustments).toEqual(["50%", "100%"]);
    expect(result.fresh).not.toEqual(result.first);
    expect(result.reused).toEqual(result.fresh);
  });

});
