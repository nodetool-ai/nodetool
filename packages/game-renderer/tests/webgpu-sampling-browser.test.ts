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

  it("respects each draw's sampler across order and cache warmup changes", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite, pixel } = window.gpuParity;
      const checker = await image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);
      const gpu = await createGpu(async () => checker);
      try {
        const beforeTextures = gpu.allocations.length;
        const nearest = sprite("checker", { entityId: "nearest", x: -16, previousX: -16, width: 24, sampling: "nearest" });
        const linear = sprite("checker", { entityId: "linear", x: 16, previousX: 16, width: 24, sampling: "linear" });
        await gpu.renderer.render(frame([nearest, linear]), 1);
        const initial = await gpu.read();
        await gpu.renderer.render(frame([linear, nearest]), 1);
        const reversed = await gpu.read();
        gpu.renderer.invalidateAsset("checker");
        await gpu.renderer.render(frame([nearest]), 1);
        await gpu.renderer.render(frame([nearest, linear]), 1);
        return { nearest: pixel(initial, 16, 32), linear: pixel(initial, 48, 32),
          textures: gpu.allocations.slice(beforeTextures).map((entry) => ({ ...entry })),
          initial, reversed, afterNearestWarmup: await gpu.read() };
      } finally { gpu.dispose(); checker.close(); }
    });
    expect(result.textures).toHaveLength(2);
    expect(result.textures.map((entry) => [entry.width, entry.height, entry.bytes, entry.destroyCalls])).toEqual([
      [2, 1, 8, 1], [2, 1, 8, 0]
    ]);
    expect(result.nearest).toEqual([255, 255, 255, 255]);
    expect(result.linear[0]).toBeGreaterThan(0);
    expect(result.linear[0]).toBeLessThan(255);
    expect(result.reversed).toEqual(result.initial);
    expect(result.afterNearestWarmup).toEqual(result.initial);
  });

  it("preserves the built-in soft dot alpha when using native pixel uploads", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, createCanvas, image, frame, sprite, PARTICLE_DOT_ASSET } = window.gpuParity;
      const black = await image(1, 1, [0, 0, 0, 255]);
      const gpu = await createGpu(async () => black);
      const canvas = createCanvas(async () => black);
      try {
        const sample = frame([sprite("black", { width: 64, height: 64 }),
          sprite(PARTICLE_DOT_ASSET, { layer: 1, width: 32, height: 32, sampling: "linear" })]);
        await gpu.renderer.render(sample, 1);
        await canvas.renderer.render(sample, 1);
        return { actual: await gpu.read(), reference: canvas.read() };
      } finally { gpu.dispose(); canvas.dispose(); black.close(); }
    });
    expect(result.reference.some((value, index) => index % 4 !== 3 && value > 0 && value < 255)).toBe(true);
    expect(Math.max(...result.actual.map((value, index) => Math.abs(value - result.reference[index]!)))).toBeLessThanOrEqual(2);
  });

  it("detects a deliberately suppressed native texture deletion", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite } = window.gpuParity;
      const bitmap = await image(1, 1, [255, 0, 0, 255]);
      const gpu = await createGpu(async () => bitmap);
      try {
        const sample = frame([sprite("hero")]);
        const beforeWorld = gpu.allocations.length;
        await gpu.renderer.render(sample, 1);
        const created = gpu.allocations.slice(beforeWorld).filter((entry) => entry.width === 1 && entry.height === 1 && entry.bytes === 4);
        if (created.length !== 1) { throw new Error(`Expected one hero texture, received ${created.length}`); }
        const cached = created[0]!;
        gpu.suppressDestroy(cached.id);
        gpu.renderer.invalidateAsset("hero");
        await gpu.renderer.render(sample, 1);
        return { attempts: cached.destroyAttempts, calls: cached.destroyCalls,
          retiredExactlyOnce: cached.destroyCalls === 1 };
      } finally { gpu.dispose(); bitmap.close(); }
    });
    expect(result.attempts).toBe(1);
    expect(result.calls).toBe(0);
    expect(result.retiredExactlyOnce).toBe(false);
  });

});
