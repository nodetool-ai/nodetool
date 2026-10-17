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

  it("does not publish an image load superseded by invalidation", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite, pixel } = window.gpuParity;
      const red = await image(1, 1, [255, 0, 0, 255]);
      const blue = await image(1, 1, [0, 0, 255, 255]);
      let finishOld!: (value: ImageBitmap) => void;
      let started!: () => void;
      const loading = new Promise<void>((resolve) => { started = resolve; });
      let current = red;
      let first = true;
      const gpu = await createGpu(async () => {
        if (!first) { return current; }
        first = false;
        started();
        return new Promise<ImageBitmap>((resolve) => { finishOld = resolve; });
      });
      try {
        const sample = frame([sprite("hero")]);
        const beforeLoad = gpu.allocations.length;
        const pending = gpu.renderer.render(sample, 1);
        await loading;
        current = blue;
        gpu.renderer.invalidateAsset("hero");
        finishOld(red);
        await pending;
        const transient = gpu.allocations.slice(beforeLoad).map((entry) => ({ ...entry }));
        const settled = await gpu.renderer.render(sample, 1);
        const firstPixel = pixel(await gpu.read(), 32, 32);
        const repeated = await gpu.renderer.render(sample, 1);
        await gpu.settleValidation();
        return { transient, errors: [...gpu.validationErrors], firstPixel, repeatedPixel: pixel(await gpu.read(), 32, 32),
          settledBytes: settled.textureBytes, repeatedBytes: repeated.textureBytes };
      } finally { gpu.dispose(); red.close(); blue.close(); }
    });
    expect(result.transient).toHaveLength(1);
    expect(result.transient[0]).toMatchObject({ bytes: 4, destroyAttempts: 1, destroyCalls: 1,
      createdSubmitCount: 0, destroyedSubmitCount: 1 });
    expect(result.errors).toEqual([]);
    expect(result.firstPixel).toEqual([0, 0, 255, 255]);
    expect(result.repeatedPixel).toEqual(result.firstPixel);
    expect(result.repeatedBytes).toBe(result.settledBytes);
  });

  it("shares a pending image upload across identical concurrent frames", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite, pixel } = window.gpuParity;
      const red = await image(1, 1, [255, 0, 0, 255]);
      let release!: (value: ImageBitmap) => void;
      let started!: () => void;
      const loading = new Promise<void>((resolve) => { started = resolve; });
      let resolverCalls = 0;
      const gpu = await createGpu(async () => {
        resolverCalls++;
        started();
        return new Promise<ImageBitmap>((resolve) => { release = resolve; });
      });
      try {
        const sample = frame([sprite("hero")]);
        const before = gpu.allocations.length;
        const first = gpu.renderer.render(sample, 1);
        const second = gpu.renderer.render(sample, 1);
        await loading;
        release(red);
        const stats = await Promise.all([first, second]);
        await gpu.settleValidation();
        const uploaded = gpu.allocations.slice(before);
        const center = pixel(await gpu.read(), 32, 32);
        gpu.dispose();
        return { resolverCalls, uploadedBytes: stats.reduce((sum, entry) => sum + entry.uploadedBytes, 0),
          uploaded: uploaded.map((entry) => ({ ...entry })), center, errors: [...gpu.validationErrors] };
      } finally { gpu.dispose(); red.close(); }
    });
    expect(result.resolverCalls).toBe(1);
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0]).toMatchObject({ bytes: 4, destroyAttempts: 1, destroyCalls: 1 });
    expect(result.uploadedBytes).toBe(4);
    expect(result.center).toEqual([255, 0, 0, 255]);
    expect(result.errors).toEqual([]);
  });

  it("keeps a cached texture alive until the frame awaiting HUD assets submits", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite, pixel } = window.gpuParity;
      const red = await image(1, 1, [255, 0, 0, 255]);
      const blue = await image(1, 1, [0, 0, 255, 255]);
      const white = await image(1, 1, [255, 255, 255, 255]);
      let current = red;
      let release!: (value: ImageBitmap) => void;
      let started!: () => void;
      const loading = new Promise<void>((resolve) => { started = resolve; });
      const gpu = await createGpu(async (id) => {
        if (id === "hero") { return current; }
        started();
        return new Promise<ImageBitmap>((resolve) => { release = resolve; });
      });
      try {
        const world = frame([sprite("hero")]);
        const beforeWorld = gpu.allocations.length;
        await gpu.renderer.render(world, 1);
        const created = gpu.allocations.slice(beforeWorld).filter((entry) => entry.width === 1 && entry.height === 1 && entry.bytes === 4);
        if (created.length !== 1) { throw new Error(`Expected one hero texture, received ${created.length}`); }
        const cached = created[0]!;
        const submittedBefore = gpu.submitCount();
        const withHud = { ...world, ui: { safeArea: false, focusNavigation: false,
          nodes: [{ kind: "image" as const, id: "hud", assetId: "hud", width: 8, height: 8, offset: { x: 0, y: 0 } }] } };
        const pending = gpu.renderer.render(withHud, 1);
        await loading;
        current = blue;
        gpu.renderer.invalidateAsset("hero");
        release(white);
        await pending;
        const inFlight = pixel(await gpu.read(), 32, 32);
        const settled = await gpu.renderer.render(withHud, 1);
        const next = pixel(await gpu.read(), 32, 32);
        const repeated = await gpu.renderer.render(withHud, 1);
        const liveCount = gpu.allocations.filter((entry) => entry.destroyCalls === 0).length;
        for (let index = 0; index < 8; index++) {
          current = index % 2 === 0 ? red : blue;
          gpu.renderer.invalidateAsset("hero");
          await gpu.renderer.render(withHud, 1);
        }
        await gpu.settleValidation();
        const finalLiveCount = gpu.allocations.filter((entry) => entry.destroyCalls === 0).length;
        gpu.dispose();
        return { cached: { ...cached }, submittedBefore, liveCount, finalLiveCount,
          disposedExactlyOnce: gpu.allocations.every((entry) => entry.destroyCalls === 1),
          duplicateDestroy: gpu.allocations.some((entry) => entry.destroyCalls > 1), inFlight, next, errors: [...gpu.validationErrors],
          settledBytes: settled.textureBytes, repeatedBytes: repeated.textureBytes };
      } finally { gpu.dispose(); red.close(); blue.close(); white.close(); }
    });
    expect(result.cached.destroyCalls).toBe(1);
    expect(result.cached.destroyedSubmitCount).toBe(result.submittedBefore + 1);
    expect(result.finalLiveCount).toBe(result.liveCount);
    expect(result.disposedExactlyOnce).toBe(true);
    expect(result.duplicateDestroy).toBe(false);
    // In-flight frames retain their captured image. The subsequent stable frame uses the replacement.
    expect(result.inFlight).toEqual([255, 0, 0, 255]);
    expect(result.next).toEqual([0, 0, 255, 255]);
    expect(result.errors).toEqual([]);
    expect(result.repeatedBytes).toBe(result.settledBytes);
  });

  it("rejects a pending load after disposal without uploading to the destroyed device", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite } = window.gpuParity;
      const bitmap = await image(1, 1, [255, 0, 0, 255]);
      let release!: (value: ImageBitmap) => void;
      let started!: () => void;
      const loading = new Promise<void>((resolve) => { started = resolve; });
      const gpu = await createGpu(async () => {
        started();
        return new Promise<ImageBitmap>((resolve) => { release = resolve; });
      });
      try {
        const pending = gpu.renderer.render(frame([sprite("hero")]), 1).then(
          () => "resolved", (error: unknown) => error instanceof Error ? error.message : String(error));
        await loading;
        gpu.dispose();
        const allocationsAtDispose = gpu.allocations.length;
        release(bitmap);
        const error = await pending;
        await gpu.settleValidation();
        return { error, allocationsAtDispose, finalAllocations: gpu.allocations.length,
          errors: [...gpu.validationErrors], sourceWidth: bitmap.width };
      } finally { gpu.dispose(); bitmap.close(); }
    });
    expect(result.finalAllocations).toBe(result.allocationsAtDispose);
    expect(result.error).toMatch(/disposed/i);
    expect(result.errors).toEqual([]);
    expect(result.sourceWidth).toBe(1);
  });

  it("does not reuse LUT validation from an image superseded during loading", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite, pixel } = window.gpuParity;
      const white = await image(1, 1, [255, 255, 255, 255]);
      const valid = await image(4, 2, Array.from({ length: 8 }, () => [255, 255, 255, 255]).flat());
      const invalid = await image(4, 2, Array.from({ length: 8 }, () => [255, 255, 255, 128]).flat());
      let release!: (value: ImageBitmap) => void;
      let started!: () => void;
      const loading = new Promise<void>((resolve) => { started = resolve; });
      let first = true;
      const gpu = await createGpu(async (id) => {
        if (id === "white") { return white; }
        if (!first) { return invalid; }
        first = false;
        started();
        return new Promise<ImageBitmap>((resolve) => { release = resolve; });
      });
      try {
        gpu.renderer.setEffects([{ kind: "lut", assetId: "lut", size: 2, intensity: 1,
          domainMin: [0, 0, 0], domainMax: [1, 1, 1], required: true }]);
        const sample = frame([sprite("white")]);
        const pending = gpu.renderer.render(sample, 1);
        await loading;
        gpu.renderer.invalidateAsset("lut");
        release(valid);
        await pending;
        const captured = pixel(await gpu.read(), 32, 32);
        const replacement = await gpu.renderer.render(sample, 1).then(
          () => "resolved", (error: unknown) => error instanceof Error ? error.message : String(error));
        await gpu.settleValidation();
        return { captured, replacement, errors: [...gpu.validationErrors] };
      } finally { gpu.dispose(); white.close(); valid.close(); invalid.close(); }
    });
    expect(result.captured).toEqual([255, 255, 255, 255]);
    expect(result.replacement).toMatch(/must be opaque/i);
    expect(result.errors).toEqual([]);
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

  it("retries a failed native image copy and destroys its partial texture exactly once", async () => {
    const result = await page.evaluate(async () => {
      const { createGpu, image, frame, sprite, pixel } = window.gpuParity;
      const bitmap = await image(1, 1, [255, 0, 0, 255]);
      const gpu = await createGpu(async () => bitmap);
      try {
        const before = gpu.allocations.length;
        const sample = frame([sprite("hero")]);
        gpu.failNextImageCopy();
        const first = await gpu.renderer.render(sample, 1).then(
          () => "resolved", (error: unknown) => error instanceof Error ? error.message : String(error));
        const partial = gpu.allocations.slice(before).map((entry) => ({ ...entry }));
        const second = await gpu.renderer.render(sample, 1).then(
          () => "resolved", (error: unknown) => error instanceof Error ? error.message : String(error));
        const captured = second === "resolved" ? pixel(await gpu.read(), 32, 32) : [];
        await gpu.settleValidation();
        return { first, second, partial, captured, created: gpu.allocations.length - before,
          errors: [...gpu.validationErrors] };
      } finally { gpu.dispose(); bitmap.close(); }
    });
    expect(result.first).toMatch(/injected external image copy failure/i);
    expect(result.partial).toHaveLength(1);
    expect(result.partial[0]).toMatchObject({ destroyAttempts: 1, destroyCalls: 1,
      createdSubmitCount: 0, destroyedSubmitCount: 0 });
    expect(result.second).toBe("resolved");
    expect(result.created).toBe(2);
    expect(result.captured).toEqual([255, 0, 0, 255]);
    expect(result.errors).toEqual([]);
  });
});
