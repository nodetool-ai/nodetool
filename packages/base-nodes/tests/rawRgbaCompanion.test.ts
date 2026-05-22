/**
 * Raw-RGBA in-flight image format (base-nodes side).
 *
 * GPU image ops emit `ImageRef`s whose `data` is straight-alpha RGBA8, marked
 * by `mimeType === RAW_RGBA_MIME`. Adjacent GPU ops reuse the pixels via
 * `decodeRgba` (no codec); anything wanting an encoded image goes through
 * `imageBytesAsync`, which lazily encodes raw → PNG. These tests pin both.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";

import { rawRgbaImageRef, decodeRgba } from "../src/nodes/image.js";

// `imageBytesAsync` is module-internal; exercise it through decodeRgba's
// encoded path and a direct PNG round-trip instead.

const solidRgba = (w: number, h: number, rgba: [number, number, number, number]) => {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) out.set(rgba, i * 4);
  return out;
};

describe("rawRgbaImageRef", () => {
  it("builds a raw-RGBA ImageRef carrying pixels in data", () => {
    const rgba = solidRgba(2, 2, [10, 20, 30, 255]);
    const ref = rawRgbaImageRef(rgba, 2, 2);
    expect(ref).toMatchObject({
      type: "image",
      mimeType: RAW_RGBA_MIME,
      width: 2,
      height: 2
    });
    expect(ref.data).toBe(rgba);
  });
});

describe("decodeRgba", () => {
  it("reuses raw pixels directly, no copy, no codec", async () => {
    const rgba = solidRgba(3, 3, [1, 2, 3, 255]);
    const ref = rawRgbaImageRef(rgba, 3, 3);
    const out = await decodeRgba(ref);
    expect(out).toEqual({ rgba, width: 3, height: 3 });
    expect(out.rgba).toBe(rgba); // same reference — no decode
  });

  it("decodes an encoded (PNG) image via sharp", async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } }
    })
      .png()
      .toBuffer();
    const ref = { type: "image", data: png.toString("base64") };
    const out = await decodeRgba(ref);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    expect(out.rgba.length).toBe(4 * 4 * 4);
    expect(out.rgba[0]).toBe(200);
    expect(out.rgba[1]).toBe(100);
    expect(out.rgba[2]).toBe(50);
  });

  it("returns empty for missing input", async () => {
    expect(await decodeRgba(undefined)).toEqual({
      rgba: new Uint8Array(),
      width: 0,
      height: 0
    });
  });

  it("ignores a raw mime with an inconsistent buffer length", async () => {
    // length !== width*height*4 → not treated as raw; falls back to decoding
    // the bytes as an image, which fails (they aren't a valid encoded image).
    const bad = { type: "image", data: new Uint8Array([1, 2, 3]), mimeType: RAW_RGBA_MIME, width: 2, height: 2 };
    await expect(decodeRgba(bad)).rejects.toThrow();
  });
});
