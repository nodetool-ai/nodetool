/**
 * The legacy track-effect spellings on the GPU path.
 *
 * `TrackEffect`'s video kinds are converted to clip effects at the door of the
 * renderer (`render/trackEffects.ts`), so a track and a clip carrying the same
 * numbers have to produce the same frame — and the two parameters the legacy
 * spelling makes mandatory and the clip spelling leaves optional (a vignette's
 * midpoint, a sharpen's edge threshold) have to survive the trip. A conversion
 * that dropped either would still pass every case that only asserts "the
 * effect ran", so each is pinned against a second render with a different
 * value rather than against the effect's absence.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import type { ClipEffect, TrackEffect } from "../src/index.js";
import {
  HeadlessFrameCompositor,
  type FrameLayer,
  type FrameLayerPixels
} from "../src/render/frameCompositor.js";

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `render.trackEffects.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 64;

function pixels(
  version: string,
  at: (x: number, y: number) => [number, number, number, number]
): FrameLayerPixels {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = at(x, y);
      const i = (y * SIZE + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return { rgba, width: SIZE, height: SIZE, version };
}

const uniform = (r: number, g: number, b: number): FrameLayerPixels =>
  pixels(`uniform-${r}-${g}-${b}`, () => [r, g, b, 255]);

/** A soft edge: two near greys, the contrast an edge threshold can suppress. */
const softEdge = (): FrameLayerPixels =>
  pixels("soft-edge", (x) => (x < SIZE / 2 ? [96, 96, 96, 255] : [136, 136, 136, 255]));

async function renderFrame(layers: FrameLayer[]): Promise<Uint8Array> {
  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const device = await getNodeGPUDevice();
  const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
  try {
    return await compositor.renderFrame(layers);
  } finally {
    compositor.dispose();
  }
}

const pixelAt = (
  rgba: Uint8Array,
  x: number,
  y: number
): [number, number, number, number] => {
  const i = (y * SIZE + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
};

/** Total absolute channel difference between two frames. */
const frameDelta = (a: Uint8Array, b: Uint8Array): number => {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!);
  return total;
};

const render = (
  source: FrameLayerPixels,
  effects: ClipEffect[],
  trackEffects: TrackEffect[] = []
): Promise<Uint8Array> =>
  renderFrame([
    {
      id: "shot",
      source,
      opacity: 1,
      blendMode: "normal",
      zIndex: 0,
      effects,
      trackEffects
    }
  ]);

