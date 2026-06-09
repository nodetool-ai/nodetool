/**
 * Mutation-hardening tests for the raw-RGBA → PNG image codec.
 *
 * Pins that raw straight-alpha RGBA8 pixels encode to a real PNG, and that
 * `encodeRawImageRef` converts only raw refs (rewriting data + mimeType) while
 * passing everything else through untouched. See MUTATION_TESTING.md.
 */
import { describe, it, expect } from "vitest";
import { encodeRawRgbaToPng, encodeRawImageRef } from "../src/image-codec.js";
import { RAW_RGBA_MIME, type ImageRef } from "@nodetool-ai/protocol";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function rawPixel(): Uint8Array {
  // one opaque red pixel, straight-alpha RGBA8
  return new Uint8Array([255, 0, 0, 255]);
}

describe("encodeRawRgbaToPng", () => {
  it("produces PNG-signed bytes from raw RGBA", async () => {
    const png = await encodeRawRgbaToPng(rawPixel(), 1, 1);
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it("encodes the given dimensions (2x1 differs from 1x1)", async () => {
    const onePx = await encodeRawRgbaToPng(rawPixel(), 1, 1);
    const twoPx = await encodeRawRgbaToPng(
      new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
      2,
      1
    );
    // Both valid PNGs, but different pixel data ⇒ different bytes.
    expect(Buffer.from(twoPx).equals(Buffer.from(onePx))).toBe(false);
  });
});

describe("encodeRawImageRef", () => {
  it("converts a raw-RGBA ref to a PNG ref", async () => {
    const ref: ImageRef = {
      type: "image",
      data: rawPixel(),
      width: 1,
      height: 1,
      mimeType: RAW_RGBA_MIME
    } as ImageRef;
    const out = (await encodeRawImageRef(ref)) as ImageRef;
    expect(out.mimeType).toBe("image/png");
    expect(Array.from((out.data as Uint8Array).slice(0, 8))).toEqual(
      PNG_SIGNATURE
    );
  });

  it("returns a non-raw ref unchanged (same reference)", async () => {
    const ref = { type: "image", uri: "asset://x.png" };
    expect(await encodeRawImageRef(ref)).toBe(ref);
  });

  it("returns a non-image value unchanged", async () => {
    expect(await encodeRawImageRef("not-a-ref")).toBe("not-a-ref");
    expect(await encodeRawImageRef(null)).toBe(null);
  });
});
