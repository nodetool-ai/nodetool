/**
 * Smoke + regression tests for `CompositorGPUNode` — the WebGPU-backed
 * compositor. Mirrors the `CompositorNode` suite for the scenarios that
 * survive the GPU path (input collection, ordering, blend modes, mismatched
 * dimensions, PNG output).
 *
 * Requires a real WebGPU device (the optional `webgpu`/Dawn package with a
 * working adapter). The whole suite skips when none is available, so CI hosts
 * without a GPU stay green while GPU-capable hosts get real coverage.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { CompositorGPUNode } from "../src/index.js";

async function gpuAvailable(): Promise<boolean> {
  try {
    const spec = "webgpu";
    const dawn = (await import(spec)) as {
      create?: (flags: string[]) => {
        requestAdapter: () => Promise<unknown>;
      };
    };
    const gpu = dawn.create?.([]);
    const adapter = await gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

async function solidPng(
  w: number,
  h: number,
  rgb: { r: number; g: number; b: number },
  alpha: number = 255
): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { ...rgb, alpha: alpha / 255 }
    }
  })
    .png()
    .toBuffer();
}

function asImageRef(buf: Buffer, w: number, h: number) {
  return {
    type: "image",
    data: buf.toString("base64"),
    uri: "",
    width: w,
    height: h
  };
}

const hasGpu = await gpuAvailable();

describe.skipIf(!hasGpu)("CompositorGPUNode", () => {
  it("produces an empty image when no inputs are connected", async () => {
    const node = new CompositorGPUNode();
    node.assign({ layers: [] });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out.data).toBe("");
  });

  it("an opaque top layer fully covers the base", async () => {
    const W = 8;
    const H = 8;
    const red = await solidPng(W, H, { r: 255, g: 0, b: 0 });
    const blue = await solidPng(W, H, { r: 0, g: 0, b: 255 });
    const node = new CompositorGPUNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "normal", visible: true },
        { opacity: 1, blend_mode: "normal", visible: true }
      ],
      image_0: asImageRef(red, W, H),
      image_1: asImageRef(blue, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
    expect(out.mimeType).toBe("image/png");
    const { data } = await sharp(Buffer.from(out.data as string, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const off = (Math.floor(H / 2) * W + Math.floor(W / 2)) * 4;
    expect(data[off]).toBeLessThan(5); // no red
    expect(data[off + 2]).toBeGreaterThan(250); // blue on top
  });

  it("supports 'multiply' blend mode", async () => {
    const W = 4;
    const H = 4;
    const white = await solidPng(W, H, { r: 255, g: 255, b: 255 });
    const red = await solidPng(W, H, { r: 255, g: 0, b: 0 });
    const node = new CompositorGPUNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "normal", visible: true },
        { opacity: 1, blend_mode: "multiply", visible: true }
      ],
      image_0: asImageRef(white, W, H),
      image_1: asImageRef(red, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    const { data } = await sharp(Buffer.from(out.data as string, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const off = (Math.floor(H / 2) * W + Math.floor(W / 2)) * 4;
    expect(data[off]).toBeGreaterThan(250); // white * red = red
    expect(data[off + 1]).toBeLessThan(5);
    expect(data[off + 2]).toBeLessThan(5);
  });

  it("orders layers by numeric suffix and crops oversized overlays", async () => {
    const base = await solidPng(8, 8, { r: 255, g: 0, b: 0 });
    const overlay = await solidPng(4, 4, { r: 0, g: 0, b: 255 });
    const node = new CompositorGPUNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "normal", visible: true },
        { opacity: 1, blend_mode: "normal", visible: true }
      ],
      image_2: asImageRef(base, 8, 8),
      image_10: asImageRef(overlay, 4, 4)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    const { data } = await sharp(Buffer.from(out.data as string, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Top-left quadrant (covered by the 4×4 blue overlay) is blue.
    const tl = (1 * 8 + 1) * 4;
    expect(data[tl + 2]).toBeGreaterThan(200);
    // Bottom-right quadrant (outside the overlay) keeps the red base.
    const br = (6 * 8 + 6) * 4;
    expect(data[br]).toBeGreaterThan(200);
    expect(data[br + 2]).toBeLessThan(50);
  });
});
