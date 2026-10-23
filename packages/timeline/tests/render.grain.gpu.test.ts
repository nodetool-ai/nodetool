/**
 * Film grain on the GPU path (`filters.grain@2`).
 *
 * Three properties, each one a way the effect has to be wrong before it is
 * merely ugly:
 *
 * 1. **It varies the picture.** A grain that ran and changed nothing is
 *    indistinguishable from one that never ran, so the strength cases compare
 *    against the ungrained render rather than against a golden buffer.
 * 2. **It stays inside its own alpha.** The layer arrives premultiplied, so
 *    `rgb <= a` holds on every pixel and noise added to the premultiplied value
 *    would push a channel past it — invisible on an opaque layer, a bright
 *    fringe on a translucent one. That is why the module blends grain into the
 *    straight colour and premultiplies again, and why the case that would have
 *    caught it is the half-transparent one.
 * 3. **It is reproducible.** Same seed, same bytes. A render handed back from a
 *    cache has to be the render that would have been computed.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine.
 */
import { describe, expect, it } from "vitest";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
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
  it.each([
    { size: 1, roughness: 0.5, softness: 0.25, colorAmount: 0, seed: 7, alpha: 255 },
    { size: 3.5, roughness: 0, softness: 0, colorAmount: 0, seed: 2203, alpha: 255 },
    { size: 8, roughness: 1, softness: 1, colorAmount: 1, seed: -3, alpha: 255 },
    { size: 16, roughness: 0.4, softness: 0.6, colorAmount: 0.3, seed: 1234567, alpha: 255 },
    { size: 16, roughness: 0, softness: 0, colorAmount: 0, seed: 7, alpha: 255 },
    { size: 16, roughness: 1, softness: 1, colorAmount: 1, seed: 91, alpha: 128 },
    { size: 3.5, roughness: 0.7, softness: 0.4, colorAmount: 1, seed: 91, alpha: 128 }
  ])("matches CPU grain with size $size, softness $softness and alpha $alpha", async ({ alpha, ...params }) => {
    const source = uniform(128, 96, 64, alpha);
    const effect = grain({ amount: 0.7, ...params });
    const gpu = await renderFrame([layerWith(source, [effect])], true);
    const cpu = { width: SIZE, height: SIZE, data: new Uint8ClampedArray(source.rgba) };
    applyCpuLegacyEffects(cpu, [effect]);
    let maximum = 0;
    let total = 0;
    for (let i = 0; i < gpu.length; i++) {
      const difference = Math.abs(gpu[i]! - cpu.data[i]!);
      maximum = Math.max(maximum, difference);
      total += difference;
    }
    expect(maximum).toBeLessThanOrEqual(1);
    expect(total / gpu.length).toBeLessThan(0.02);
  });

  it("makes softness smoother and roughness finer without changing the seed", async () => {
    const source = uniform(128, 128, 128);
    const render = (params: Partial<ClipGrainEffect>) => renderFrame([
      layerWith(source, [grain({ amount: 0.6, size: 8, seed: 7, ...params })])
    ]);
    const difference = (pixels: Uint8Array) => {
      let sum = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE - 1; x++) {
          const i = (y * SIZE + x) * 4;
          sum += Math.abs(pixels[i]! - pixels[i + 4]!);
        }
      }
      return sum;
    };
    expect(difference(await render({ softness: 1 }))).toBeLessThan(difference(await render({ softness: 0 })));
    expect(difference(await render({ roughness: 1 }))).toBeGreaterThan(difference(await render({ roughness: 0 })));
  });

  it("concentrates grain in midtones and keeps pure white clean", async () => {
    const render = (value: number) => renderFrame([
      layerWith(uniform(value, value, value), [grain({ amount: 0.5, seed: 7 })])
    ]);
    const shadows = channelSpread(await render(32));
    const midtones = channelSpread(await render(128));
    const highlights = channelSpread(await render(240));
    expect(midtones).toBeGreaterThan(shadows * 2);
    expect(midtones).toBeGreaterThan(highlights * 2);
    expect(channelSpread(await render(255))).toBe(0);
  });

  it("keeps the default amount subtle but visible on mid-grey", async () => {
    const pixels = await renderFrame([
      layerWith(uniform(128, 128, 128), [grain({ amount: 0.25, seed: 7 })])
    ]);
    expect(channelSpread(pixels)).toBeGreaterThan(3);
    expect(channelSpread(pixels)).toBeLessThan(8);
  });

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

    // Amount 0 adds nothing — the identity, not "a little grain".
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
    // source at a low amount. The readback un-premultiplies and saturates at
    // 255, so on a bright layer an overflowing channel comes back clamped and
    // indistinguishable from a legal one. Dark and light leaves headroom the
    // bug has to show up in: at amount 0.2 the straight value can move by at
    // most 0.2 * 0.15 * 4.02 (the noise bound) ~= 0.12, so straight 32 stays
    // at or under 32 + 31. Noise added to the *premultiplied* value at alpha
    // 0.5 doubles on the way back and would reach about 93.
    const grained = await renderFrame(
      [layerWith(uniform(32, 32, 32, 128), [grain({ amount: 0.2, seed: 11 })])],
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

  it("grows soft clumps as `size` grows, not square blocks", async () => {
    // Neighbouring pixels share a clump at size 8, so they differ far less than
    // independent per-pixel grain does. Inside a clump the value still varies,
    // because the lattice is interpolated rather than quantised into blocks.
    const source = uniform(128, 128, 128);
    const coarse = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, size: 8, seed: 5 })])
    ]);
    const fine = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, size: 1, seed: 5 })])
    ]);

    const neighbourDelta = (rgba: Uint8Array) => {
      let sum = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE - 1; x++) {
          const i = (y * SIZE + x) * 4;
          sum += Math.abs(rgba[i]! - rgba[i + 4]!);
        }
      }
      return sum / (SIZE * (SIZE - 1));
    };
    expect(neighbourDelta(coarse)).toBeLessThan(neighbourDelta(fine) * 0.4);
    let constantRuns = 0;
    for (let y = 0; y < SIZE; y++) {
      const row = y * SIZE * 4;
      if (coarse[row] === coarse[row + 7 * 4]) constantRuns++;
    }
    expect(constantRuns).toBeLessThan(SIZE / 2);
  });

  it("keeps the channels together at colour 0 and splits them at 1", async () => {
    const source = uniform(128, 128, 128);
    const mono = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, colorAmount: 0, seed: 9 })])
    ]);
    const colour = await renderFrame([
      layerWith(source, [grain({ amount: 0.6, colorAmount: 1, seed: 9 })])
    ]);

    // Monochrome grain is one noise value for the pixel, so r, g and b move together.
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
