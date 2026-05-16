/**
 * Smoke + regression tests for `CompositorNode` (plan §9.E5, PR 16).
 *
 * Verifies dynamic `image_N` input collection, positional alignment
 * with `layers[i]`, visibility / zero-opacity filtering, and that the
 * output is a non-empty PNG image of the base layer's dimensions.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { CompositorNode } from "../src/index.js";

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

describe("CompositorNode", () => {
  it("produces an empty image when no inputs are connected", async () => {
    const node = new CompositorNode();
    node.assign({ layers: [] });
    const result = await node.process();
    const out = result.output as Record<string, unknown>;
    expect(out).toBeDefined();
    expect(out.data).toBe(""); // empty Uint8Array → empty base64
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
    expect(typeof out.data).toBe("string");
    expect((out.data as string).length).toBeGreaterThan(0);
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
    const bytes = Buffer.from(out.data as string, "base64");
    const { data } = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
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
    const bytes = Buffer.from(out.data as string, "base64");
    const { data } = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
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
    const bytes = Buffer.from(out.data as string, "base64");
    const { data } = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // With image_10 fully opaque blue on top, expect blue dominance.
    expect(data[2]).toBeGreaterThan(200);
    expect(data[0]).toBeLessThan(50);
  });
});
