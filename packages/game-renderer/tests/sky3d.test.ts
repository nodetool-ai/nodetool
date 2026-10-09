import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { gameRenderFrame3D, type GameRenderFrame3D, type GameSky3D } from "@nodetool-ai/protocol";
import type { CreateGameRenderer3DOptions, GameRenderer3D } from "../src/browser3d.js";
import { gameSkySunDirection3D } from "../src/renderer3d/environment/sky.js";
import { compareGameCaptures } from "../src/imageDiff.js";

interface SkyHarness {
  readonly factory: (options: CreateGameRenderer3DOptions) => Promise<GameRenderer3D>;
  readonly three: typeof import("three");
}
declare global { interface Window { skyHarness: SkyHarness } }

const golden = new URL("./fixtures/sky-golden/hdri-spheres.png", import.meta.url);
const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };

function sphereFrame(sky?: GameSky3D): GameRenderFrame3D {
  const sphere = (entityId: string, x: number, y: number, metalness: number, roughness: number) => {
    const pose = { ...transform, position: { x, y, z: 0 } };
    return { entityId, transform: pose, previousTransform: pose,
      primitive: { kind: "sphere", dimensions: { x: 1, y: 1, z: 1 }, castShadow: false, receiveShadow: false, material: { color: "#d8d2c8", metalness, roughness } } };
  };
  return gameRenderFrame3D.parse({ dimension: "3d", gameId: "sky", sceneId: "scene", tick: 0,
    presentation: { aspectRatio: 1.5, hudWidth: 192, hudHeight: 128 },
    camera: { entityId: "camera", transform: { ...transform, position: { x: 0, y: 0, z: 4 } }, projection: { kind: "perspective", fov: 50, near: 0.1, far: 100 } },
    entities: [sphere("chrome", -1.2, 0.6, 1, 0), sphere("brushed", 0, 0.6, 1, 0.35), sphere("satin", 1.2, 0.6, 1, 0.7),
      sphere("plastic", -0.6, -0.6, 0, 0.2), sphere("matte", 0.6, -0.6, 0, 0.9)],
    lights: [], environment: { background: "#202838", ambient: { color: "#ffffff", intensity: 0 }, shadows: { enabled: false, mapSize: 512, extent: 20 }, ...(sky ? { sky } : {}) }, hud: [] });
}

/** A 64x32 equirectangular test image: blue-to-white sky, warm ground and one bright red patch at +X. */
function equirectangularPixels(): number[] {
  const width = 64; const height = 32; const pixels: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const up = 1 - (row + 0.5) / height * 2;
      const patch = column >= 44 && column < 52 && row >= 10 && row < 16;
      if (patch) { pixels.push(6, 0.2, 0.1, 1); }
      else if (up >= 0) { pixels.push(0.3 + 0.9 * (1 - up), 0.5 + 0.7 * (1 - up), 1.4, 1); }
      else { pixels.push(0.45, 0.28, 0.12, 1); }
    }
  }
  return pixels;
}

async function pagePixel(png: Buffer, x: number, y: number): Promise<readonly number[]> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return [...context.getImageData(x, y, 1, 1).data];
}

describe("scene sky sun direction", () => {
  const light = (entityId: string, kind: "directional" | "point", rotation: [number, number, number, number]) => ({ entityId, transform: { ...transform, rotation },
    light: kind === "directional" ? { kind, color: "#ffffff", intensity: 1, castShadow: false } as const : { kind, color: "#ffffff", intensity: 1, range: 4, decay: 2 } as const });
  const sky = { kind: "procedural", turbidity: 10, rayleigh: 2, groundColor: "#3d3a36", intensity: 1 } as const;
  const down: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  it("points at the linked light's reverse forward axis", () => {
    const lights = [light("lamp", "point", down), light("moon", "directional", [0, 0, 0, 1]), light("sun", "directional", down)];
    const linked = gameSkySunDirection3D({ ...sky, sunEntityId: "sun" }, { lights });
    expect(linked.x).toBeCloseTo(0, 6); expect(linked.y).toBeCloseTo(1, 6); expect(linked.z).toBeCloseTo(0, 6);
    expect(gameSkySunDirection3D(sky, { lights }).toArray()).toEqual([0, 0, 1]);
  });
  it("falls back to a fixed direction without a directional light", () => {
    const direction = gameSkySunDirection3D(sky, { lights: [light("lamp", "point", down)] });
    expect(direction.length()).toBeCloseTo(1);
    expect(direction.y).toBeGreaterThan(0);
  });
});

