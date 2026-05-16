/**
 * Sharp ↔ Canvas parity tests for `ImageRuntime`.
 *
 * Goal: quantify how close the node (sharp) and browser (OffscreenCanvas)
 * runtimes are for the same op + same input, so live-preview drift is bounded
 * and visible in CI.
 *
 * Method: generate 3 deterministic 64×64 images (solid, gradient, checker)
 * inline via sharp. For each op, run both runtimes and compute the mean
 * absolute difference (MAD) across RGB channels of the decoded raw pixels.
 * Per-op tolerances reflect that resampling/blur kernels differ between sharp
 * (lanczos3, gaussian sigma) and the canvas spec (vendor-defined "high"
 * smoothing, CSS `blur(Npx)` filter). Geometry ops (crop/rotate-90/flip) are
 * pixel-exact aside from any encode-round-trip artifacts.
 *
 * Polyfill: vitest's default node env has no `OffscreenCanvas` or
 * `createImageBitmap`. We install a tiny shim backed by `@napi-rs/canvas`
 * (already a base-nodes dep) in `beforeAll`, then dynamically import
 * `../browser.js` so its first call uses the polyfilled globals.
 */
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import {
  createCanvas,
  loadImage,
  type Image as NapiImage
} from "@napi-rs/canvas";

import { nodeImageRuntime } from "../node.js";
import type { ImageBytes, ImageRuntime } from "../index.js";

const SIZE = 64;

// -----------------------------------------------------------------------------
// OffscreenCanvas / createImageBitmap polyfill (jsdom-free, < 40 LOC)
// -----------------------------------------------------------------------------
function installCanvasPolyfill(): void {
  const g = globalThis as Record<string, unknown>;

  // OffscreenCanvas: `new OffscreenCanvas(w, h)` returns a napi-rs Canvas,
  // which already exposes `getContext('2d')` and `convertToBlob({type})`.
  if (typeof g.OffscreenCanvas === "undefined") {
    class OffscreenCanvasShim {
      constructor(width: number, height: number) {
        return createCanvas(width, height) as unknown as OffscreenCanvasShim;
      }
    }
    g.OffscreenCanvas = OffscreenCanvasShim as unknown as typeof OffscreenCanvas;
  }

  // createImageBitmap: decode a Blob (or Uint8Array) to a drawable Image via
  // napi-rs `loadImage`. `browser.ts` passes a Blob built from Uint8Array, so
  // we handle Blob → ArrayBuffer → Buffer → loadImage.
  if (typeof g.createImageBitmap === "undefined") {
    g.createImageBitmap = async (source: Blob | Uint8Array): Promise<ImageBitmap> => {
      const bytes =
        source instanceof Uint8Array
          ? source
          : new Uint8Array(await (source as Blob).arrayBuffer());
      const img: NapiImage = await loadImage(Buffer.from(bytes));
      // browser.ts only reads width/height/calls bitmap.close?.() → safe to
      // hand back the napi Image directly.
      return img as unknown as ImageBitmap;
    };
  }
}

// -----------------------------------------------------------------------------
// Deterministic test images
// -----------------------------------------------------------------------------
async function makeSolidRed(): Promise<ImageBytes> {
  const buf = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
    .png()
    .toBuffer();
  return { data: new Uint8Array(buf), width: SIZE, height: SIZE, mimeType: "image/png" };
}

async function makeVerticalGradient(): Promise<ImageBytes> {
  // Black-to-white vertical gradient; row y = (y / (SIZE-1)) * 255.
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    const v = Math.round((y / (SIZE - 1)) * 255);
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      raw[i] = v;
      raw[i + 1] = v;
      raw[i + 2] = v;
    }
  }
  const buf = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toBuffer();
  return { data: new Uint8Array(buf), width: SIZE, height: SIZE, mimeType: "image/png" };
}

async function makeCheckerboard(): Promise<ImageBytes> {
  // 8×8 cells of alternating black/white.
  const cell = 8;
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const on = ((x / cell) | 0) + ((y / cell) | 0);
      const v = on % 2 === 0 ? 255 : 0;
      const i = (y * SIZE + x) * 3;
      raw[i] = v;
      raw[i + 1] = v;
      raw[i + 2] = v;
    }
  }
  const buf = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toBuffer();
  return { data: new Uint8Array(buf), width: SIZE, height: SIZE, mimeType: "image/png" };
}

// -----------------------------------------------------------------------------
// Pixel-diff metric (mean absolute difference, RGB only)
// -----------------------------------------------------------------------------
interface RawPixels {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function decodeRaw(image: ImageBytes): Promise<RawPixels> {
  const out = await sharp(Buffer.from(image.data))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: out.data,
    width: out.info.width,
    height: out.info.height,
    channels: out.info.channels
  };
}

function meanAbsoluteDifference(a: RawPixels, b: RawPixels): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `MAD: dimension mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`
    );
  }
  if (a.channels !== b.channels) {
    throw new Error(`MAD: channel mismatch ${a.channels} vs ${b.channels}`);
  }
  const n = a.data.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / n;
}

