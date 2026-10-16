import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import type * as THREE from "three";
import type { GameSkyRenderer3D } from "../src/renderer3d/environment/sky.js";
import { blockoutFrame } from "./fixtures/game3d.js";

declare global {
  interface Window {
    skyCleanupHarness: { readonly SkyRenderer: typeof GameSkyRenderer3D; readonly three: typeof THREE; readonly configureEnvironment: typeof import("../src/renderer3d/environment/index.js").configureGameEnvironment };
  }
}

it("detaches owned sky maps before disposal and resets lighting state across reset, invalidation and fallback", async () => {
  const bundle = await build({ stdin: {
    contents: 'import * as three from "three"; import {GameSkyRenderer3D as SkyRenderer} from "./src/renderer3d/environment/sky.ts"; import {configureGameEnvironment as configureEnvironment} from "./src/renderer3d/environment/index.ts"; window.skyCleanupHarness={three,SkyRenderer,configureEnvironment};',
    resolveDir: resolve("."), sourcefile: "sky-cleanup-control.ts"
  }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0];
  if (!script) { throw new Error("Sky bundle missing"); }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(async frame => {
      const { three, SkyRenderer, configureEnvironment } = window.skyCleanupHarness;
      const renderer = new three.WebGLRenderer();
      const cases: { mode: string; detachedAtDispose: boolean; fallbackClean: boolean; recovered: boolean | null; unrelatedRetained: boolean }[] = [];
      const ownership: { mode: string; retained: boolean }[] = [];
      const tracked = new Map<THREE.Texture, { scene: THREE.Scene; background: THREE.Texture; environment: THREE.Texture; detached: boolean; backgroundDisposals: number; environmentDisposals: number }>();
      const observeDisposal = (texture: THREE.Texture) => {
        const entry = tracked.get(texture);
        if (!entry) { return; }
        entry.detached &&= entry.scene.environment !== entry.environment && entry.scene.background !== entry.background;
        if (texture === entry.background) { entry.backgroundDisposals++; }
        if (texture === entry.environment) { entry.environmentDisposals++; }
      };
      const disposeTexture = three.Texture.prototype.dispose;
      three.Texture.prototype.dispose = function () {
        observeDisposal(this);
        disposeTexture.call(this);
      };
      const disposeTarget = three.WebGLRenderTarget.prototype.dispose;
      three.WebGLRenderTarget.prototype.dispose = function () {
        observeDisposal(this.texture);
        disposeTarget.call(this);
      };
      try {
        for (const mode of ["hdri-reset", "hdri-invalidate", "hdri-dispose", "procedural-reset", "procedural-dispose", "hdri-fallback", "hdri-foreign", "hdri-foreign-background", "hdri-foreign-environment", "hdri-color-replacement"]) {
          const scene = new three.Scene();
          let available = true;
          const sky = new SkyRenderer(renderer, {
            resolveHdri: async () => available ? { bytes: new Uint8Array(8), binding: {
              mediaKind: "hdri", assetId: "a".repeat(32), digest: "f".repeat(64), required: true,
              format: "hdr", width: 8, height: 4, byteLength: 8, preparationVersion: "1"
            } } : null,
            decodeHdri: async () => {
              const texture = new three.DataTexture(new Float32Array(8 * 4 * 4).fill(1), 8, 4, three.RGBAFormat, three.FloatType);
              texture.needsUpdate = true;
              return texture;
            }
          }, new AbortController().signal, []);
          frame.environment.sky = mode.startsWith("hdri")
            ? { kind: "hdri", assetId: "studio", intensity: 3, rotation: 0.7 }
            : { kind: "procedural", intensity: 3, turbidity: 10, rayleigh: 2, groundColor: "#3d3a36" };
          try {
            await sky.apply(scene, frame);
            if (mode.startsWith("hdri")) {
              await sky.apply(scene, { ...frame, environment: { ...frame.environment, sky: { kind: "hdri", assetId: "unrelated", intensity: 1, rotation: 0 } } });
              await sky.apply(scene, frame);
            }
            if (mode === "hdri-fallback") {
              configureEnvironment(scene, new three.AmbientLight(), renderer, frame.environment);
              const color = scene.background;
              await sky.apply(scene, { ...frame, environment: { ...frame.environment, sky: { kind: "color" } } });
              ownership.push({ mode, retained: color instanceof three.Color && scene.background === color && scene.environment === null
                && scene.backgroundIntensity === 1 && scene.environmentIntensity === 1
                && scene.backgroundRotation.toArray().slice(0, 3).every(value => value === 0)
                && scene.environmentRotation.toArray().slice(0, 3).every(value => value === 0) });
              continue;
            }
            if (mode.startsWith("hdri-foreign") || mode === "hdri-color-replacement") {
              const replaceBackground = mode !== "hdri-foreign-environment";
              const replaceEnvironment = mode === "hdri-foreign" || mode === "hdri-foreign-environment";
              const foreignBackground = mode === "hdri-color-replacement" ? new three.Color("#123456") : new three.Texture();
              const foreignEnvironment = new three.Texture();
              if (replaceBackground) {
                scene.background = foreignBackground; scene.backgroundIntensity = 7; scene.backgroundRotation.set(0.1, 0.2, 0.3);
              }
              if (replaceEnvironment) {
                scene.environment = foreignEnvironment; scene.environmentIntensity = 9; scene.environmentRotation.set(0.4, 0.5, 0.6);
              }
              sky.reset();
              ownership.push({ mode, retained: scene.background === (replaceBackground ? foreignBackground : null)
                && scene.environment === (replaceEnvironment ? foreignEnvironment : null)
                && scene.backgroundIntensity === (replaceBackground ? 7 : 1) && scene.environmentIntensity === (replaceEnvironment ? 9 : 1)
                && scene.backgroundRotation.toArray().slice(0, 3).every((value, index) => value === (replaceBackground ? [0.1, 0.2, 0.3][index] : 0))
                && scene.environmentRotation.toArray().slice(0, 3).every((value, index) => value === (replaceEnvironment ? [0.4, 0.5, 0.6][index] : 0)) });
              if (foreignBackground instanceof three.Texture) { foreignBackground.dispose(); }
              foreignEnvironment.dispose();
              continue;
            }
            const environment = scene.environment;
            const background = scene.background;
            if (!environment || !(background instanceof three.Texture)) { throw new Error("Sky did not install actual textures"); }
            await sky.invalidate("unrelated");
            const unrelatedRetained = scene.environment === environment && scene.background === background;
            const disposal = { scene, background, environment, detached: true, backgroundDisposals: 0, environmentDisposals: 0 };
            tracked.set(environment, disposal);
            tracked.set(background, disposal);
            if (mode.endsWith("invalidate")) { await sky.invalidate("studio"); }
            else if (mode.endsWith("dispose")) { sky.dispose(); }
            else { sky.reset(); }
            await Promise.resolve();
            const detachedImmediately = scene.environment === null && scene.background === null;
            const defaults = () => scene.environmentIntensity === 1 && scene.backgroundIntensity === 1
              && scene.environmentRotation.toArray().slice(0, 3).every(value => value === 0)
              && scene.backgroundRotation.toArray().slice(0, 3).every(value => value === 0);
            if (mode.endsWith("dispose")) {
              cases.push({ mode, detachedAtDispose: disposal.detached && disposal.backgroundDisposals > 0 && disposal.environmentDisposals > 0, fallbackClean: detachedImmediately && defaults(), recovered: null, unrelatedRetained });
              continue;
            }
            available = false;
            scene.background = new three.Color("#203040");
            if (mode.startsWith("procedural")) { frame.environment.sky = { kind: "color" }; }
            await sky.apply(scene, frame);
            const fallbackClean = detachedImmediately && scene.environment === null && scene.background instanceof three.Color
              && defaults();
            available = true;
            await sky.invalidate("studio");
            frame.environment.sky = { kind: "hdri", assetId: "studio", intensity: 2, rotation: 0.2 };
            await sky.apply(scene, frame);
            cases.push({ mode, detachedAtDispose: disposal.detached && disposal.backgroundDisposals > 0 && disposal.environmentDisposals > 0, fallbackClean, recovered: scene.environment !== null && scene.environment !== environment, unrelatedRetained });
          } finally { sky.dispose(); }
        }
        return { cases, ownership };
      } finally {
        three.Texture.prototype.dispose = disposeTexture;
        three.WebGLRenderTarget.prototype.dispose = disposeTarget;
        renderer.dispose();
      }
    }, blockoutFrame());
    expect(result.cases).toHaveLength(5);
    for (const entry of result.cases) {
      expect(entry, entry.mode).toEqual({ mode: entry.mode, detachedAtDispose: true, fallbackClean: true, recovered: entry.mode.endsWith("dispose") ? null : true, unrelatedRetained: true });
    }
    expect(result.ownership).toEqual(["hdri-fallback", "hdri-foreign", "hdri-foreign-background", "hdri-foreign-environment", "hdri-color-replacement"].map(mode => ({ mode, retained: true })));
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 40_000);
