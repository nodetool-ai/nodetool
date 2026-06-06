/**
 * Smoke + regression tests for `CompositorNode`.
 *
 * Verifies dynamic `image_N` input collection, positional alignment
 * with `layers[i]`, visibility / zero-opacity filtering, blend modes,
 * mismatched dimensions, corrupt-input handling, and that the output
 * is a non-empty raw-RGBA image of the base layer's dimensions.
 *
 * `CompositorNode` composites on the GPU (WebGPU/Dawn) with no CPU fallback,
 * so the suite requires a real device and skips when none is available — CI
 * hosts without a GPU stay green; GPU-capable hosts get real coverage.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";
import { CompositorNode } from "@nodetool-ai/image-nodes";

// CompositorNode emits raw RGBA (mimeType=RAW_RGBA_MIME) as its in-flight
// format — no eager PNG encode. Tests read `out.data` as a Uint8Array
// directly, no base64/sharp roundtrip.
function rgbaBytes(out: Record<string, unknown>): Uint8Array {
  const data = out.data;
  if (!(data instanceof Uint8Array)) {
    throw new Error(
      `expected raw-RGBA Uint8Array, got ${typeof data} (mimeType=${String(out.mimeType)})`
    );
  }
  return data;
}

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

const hasGpu = await gpuAvailable();

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

describe.skipIf(!hasGpu)("CompositorNode", () => {
  it("produces an empty image when no inputs are connected", async () => {
    const node = new CompositorNode();
    node.assign({ layers: [] });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out).toBeDefined();
    expect((out.data as Uint8Array).length).toBe(0);
  });

  it("emits the base layer when only one image input is wired", async () => {
    const W = 16;
    const H = 12;
    const buf = await solidPng(W, H, { r: 200, g: 100, b: 50 });
    const node = new CompositorNode();
    node.assign({
      layers: [{ opacity: 1, blend_mode: "over", visible: true }],
      image_0: asImageRef(buf, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
    expect(out.mimeType).toBe(RAW_RGBA_MIME);
    expect(rgbaBytes(out).length).toBe(W * H * 4);
  });

  it("composites two layers using 'over' blend with positional layer state", async () => {
    const W = 8;
    const H = 8;
    const red = await solidPng(W, H, { r: 255, g: 0, b: 0 });
    const blue = await solidPng(W, H, { r: 0, g: 0, b: 255 }, 128); // semi-transparent
    const node = new CompositorNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "over", visible: true },
        { opacity: 0.5, blend_mode: "over", visible: true }
      ],
      image_0: asImageRef(red, W, H),
      image_1: asImageRef(blue, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);

    // The composite should mix the red base with the half-opacity blue
    // layer — middle pixel should be neither pure red nor pure blue.
    const data = rgbaBytes(out);
    // Sample centre pixel (RGBA stride = 4 over width W).
    const cx = Math.floor(W / 2);
    const cy = Math.floor(H / 2);
    const off = (cy * W + cx) * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    expect(r).toBeGreaterThan(0); // red persisted
    expect(b).toBeGreaterThan(0); // blue mixed in
    expect(g).toBeLessThan(50); // no green in either input
  });

  it("skips invisible and zero-opacity layers", async () => {
    const W = 6;
    const H = 6;
    const baseBuf = await solidPng(W, H, { r: 10, g: 200, b: 30 });
    const skipBuf = await solidPng(W, H, { r: 255, g: 0, b: 0 });
    const node = new CompositorNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "over", visible: true },
        { opacity: 0, blend_mode: "over", visible: true }, // zero opacity
        { opacity: 1, blend_mode: "over", visible: false } // hidden
      ],
      image_0: asImageRef(baseBuf, W, H),
      image_1: asImageRef(skipBuf, W, H),
      image_2: asImageRef(skipBuf, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    const data = rgbaBytes(out);
    // Centre pixel should remain (approximately) the base green tint.
    const off = (Math.floor(H / 2) * W + Math.floor(W / 2)) * 4;
    expect(data[off]).toBeLessThan(60); // no red bleed
    expect(data[off + 1]).toBeGreaterThan(150); // green retained
  });

  it("orders layers by numeric suffix, not insertion order", async () => {
    const W = 4;
    const H = 4;
    const top = await solidPng(W, H, { r: 0, g: 0, b: 255 });
    const base = await solidPng(W, H, { r: 255, g: 0, b: 0 });
    const node = new CompositorNode();
    // Assign image_10 first, image_2 second — image_2 should be the base.
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "over", visible: true },
        { opacity: 1, blend_mode: "over", visible: true }
      ],
      image_10: asImageRef(top, W, H),
      image_2: asImageRef(base, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    const data = rgbaBytes(out);
    // With image_10 fully opaque blue on top, expect blue dominance.
    expect(data[2]).toBeGreaterThan(200);
    expect(data[0]).toBeLessThan(50);
  });

  it("outputs raw RGBA in-flight format", async () => {
    const W = 4;
    const H = 4;
    const buf = await solidPng(W, H, { r: 128, g: 64, b: 32 });
    const node = new CompositorNode();
    node.assign({
      layers: [{ opacity: 1, blend_mode: "over", visible: true }],
      image_0: asImageRef(buf, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out.mimeType).toBe(RAW_RGBA_MIME);
    expect(out.data).toBeInstanceOf(Uint8Array);
    expect(rgbaBytes(out).length).toBe(W * H * 4);
  });

  it("handles layers with mismatched dimensions", async () => {
    const base = await solidPng(8, 8, { r: 255, g: 0, b: 0 });
    const overlay = await solidPng(4, 4, { r: 0, g: 0, b: 255 });
    const node = new CompositorNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "over", visible: true },
        { opacity: 1, blend_mode: "over", visible: true }
      ],
      image_0: asImageRef(base, 8, 8),
      image_1: asImageRef(overlay, 4, 4)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(rgbaBytes(out).length).toBe(8 * 8 * 4);
  });

  it("falls through on corrupt image input and keeps prior canvas", async () => {
    const W = 4;
    const H = 4;
    const base = await solidPng(W, H, { r: 0, g: 200, b: 0 });
    const node = new CompositorNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "over", visible: true },
        { opacity: 1, blend_mode: "over", visible: true }
      ],
      image_0: asImageRef(base, W, H),
      image_1: { type: "image", data: "not-valid-base64!!!", uri: "", width: W, height: H }
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    // Should still return the base layer as raw RGBA despite the corrupt overlay.
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
    expect(rgbaBytes(out).length).toBe(W * H * 4);
  });

  it("supports 'multiply' blend mode", async () => {
    const W = 4;
    const H = 4;
    const white = await solidPng(W, H, { r: 255, g: 255, b: 255 });
    const red = await solidPng(W, H, { r: 255, g: 0, b: 0 });
    const node = new CompositorNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "over", visible: true },
        { opacity: 1, blend_mode: "multiply", visible: true }
      ],
      image_0: asImageRef(white, W, H),
      image_1: asImageRef(red, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    const data = rgbaBytes(out);
    const off = (Math.floor(H / 2) * W + Math.floor(W / 2)) * 4;
    // White * Red = Red
    expect(data[off]).toBeGreaterThan(250); // R
    expect(data[off + 1]).toBeLessThan(5); // G
    expect(data[off + 2]).toBeLessThan(5); // B
  });

  it("supports 'add' blend mode", async () => {
    const W = 4;
    const H = 4;
    const halfRed = await solidPng(W, H, { r: 128, g: 0, b: 0 });
    const halfGreen = await solidPng(W, H, { r: 0, g: 128, b: 0 });
    const node = new CompositorNode();
    node.assign({
      layers: [
        { opacity: 1, blend_mode: "over", visible: true },
        { opacity: 1, blend_mode: "add", visible: true }
      ],
      image_0: asImageRef(halfRed, W, H),
      image_1: asImageRef(halfGreen, W, H)
    });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    const data = rgbaBytes(out);
    const off = (Math.floor(H / 2) * W + Math.floor(W / 2)) * 4;
    expect(data[off]).toBeGreaterThan(120); // R preserved
    expect(data[off + 1]).toBeGreaterThan(120); // G added
    expect(data[off + 2]).toBeLessThan(10); // B stays 0
  });
});
