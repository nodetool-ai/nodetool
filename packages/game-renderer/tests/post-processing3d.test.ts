import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { gamePostProcessing3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { CreateGameRenderer3DOptions, GameRenderer3D } from "../src/browser3d.js";
import { GAME_POST_MSAA_SAMPLES_3D, gamePostProcessingPassNames3D, resolveGamePostProcessing3D } from "../src/renderer3d/passes/post-processing.js";
import { GAME_POST_PROCESSING_BENCHMARK_VARIANTS_3D } from "../scripts/benchmark-game.js";
import { compareGameCaptures } from "../src/imageDiff.js";
import { blockoutFrame } from "./fixtures/game3d.js";

declare global { interface Window { postHarness: { factory: (options: CreateGameRenderer3DOptions) => Promise<GameRenderer3D> } } }

const settings = (value: unknown) => gamePostProcessing3D.parse(value);

describe("post-processing plan", () => {
  it("renders directly with the renderer defaults when settings are absent or disabled", () => {
    const defaults = { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1, composer: null };
    expect(resolveGamePostProcessing3D(undefined, 4)).toEqual(defaults);
    expect(resolveGamePostProcessing3D(settings({ enabled: false, exposure: 4, toneMapping: "agx", bloom: {}, vignette: {}, antialias: "smaa" }), 4)).toEqual(defaults);
    expect(resolveGamePostProcessing3D(settings({}), 4)).toEqual(defaults);
  });

  it("applies exposure and tone mapping without a composer", () => {
    expect(resolveGamePostProcessing3D(settings({ exposure: 2, toneMapping: "agx" }), 4)).toEqual({ toneMapping: THREE.AgXToneMapping, exposure: 2, composer: null });
    expect(resolveGamePostProcessing3D(settings({ toneMapping: "neutral" }), 4).toneMapping).toBe(THREE.NeutralToneMapping);
    expect(resolveGamePostProcessing3D(settings({ toneMapping: "linear" }), 4).toneMapping).toBe(THREE.LinearToneMapping);
  });

  it("orders composer passes and keeps multisampling only for msaa", () => {
    const stack = resolveGamePostProcessing3D(settings({ bloom: {}, vignette: {}, antialias: "smaa" }), 8);
    expect(gamePostProcessingPassNames3D(stack)).toEqual(["scene", "bloom", "output", "vignette", "smaa"]);
    expect(stack.composer?.samples).toBe(0);
    const bloom = resolveGamePostProcessing3D(settings({ bloom: { intensity: 2 } }), 8);
    expect(gamePostProcessingPassNames3D(bloom)).toEqual(["scene", "bloom", "output"]);
    expect(bloom.composer).toMatchObject({ samples: GAME_POST_MSAA_SAMPLES_3D, bloom: { intensity: 2 }, antialias: null });
    expect(resolveGamePostProcessing3D(settings({ vignette: {} }), 2).composer?.samples).toBe(2);
    expect(gamePostProcessingPassNames3D(resolveGamePostProcessing3D(settings({ antialias: "fxaa" }), 4))).toEqual(["scene", "output", "fxaa"]);
    expect(resolveGamePostProcessing3D(settings({ antialias: "none" }), 4).composer).toEqual({ samples: 0, bloom: null, vignette: null, antialias: null });
  });

  it("benchmarks a baseline and each effect on its own", () => {
    expect(GAME_POST_PROCESSING_BENCHMARK_VARIANTS_3D.map((variant) => variant.name)).toEqual(
      ["none", "exposure", "agx", "neutral", "linear", "bloom", "vignette", "fxaa", "smaa", "stack"]);
    for (const variant of GAME_POST_PROCESSING_BENCHMARK_VARIANTS_3D) {
      if (variant.postProcessing) { expect(gamePostProcessing3D.safeParse(variant.postProcessing).success, variant.name).toBe(true); }
    }
  });
});

describe("post-processing in real Chromium", () => {
  it("adds composer passes, releases their targets and returns to the direct render", async () => {
    const bundle = await build({ stdin: { contents: 'import {createGameRenderer3D} from "./src/browser3d.ts"; window.postHarness = { factory: createGameRenderer3D };',
      resolveDir: resolve("."), sourcefile: "post3d.ts" }, bundle: true, format: "iife", platform: "browser", minify: true, write: false, conditions: ["nodetool-dev"] });
    const script = bundle.outputFiles?.[0]; if (!script) { throw new Error("Renderer bundle is missing"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
      await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
      const frame = (postProcessing?: unknown): GameRenderFrame3D => {
        const base = blockoutFrame();
        return postProcessing ? { ...base, environment: { ...base.environment, postProcessing: settings(postProcessing) } } : base;
      };
      const frames = [frame(), frame({ bloom: { threshold: 0, intensity: 2 }, vignette: { intensity: 1 }, antialias: "smaa" }),
        frame({ bloom: { threshold: 0, intensity: 1 }, vignette: { intensity: 0.5 }, antialias: "smaa" }), frame({ enabled: false, bloom: {} }), frame(), frame({ antialias: "none" }), frame({ antialias: "smaa" })];
      const result = await page.evaluate(async (rendered) => {
        const canvas = document.querySelector("canvas"); if (!canvas) { throw new Error("Canvas missing"); }
        const renderer = await window.postHarness.factory({ canvas, preserveDrawingBuffer: true });
        try {
          renderer.resize(128, 128);
          const images: string[] = []; const textures: number[] = []; const drawCalls: number[] = []; const targetBytes: number[] = [];
          for (const item of rendered) {
            const stats = await renderer.render(item, 1);
            images.push(canvas.toDataURL("image/png")); textures.push(stats.textures); drawCalls.push(stats.drawCalls); targetBytes.push(stats.targetBytes);
          }
          return { images, textures, drawCalls, targetBytes };
        } finally { renderer.dispose(); }
      }, frames);
      expect(pageErrors).toEqual([]);
      const png = (dataUrl: string | undefined): Buffer => Buffer.from((dataUrl ?? "").replace(/^data:image\/png;base64,/, ""), "base64");
      const [plain, stack, retuned, disabled, restored, aliased, smaa] = result.images.map(png);
      if (!plain || !stack || !retuned || !disabled || !restored || !aliased || !smaa) { throw new Error("Post-processing captures are missing"); }
      const [plainDraws, stackDraws] = result.drawCalls;
      expect(stackDraws).toBeGreaterThan(plainDraws ?? Infinity);
      expect((await compareGameCaptures(plain, stack, 16)).changedFraction).toBeGreaterThan(0.05);
      // Changing parameters reuses the composer: the same passes, the same targets.
      expect(result.textures[2]).toBe(result.textures[1]);
      expect((await compareGameCaptures(stack, retuned, 0)).changedPixels).toBeGreaterThan(0);
      // Disabling releases the composer targets and renders the original pixels.
      expect(result.textures[3]).toBe(result.textures[0]);
      expect((await compareGameCaptures(plain, disabled, 0)).changedPixels).toBe(0);
      expect((await compareGameCaptures(plain, restored, 0)).changedPixels).toBe(0);
      // Composer targets count toward target memory and are released with the composer.
      expect(result.targetBytes[1]).toBe((result.targetBytes[0] ?? 0) + 128 * 128 * 8 * 2);
      expect(result.targetBytes[3]).toBe(result.targetBytes[0]);
      // The first frame of a new SMAA pass already smooths edges: its lookup textures are decoded before it renders.
      expect((await compareGameCaptures(aliased, smaa, 0)).changedPixels).toBeGreaterThan(0);
    } finally { await browser.close(); }
  }, 60_000);
});