async function diff(node: ImageBytes, browser: ImageBytes): Promise<number> {
  const [a, b] = await Promise.all([decodeRaw(node), decodeRaw(browser)]);
  return meanAbsoluteDifference(a, b);
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------
let browserRuntime: ImageRuntime;
let solidRed: ImageBytes;
let gradient: ImageBytes;
let checker: ImageBytes;

beforeAll(async () => {
  installCanvasPolyfill();
  // Dynamic import so the polyfill is in place before browser.ts ever runs.
  const mod = await import("../browser.js");
  browserRuntime = mod.browserImageRuntime;

  [solidRed, gradient, checker] = await Promise.all([
    makeSolidRed(),
    makeVerticalGradient(),
    makeCheckerboard()
  ]);
});

// Per-op tolerances (mean absolute difference, 0–255 scale).
//
// Geometry ops (crop/rotate-90/flip) should be byte-equivalent modulo
// re-encode noise from differing PNG encoders → tolerate <2.
// Resize uses different resamplers (sharp:lanczos3, canvas:browser-defined) →
// expect modest drift especially on the checkerboard's high-freq edges.
// Blur diverges most — sharp's Gaussian (sigma) vs CSS `blur(Npx)` are
// different kernel families.
// Empirically measured during spike (sharp 0.34 / @napi-rs/canvas 0.1):
//   resize  : solid≈0, gradient≈0.8, checker≈11.4   → 15
//   crop    : ≈0 across the board                     → 2
//   rotate90: ≈0                                       → 2
//   flip    : ≈0                                       → 2
//   blur    : sharp σ=4 vs CSS blur(4px) — different
//             kernels, larger drift on edges          → 30
const TOL = {
  resize: 15,
  crop: 2,
  rotate90: 2,
  flip: 2,
  blur: 30
};

interface Fixture {
  name: string;
  get: () => ImageBytes;
}

function fixtures(): Fixture[] {
  return [
    { name: "solid-red", get: () => solidRed },
    { name: "vertical-gradient", get: () => gradient },
    { name: "checkerboard", get: () => checker }
  ];
}

describe("ImageRuntime parity (sharp vs canvas)", () => {
  describe("resize 32x32", () => {
    for (const fx of [
      { name: "solid-red", get: () => solidRed },
      { name: "vertical-gradient", get: () => gradient },
      { name: "checkerboard", get: () => checker }
    ]) {
      it(`${fx.name}: MAD < ${TOL.resize}`, async () => {
        const src = fx.get();
        const [n, b] = await Promise.all([
          nodeImageRuntime.resize(src, { width: 32, height: 32, filter: "lanczos" }),
          browserRuntime.resize(src, { width: 32, height: 32, filter: "lanczos" })
        ]);
        expect(n.width).toBe(32);
        expect(b.width).toBe(32);
        const mad = await diff(n, b);
        expect(mad).toBeLessThan(TOL.resize);
      });
    }
  });

  describe("crop {x:8, y:8, w:48, h:48}", () => {
    for (const fx of fixtures()) {
      it(`${fx.name}: MAD < ${TOL.crop}`, async () => {
        const opts = { x: 8, y: 8, width: 48, height: 48 };
        const [n, b] = await Promise.all([
          nodeImageRuntime.crop(fx.get(), opts),
          browserRuntime.crop(fx.get(), opts)
        ]);
        expect(n.width).toBe(48);
        expect(b.width).toBe(48);
        const mad = await diff(n, b);
        expect(mad).toBeLessThan(TOL.crop);
      });
    }
  });

  describe("rotate 90°", () => {
    for (const fx of fixtures()) {
      it(`${fx.name}: MAD < ${TOL.rotate90}`, async () => {
        const [n, b] = await Promise.all([
          nodeImageRuntime.rotate(fx.get(), { angle: 90 }),
          browserRuntime.rotate(fx.get(), { angle: 90 })
        ]);
        // 90° on a square is still a square; both runtimes return SIZE×SIZE.
        expect(n.width).toBe(SIZE);
        expect(b.width).toBe(SIZE);
        const mad = await diff(n, b);
        expect(mad).toBeLessThan(TOL.rotate90);
      });
    }
  });

  describe("flip horizontal", () => {
    for (const fx of fixtures()) {
      it(`${fx.name}: MAD < ${TOL.flip}`, async () => {
        const [n, b] = await Promise.all([
          nodeImageRuntime.flip(fx.get(), { horizontal: true }),
          browserRuntime.flip(fx.get(), { horizontal: true })
        ]);
        const mad = await diff(n, b);
        expect(mad).toBeLessThan(TOL.flip);
      });
    }
  });

  describe("blur radius=4", () => {
    for (const fx of fixtures()) {
      it(`${fx.name}: MAD < ${TOL.blur}`, async () => {
        const [n, b] = await Promise.all([
          nodeImageRuntime.blur(fx.get(), { radius: 4 }),
          browserRuntime.blur(fx.get(), { radius: 4 })
        ]);
        const mad = await diff(n, b);
        expect(mad).toBeLessThan(TOL.blur);
      });
    }
  });
});
