/**
 * Film grain on the GPU path (`filters.grain@1`).
 *
 * Three properties, each one a way the effect has to be wrong before it is
 * merely ugly:
 *
 * 1. **It varies the picture.** A grain that ran and changed nothing is
 *    indistinguishable from one that never ran, so the strength cases compare
 *    against the ungrained render rather than against a golden buffer.
 * 2. **It stays inside its own alpha.** The layer arrives premultiplied, so
 *    `rgb <= a` holds on every pixel and a grain that *added* noise would push
 *    a channel past it — invisible on an opaque layer, a bright fringe on a
 *    translucent one. That is why the module multiplies, and why the case that
 *    would have caught it is the half-transparent one.
 * 3. **It is reproducible.** Same seed, same bytes. A render handed back from a
 *    cache has to be the render that would have been computed.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import type { ClipGrainEffect } from "../src/index.js";
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
      `render.grain.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 64;

function uniform(r: number, g: number, b: number, a = 255): FrameLayerPixels {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  }
  return { rgba, width: SIZE, height: SIZE, version: `u-${r}-${g}-${b}-${a}` };
}

const grain = (over: Partial<ClipGrainEffect> = {}): ClipGrainEffect => ({
  id: "grain",
  type: "grain",
  enabled: true,
  amount: 0.5,
  ...over
});

function layerWith(
  source: FrameLayerPixels,
  effects: ClipGrainEffect[],
  over: Partial<FrameLayer> = {}
): FrameLayer {
  return {
    id: "shot",
    source,
    opacity: 1,
    blendMode: "normal",
    zIndex: 0,
    effects,
    ...over
  };
}

async function renderFrame(
  layers: FrameLayer[],
  alpha = false
): Promise<Uint8Array> {
  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const device = await getNodeGPUDevice();
  const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
  try {
    return await compositor.renderFrame(layers, [], { alpha });
  } finally {
    compositor.dispose();
  }
}

/** Population standard deviation of one channel — how much the grain moved it. */
function channelSpread(rgba: Uint8Array, channel = 0): number {
  const values: number[] = [];
  for (let i = channel; i < rgba.length; i += 4) values.push(rgba[i]!);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

describe.runIf(noAdapterReason === null)("grain on the GPU path", () => {
  it("varies a flat mid-grey that was perfectly uniform without it", async () => {
    const source = uniform(128, 128, 128);
    const plain = await renderFrame([layerWith(source, [])]);
    const grained = await renderFrame([
      layerWith(source, [grain({ amount: 0.5, seed: 7 })])
    ]);

    // The ungrained render is the control: flat in, flat out.
    expect(channelSpread(plain)).toBeLessThan(1);
    expect(channelSpread(grained)).toBeGreaterThan(5);
  });

  it("moves the picture further the higher the amount, and not at all at 0", async () => {
    const source = uniform(128, 128, 128);
    const off = await renderFrame([
      layerWith(source, [grain({ amount: 0, seed: 7 })])
    ]);
    const light = await renderFrame([
      layerWith(source, [grain({ amount: 0.15, seed: 7 })])
    ]);
    const heavy = await renderFrame([
      layerWith(source, [grain({ amount: 0.8, seed: 7 })])
    ]);

    // Amount 0 is a gain of exactly 1 — the identity, not "a little grain".
    expect(channelSpread(off)).toBeLessThan(1);
    expect(channelSpread(light)).toBeGreaterThan(1);
    expect(channelSpread(heavy)).toBeGreaterThan(channelSpread(light));
  });

  it("leaves black black — there is nothing there to modulate", async () => {
    const grained = await renderFrame([
      layerWith(uniform(0, 0, 0), [grain({ amount: 1, seed: 3 })])
    ]);
    for (let i = 0; i < grained.length; i += 4) {
      expect(grained[i]).toBe(0);
    }
  });

  it("keeps every channel inside its own alpha on a translucent layer", async () => {
    // The premultiplication check, and the reason it uses a *dark* half-opaque
    // source rather than a mid-grey one. The readback un-premultiplies and
    // saturates at 255, so on a bright layer an overflowing channel comes back
    // clamped and indistinguishable from a legal one — asserting `<= 255` there
    // examines nothing. Dark leaves headroom the bug has to show up in: a gain
    // of at most 2 can only take straight 32 to 64, while noise *added* to the
    // premultiplied value reaches 1.0 and un-premultiplies to 255.
    const grained = await renderFrame(
      [layerWith(uniform(32, 32, 32, 128), [grain({ amount: 1, seed: 11 })])],
      true
    );
    let peak = 0;
    for (let i = 0; i < grained.length; i += 4) {
      expect(grained[i + 3]).toBe(128);
      for (const c of [grained[i]!, grained[i + 1]!, grained[i + 2]!]) {
        peak = Math.max(peak, c);
      }
    }
    // Two texels of slack for the 8-bit round trip through the premul bridge.
    expect(peak).toBeLessThanOrEqual(66);
  });

  it("draws the same bytes twice for one seed, and different ones for another", async () => {
    const source = uniform(128, 128, 128);
    const first = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, seed: 42 })])
    ]);
    const again = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, seed: 42 })])
    ]);
    const other = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, seed: 43 })])
    ]);

    expect(Array.from(again)).toEqual(Array.from(first));
    expect(Array.from(other)).not.toEqual(Array.from(first));
  });

  it("coarsens into blocks as `size` grows", async () => {
    // A cell of 8px means the 8×8 block shares one gain; per-pixel does not.
    const source = uniform(128, 128, 128);
    const coarse = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, size: 8, seed: 5 })])
    ]);
    const fine = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, size: 1, seed: 5 })])
    ]);

    const sample = (rgba: Uint8Array, x: number, y: number) =>
      rgba[(y * SIZE + x) * 4]!;
    // Two pixels inside one coarse cell agree; the same two under fine grain
    // are independent samples and (for this seed) do not.
    expect(sample(coarse, 1, 1)).toBe(sample(coarse, 6, 6));
    expect(sample(fine, 1, 1)).not.toBe(sample(fine, 6, 6));
  });

  it("keeps the channels together at colour 0 and splits them at 1", async () => {
    const source = uniform(128, 128, 128);
    const mono = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, colorAmount: 0, seed: 9 })])
    ]);
    const colour = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, colorAmount: 1, seed: 9 })])
    ]);

    // Monochrome grain is one gain for the pixel, so r, g and b move together.
    for (let i = 0; i < mono.length; i += 4) {
      expect(mono[i + 1]).toBe(mono[i]);
      expect(mono[i + 2]).toBe(mono[i]);
    }
    let split = 0;
    for (let i = 0; i < colour.length; i += 4) {
      if (colour[i + 1] !== colour[i] || colour[i + 2] !== colour[i]) split++;
    }
    expect(split).toBeGreaterThan(SIZE * SIZE * 0.5);
  });
});