describe("HDRI sky in real Chromium", () => {
  it("lights PBR spheres from a decoded HDRI and falls back to the background color without a decoder", async () => {
    const bundle = await build({ stdin: { contents: 'import * as three from "three"; import {createGameRenderer3D} from "./src/browser3d.ts"; window.skyHarness = { factory: createGameRenderer3D, three };',
      resolveDir: resolve("."), sourcefile: "sky3d.ts" }, bundle: true, format: "iife", platform: "browser", minify: true, write: false, conditions: ["nodetool-dev"] });
    const script = bundle.outputFiles?.[0]; if (!script) { throw new Error("Renderer bundle is missing"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
      await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
      const hdri = sphereFrame({ kind: "hdri", assetId: "studio", rotation: 0, intensity: 1 });
      const result = await page.evaluate(async ({ frames, pixels }) => {
        const canvas = document.querySelector("canvas"); if (!canvas) { throw new Error("Canvas missing"); }
        const { three } = window.skyHarness;
        const binding = { mediaKind: "hdri" as const, assetId: "0123456789abcdef0123456789abcdef", digest: "f".repeat(64), required: true,
          format: "hdr" as const, width: 64, height: 32, byteLength: pixels.length * 4, preparationVersion: "1" as const };
        let decodes = 0;
        const capture = async (decoder: boolean, rendered: readonly GameRenderFrame3D[]) => {
          const renderer = await window.skyHarness.factory({ canvas, preserveDrawingBuffer: true,
            resolveHdri: async (slot) => slot === "studio" ? { bytes: new Uint8Array(new Float32Array(pixels).buffer), binding } : null,
            ...(decoder ? { decodeHdri: async (prepared) => {
              decodes++;
              const texture = new three.DataTexture(new Float32Array(prepared.bytes.slice().buffer), prepared.binding.width, prepared.binding.height, three.RGBAFormat, three.FloatType);
              texture.flipY = true;
              texture.needsUpdate = true;
              return texture;
            } } : {}) });
          try {
            renderer.resize(192, 128);
            const images: string[] = []; const environments: boolean[] = []; let diagnostics: readonly string[] = [];
            for (const frame of rendered) {
              diagnostics = (await renderer.render(frame, 1)).diagnostics;
              images.push(canvas.toDataURL("image/png"));
              environments.push(renderer.getScene().environment !== null);
            }
            return { images, environments, diagnostics };
          } finally { renderer.dispose(); }
        };
        const decoded = await capture(true, [frames.hdri, frames.rotated, frames.color, frames.plain, frames.missing]);
        const undecoded = await capture(false, [frames.hdri, frames.color]);
        return { decoded, undecoded, decodes };
      }, { frames: { hdri, rotated: sphereFrame({ kind: "hdri", assetId: "studio", rotation: Math.PI, intensity: 1 }),
        color: sphereFrame({ kind: "color" }), plain: sphereFrame(), missing: sphereFrame({ kind: "hdri", assetId: "absent", rotation: 0, intensity: 1 }) },
      pixels: equirectangularPixels() });
      expect(pageErrors).toEqual([]);
      const png = (dataUrl: string | undefined): Buffer => Buffer.from((dataUrl ?? "").replace(/^data:image\/png;base64,/, ""), "base64");
      const [lit, rotated, color, plain, missing] = result.decoded.images.map(png);
      if (!lit || !rotated || !color || !plain || !missing) { throw new Error("Sky captures are missing"); }
      expect(result.decodes).toBe(1);
      expect(result.decoded.environments).toEqual([true, true, false, false, false]);
      expect(result.decoded.diagnostics).toEqual(["HDRI sky absent is missing; rendering the background color"]);
      if (process.env["UPDATE_NATIVE_GAME_GOLDENS"] === "1") { await writeFile(golden, lit); }
      expect((await compareGameCaptures(await readFile(golden), lit, 16)).changedFraction).toBeLessThanOrEqual(0.005);
      // The chrome sphere at the top left reflects the sky. Without an environment it renders black.
      const chrome = await pagePixel(lit, 51, 34);
      expect(Math.max(...chrome.slice(0, 3))).toBeGreaterThan(80);
      expect(Math.max(...(await pagePixel(color, 51, 34)).slice(0, 3))).toBeLessThan(16);
      expect((await compareGameCaptures(lit, rotated, 16)).changedFraction).toBeGreaterThan(0.05);
      expect((await compareGameCaptures(plain, color, 0)).changedPixels).toBe(0);
      expect((await compareGameCaptures(plain, missing, 0)).changedPixels).toBe(0);
      const [fallback, fallbackColor] = result.undecoded.images.map(png);
      if (!fallback || !fallbackColor) { throw new Error("Fallback captures are missing"); }
      expect(result.undecoded.environments).toEqual([false, false]);
      expect(result.undecoded.diagnostics).toEqual(["HDRI sky studio needs an HDRI decoder; rendering the background color"]);
      expect((await compareGameCaptures(fallbackColor, fallback, 0)).changedPixels).toBe(0);
    } finally { await browser.close(); }
  }, 60_000);
});
