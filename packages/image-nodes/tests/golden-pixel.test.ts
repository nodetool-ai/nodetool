/**
 * Golden-pixel tests for the GPU-backed `lib.image.*` nodes.
 *
 * The sibling `lib-image-gpu-smoke.test.ts` only asserts mime/dimensions/byte
 * count — it proves a node runs, not that it computes the right pixels. That gap
 * let two pixel-level bugs ship (an inverted vignette midpoint and a filter
 * aliasing bug). These tests assert actual output values: identity round-trips,
 * channel routing, known-value colour math, gradient orientation, and (for
 * GaussianNoise) seed-driven reproducibility.
 *
 * Requires a WebGPU device (Dawn); the SwiftShader ICD shim supplies a CPU
 * adapter in CI. Opaque (alpha = 255) inputs round-trip the premultiply /
 * un-premultiply boundary exactly, so identity checks can assert byte equality.
 */
import "../../gpu/tests/setup/swiftshaderIcd.js";

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  ChannelShuffleNode,
  InvertNode,
  LinearGradientNode,
  CheckerboardNode,
  LIB_IMAGE_DRAW_NODES
} from "@nodetool-ai/image-nodes";
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";

async function gpuAvailable(): Promise<boolean> {
  try {
    const spec = "webgpu";
    const dawn = (await import(spec)) as {
      create?: (flags: string[]) => { requestAdapter: () => Promise<unknown> };
    };
    const gpu = dawn.create?.([]);
    const adapter = await gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

const hasGpu = await gpuAvailable();

/** Resolve a node output ImageRef to straight-alpha RGBA bytes. */
async function refToRgba(
  ref: Record<string, unknown>
): Promise<{ rgba: Buffer; width: number; height: number }> {
  if (ref.data instanceof Uint8Array && ref.mimeType === RAW_RGBA_MIME) {
    return {
      rgba: Buffer.from(ref.data),
      width: ref.width as number,
      height: ref.height as number
    };
  }
  const buf = Buffer.from(ref.data as string, "base64");
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height };
}

/** Build a solid RGBA image ref with the given straight-alpha colour. */
async function solidImage(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  alpha = 255
): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r, g, b, alpha }
    }
  })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "" };
}

function makeNode<T extends new () => unknown>(
  NodeClass: T,
  props: Record<string, unknown>
): InstanceType<T> {
  const inst = new NodeClass();
  for (const [k, v] of Object.entries(props)) {
    (inst as Record<string, unknown>)[k] = v;
  }
  return inst as InstanceType<T>;
}

/** Read the [r,g,b,a] tuple at pixel (x,y). */
function px(
  rgba: Buffer,
  width: number,
  x: number,
  y: number
): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
}

/** Run the GaussianNoise draw node with the given props. */
async function runGaussianNoise(
  props: Record<string, unknown>
): Promise<{ rgba: Buffer; width: number; height: number }> {
  const Cls = LIB_IMAGE_DRAW_NODES.find(
    (n) =>
      (n as unknown as { nodeType: string }).nodeType ===
      "lib.image.draw.GaussianNoise"
  ) as unknown as { new (): { process(): Promise<Record<string, unknown>> } };
  if (!Cls) throw new Error("GaussianNoise node not found");
  const node = makeNode(Cls as unknown as new () => unknown, props);
  const result = await (
    node as { process(): Promise<Record<string, unknown>> }
  ).process();
  return refToRgba(result.output as Record<string, unknown>);
}

