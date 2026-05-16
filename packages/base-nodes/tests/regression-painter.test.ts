/**
 * Smoke + regression tests for `PainterNode` (plan §9.E9, PR 17).
 *
 * Verifies mask_data passthrough, blank-mask fallback when mask_data is
 * empty, and source image passthrough on the `image` output.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { PainterNode } from "../src/index.js";

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

function imageRef(buf: Buffer, w: number, h: number) {
  return {
    type: "image",
    data: buf.toString("base64"),
    uri: "",
    width: w,
    height: h
  };
}

describe("PainterNode", () => {
  it("emits a blank mask sized to the source image when mask_data is empty", async () => {
    const W = 24;
    const H = 18;
    const src = await solidPng(W, H, { r: 100, g: 100, b: 100 });
    const node = new PainterNode();
    node.assign({ image: imageRef(src, W, H), mask_data: "" });
    const result = await node.process();
    const mask = result.mask as Record<string, unknown>;
    expect(mask.width).toBe(W);
    expect(mask.height).toBe(H);
    // Blank mask = fully transparent.
    const bytes = Buffer.from(mask.data as string, "base64");
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(0); // first pixel alpha = 0
  });

  it("passes through painted mask_data as the mask output", async () => {
    const W = 12;
    const H = 8;
    const src = await solidPng(W, H, { r: 50, g: 50, b: 50 });
    const maskBuf = await solidPng(W, H, { r: 255, g: 255, b: 255 }, 200);
    const node = new PainterNode();
    node.assign({
      image: imageRef(src, W, H),
      mask_data: maskBuf.toString("base64")
    });
    const result = await node.process();
    const mask = result.mask as Record<string, unknown>;
    expect(mask.width).toBe(W);
    expect(mask.height).toBe(H);
    const bytes = Buffer.from(mask.data as string, "base64");
    const { data } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Painted alpha ≈ 200/255.
    expect(data[3]).toBeGreaterThan(150);
  });

  it("forwards the source image on the image output", async () => {
    const W = 6;
    const H = 6;
    const src = await solidPng(W, H, { r: 200, g: 80, b: 30 });
    const node = new PainterNode();
    node.assign({ image: imageRef(src, W, H), mask_data: "" });
    const result = await node.process();
    const image = result.image as Record<string, unknown>;
    expect(image.width).toBe(W);
    expect(image.height).toBe(H);
    expect(typeof image.data).toBe("string");
    expect((image.data as string).length).toBeGreaterThan(0);
  });
});
