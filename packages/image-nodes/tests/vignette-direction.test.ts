/**
 * Regression test pinning the Vignette node's midpoint direction.
 *
 * The `midpoint` prop is documented "Distance from center where vignette begins
 * (0=center, 1=edges)". The node maps it onto the shader's `radius`, and the
 * shader darkens where `dist > radius - softness`. A previous `radius: 1 -
 * midpoint` mapping inverted this: a low midpoint darkened the center and a
 * high midpoint darkened the edges — exactly backwards. These tests lock the
 * documented behaviour in place.
 *
 * Requires a WebGPU device (Dawn); the SwiftShader ICD shim supplies a CPU
 * adapter in CI.
 */
import "../../gpu/tests/setup/swiftshaderIcd.js";

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { LIB_IMAGE_COLOR_GRADING_NODES } from "@nodetool-ai/image-nodes";
import { RAW_RGBA_MIME } from "@nodetool-ai/protocol";

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

/** Create a uniform mid-gray image as a base64 image ref. */
async function makeGrayImage(
  w = 32,
  h = 32,
  gray = 128
): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: gray, g: gray, b: gray }
    }
  })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "" };
}

/** Instantiate the Vignette node, assign inputs, run it, return the output ref. */
async function runVignette(
  inputs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const Cls = LIB_IMAGE_COLOR_GRADING_NODES.find((n) =>
    (n as unknown as { nodeType: string }).nodeType?.endsWith(".Vignette")
  ) as unknown as {
    new (): {
      assign(p: Record<string, unknown>): void;
      process(ctx?: unknown): Promise<Record<string, unknown>>;
    };
  };
  if (!Cls) throw new Error("Vignette node not found");
  const node = new Cls();
  node.assign(inputs);
  const result = await node.process();
  return (result.output ?? result) as Record<string, unknown>;
}

/** Read the red channel (grayscale, so any channel works) at pixel (x, y). */
function pixel(
  rgba: Buffer,
  width: number,
  x: number,
  y: number
): number {
  return rgba[(y * width + x) * 4];
}

describe("Vignette midpoint direction", () => {
  const GRAY = 128;

  it("low midpoint + high amount darkens corners relative to center", async () => {
    const img = await makeGrayImage(32, 32, GRAY);
    const output = await runVignette({
      image: img,
      amount: 1,
      midpoint: 0.1,
      feather: 0.5
    });
    const { rgba, width, height } = await refToRgba(output);

    const center = pixel(rgba, width, width / 2, height / 2);
    const corner = pixel(rgba, width, 0, 0);

    // Documented semantics: midpoint near 0 begins the vignette at the center,
    // so corners must be darker than the center (and darker than the input).
    expect(corner).toBeLessThan(center);
    expect(corner).toBeLessThan(GRAY);
  });

  it("midpoint near 1 leaves the center (nearly) untouched", async () => {
    const img = await makeGrayImage(32, 32, GRAY);
    const output = await runVignette({
      image: img,
      amount: 1,
      midpoint: 0.98,
      feather: 0.5
    });
    const { rgba, width, height } = await refToRgba(output);

    const center = pixel(rgba, width, width / 2, height / 2);

    // With the onset pushed to the edges, the center pixel stays at the input
    // gray value (allow a small tolerance for 8-bit rounding).
    expect(Math.abs(center - GRAY)).toBeLessThanOrEqual(2);
  });
});