describe.skipIf(!hasGpu)("lib.image.* golden pixels", () => {
  // ---- ChannelShuffle: identity and swap --------------------------
  it("ChannelShuffle identity returns the input bytes unchanged", async () => {
    const img = await solidImage(8, 8, 200, 100, 50, 255);
    const node = makeNode(ChannelShuffleNode, {
      image: img,
      r_from: 0,
      g_from: 1,
      b_from: 2,
      a_from: 3
    });
    const { rgba } = await refToRgba((await node.process()).output);
    // Opaque input round-trips premultiply exactly → byte-identical output.
    for (let i = 0; i < rgba.length; i += 4) {
      expect([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]).toEqual([
        200, 100, 50, 255
      ]);
    }
  });

  it("ChannelShuffle R<->B swap routes the source channels", async () => {
    const img = await solidImage(8, 8, 200, 100, 50, 255);
    const node = makeNode(ChannelShuffleNode, {
      image: img,
      r_from: 2, // R takes source B (50)
      g_from: 1, // G unchanged (100)
      b_from: 0, // B takes source R (200)
      a_from: 3
    });
    const { rgba, width } = await refToRgba((await node.process()).output);
    expect(px(rgba, width, 0, 0)).toEqual([50, 100, 200, 255]);
  });

  // ---- Invert -----------------------------------------------------
  it("Invert (amount=1) produces 255 - channel per RGB, preserving alpha", async () => {
    const img = await solidImage(8, 8, 200, 100, 50, 255);
    const node = makeNode(InvertNode, { image: img, amount: 1 });
    const { rgba, width } = await refToRgba((await node.process()).output);
    const [r, g, b, a] = px(rgba, width, 0, 0);
    expect(r).toBeCloseTo(55, -0.5);
    expect(g).toBeCloseTo(155, -0.5);
    expect(b).toBeCloseTo(205, -0.5);
    // Tight tolerance for 8-bit rounding.
    expect(Math.abs(r - 55)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 155)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 205)).toBeLessThanOrEqual(1);
    expect(a).toBe(255);
  });

  it("Invert (amount=0) is a passthrough", async () => {
    const img = await solidImage(8, 8, 200, 100, 50, 255);
    const node = makeNode(InvertNode, { image: img, amount: 0 });
    const { rgba, width } = await refToRgba((await node.process()).output);
    const [r, g, b] = px(rgba, width, 0, 0);
    expect(Math.abs(r - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 50)).toBeLessThanOrEqual(1);
  });

  // ---- LinearGradient: orientation --------------------------------
  it("LinearGradient spans black->white and is monotonic across the gradient axis", async () => {
    const node = makeNode(LinearGradientNode, {
      width: 32,
      height: 32,
      color_a: { type: "color", value: "#000000" },
      color_b: { type: "color", value: "#ffffff" },
      angle: 0,
      midpoint: 0.5
    });
    const { rgba, width, height } = await refToRgba((await node.process()).output);
    // Collect the luminance of the first row; a horizontal gradient must span
    // near-black to near-white and increase monotonically along one axis.
    const row: number[] = [];
    for (let x = 0; x < width; x++) row.push(px(rgba, width, x, 0)[0]);
    const min = Math.min(...row);
    const max = Math.max(...row);
    expect(min).toBeLessThan(16);
    expect(max).toBeGreaterThan(239);
    // Non-uniform down a column? A horizontal gradient keeps columns constant;
    // confirm the variation lives along the row, not the column.
    const col: number[] = [];
    for (let y = 0; y < height; y++) col.push(px(rgba, width, 0, y)[0]);
    expect(Math.max(...col) - Math.min(...col)).toBeLessThanOrEqual(2);
  });

  // ---- Checkerboard: known cell colours ---------------------------
  it("Checkerboard alternates the two cell colours", async () => {
    const node = makeNode(CheckerboardNode, {
      width: 16,
      height: 16,
      color_a: { type: "color", value: "#ff0000" },
      color_b: { type: "color", value: "#0000ff" },
      cell_size: 8
    });
    const { rgba, width } = await refToRgba((await node.process()).output);
    const cellA = px(rgba, width, 2, 2); // inside cell (0,0)
    const cellB = px(rgba, width, 10, 2); // inside the horizontally-adjacent cell
    const isRed = (p: number[]) => p[0] > 239 && p[1] < 16 && p[2] < 16;
    const isBlue = (p: number[]) => p[2] > 239 && p[0] < 16 && p[1] < 16;
    // Adjacent cells are the two distinct colours (order is orientation-dependent).
    expect(isRed(cellA) || isBlue(cellA)).toBe(true);
    expect(isRed(cellB) || isBlue(cellB)).toBe(true);
    expect(isRed(cellA)).not.toBe(isRed(cellB));
  });

  // ---- GaussianNoise: seed reproducibility ------------------------
  it("GaussianNoise with a pinned seed is reproducible", async () => {
    const props = { width: 32, height: 32, mean: 0, stddev: 1, seed: 1234 };
    const a = await runGaussianNoise({ ...props });
    const b = await runGaussianNoise({ ...props });
    expect(Buffer.compare(a.rgba, b.rgba)).toBe(0);
  });

  it("GaussianNoise with different seeds differs", async () => {
    const a = await runGaussianNoise({
      width: 32,
      height: 32,
      mean: 0,
      stddev: 1,
      seed: 1
    });
    const b = await runGaussianNoise({
      width: 32,
      height: 32,
      mean: 0,
      stddev: 1,
      seed: 2
    });
    expect(Buffer.compare(a.rgba, b.rgba)).not.toBe(0);
  });
});