describe.runIf(noAdapterReason === null)(
  "HeadlessFrameCompositor — legacy track effects",
  () => {
    it("draws a track vignette exactly as the clip vignette carrying its numbers", async () => {
      const flat = uniform(255, 255, 255);
      const track = await render(flat, [], [
        {
          id: "t",
          type: "vignette",
          enabled: true,
          intensity: 0.8,
          radius: 0.5,
          softness: 0.4
        }
      ]);
      const clip = await render(flat, [
        {
          id: "c",
          type: "vignette",
          enabled: true,
          amount: 0.8,
          radius: 0.5,
          softness: 0.4
        }
      ]);
      expect(frameDelta(track, clip)).toBe(0);
      // The vignette ran at all: the corner is darker than the centre.
      expect(pixelAt(track, 1, 1)[0]).toBeLessThan(
        pixelAt(track, SIZE / 2, SIZE / 2)[0]
      );
    });

    it("carries a track vignette's midpoint, which the clip spelling may omit", async () => {
      const flat = uniform(255, 255, 255);
      const tight = await render(flat, [], [
        {
          id: "t",
          type: "vignette",
          enabled: true,
          intensity: 0.8,
          radius: 0.35,
          softness: 0.4
        }
      ]);
      const wide = await render(flat, [], [
        {
          id: "t",
          type: "vignette",
          enabled: true,
          intensity: 0.8,
          radius: 1.4,
          softness: 0.4
        }
      ]);
      // A conversion that dropped `radius` would render these identically.
      expect(frameDelta(tight, wide)).toBeGreaterThan(0);
      expect(pixelAt(tight, SIZE / 2, SIZE / 2)[0]).toBeLessThan(
        pixelAt(wide, SIZE / 2, SIZE / 2)[0]
      );
    });

    it("carries a track sharpen's edge threshold, which the clip spelling may omit", async () => {
      const edge = softEdge();
      const keen = await render(edge, [], [
        { id: "t", type: "sharpen", enabled: true, amount: 2, threshold: 0 }
      ]);
      const blunt = await render(edge, [], [
        { id: "t", type: "sharpen", enabled: true, amount: 2, threshold: 0.9 }
      ]);
      // A conversion that dropped `threshold` would render these identically.
      expect(frameDelta(keen, blunt)).toBeGreaterThan(0);
      const clip = await render(edge, [
        {
          id: "c",
          type: "sharpen",
          enabled: true,
          amount: 2,
          threshold: 0.9
        }
      ]);
      expect(frameDelta(blunt, clip)).toBe(0);
    });

    it("draws a track chroma key exactly as the clip key carrying its numbers", async () => {
      const split = pixels("split", (x) =>
        x < SIZE / 2 ? [0, 255, 0, 255] : [255, 0, 0, 255]
      );
      const track = await render(split, [], [
        {
          id: "t",
          type: "chromaKey",
          enabled: true,
          keyColor: "#00ff00",
          tolerance: 0.3,
          softness: 0.05,
          spill: 0.5
        }
      ]);
      const clip = await render(split, [
        {
          id: "c",
          type: "chromaKey",
          enabled: true,
          color: "#00ff00",
          tolerance: 0.3,
          softness: 0.05,
          spill: 0.5
        }
      ]);
      expect(frameDelta(track, clip)).toBe(0);
      expect(pixelAt(track, 4, SIZE / 2)[1]).toBeLessThan(24);
      expect(pixelAt(track, SIZE - 5, SIZE / 2)[0]).toBeGreaterThan(230);
    });

    it("keys on the track before the clip grade rotates the key colour away", async () => {
      const split = pixels("split", (x) =>
        x < SIZE / 2 ? [0, 255, 0, 255] : [255, 0, 0, 255]
      );
      const keyed = await render(
        split,
        [{ id: "c", type: "color", enabled: true, hue: 120 }],
        [
          {
            id: "t",
            type: "chromaKey",
            enabled: true,
            keyColor: "#00ff00",
            tolerance: 0.3,
            softness: 0.05,
            spill: 0.5
          }
        ]
      );
      // Green is gone. Had the key run after the grade, the hue rotation would
      // have moved it off `#00ff00` and the key would have missed it.
      const [r, g, b] = pixelAt(keyed, 4, SIZE / 2);
      expect(Math.max(r, g, b)).toBeLessThan(24);
    });

    it("folds a track grade and a clip grade into one pass", async () => {
      const mid = uniform(128, 128, 128);
      const both = await render(
        mid,
        [{ id: "c", type: "color", enabled: true, brightness: 0.1 }],
        [
          {
            id: "t",
            type: "colorCorrection",
            enabled: true,
            brightness: 0.2,
            contrast: 1,
            saturation: 1,
            hue: 0,
            temperature: 0,
            tint: 0,
            shadows: 0,
            highlights: 0
          }
        ]
      );
      const summed = await render(mid, [
        { id: "c", type: "color", enabled: true, brightness: 0.3 }
      ]);
      expect(frameDelta(both, summed)).toBe(0);
    });

    it("skips a disabled track effect", async () => {
      const flat = uniform(255, 255, 255);
      const off = await render(flat, [], [
        {
          id: "t",
          type: "vignette",
          enabled: false,
          intensity: 1,
          radius: 0.4,
          softness: 0.4
        }
      ]);
      expect(frameDelta(off, await render(flat, []))).toBe(0);
    });

    it("ignores a track's audio effects", async () => {
      const flat = uniform(200, 120, 60);
      const withAudio = await render(flat, [], [
        { id: "g", type: "gain", enabled: true, gainDb: 6 },
        { id: "f", type: "filter", enabled: true, mode: "lowpass", frequency: 800, q: 1 }
      ]);
      expect(frameDelta(withAudio, await render(flat, []))).toBe(0);
    });
  }
);
