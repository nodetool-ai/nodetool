import { describe, expect, it, vi } from "vitest";

// Wrap the sharp default export so we can count how many times a sharp
// pipeline is constructed. Each construction decodes the input it is given;
// a single decode/resize/encode pass should build exactly one pipeline.
const sharpCalls = { count: 0 };
vi.mock("sharp", async (importOriginal) => {
  const mod = await importOriginal<typeof import("sharp")>();
  const original = mod.default;
  const wrapped = ((...args: Parameters<typeof original>) => {
    sharpCalls.count += 1;
    return original(...args);
  }) as typeof original;
  Object.assign(wrapped, original);
  return { ...mod, default: wrapped };
});

import sharp from "sharp";
import { generateImageThumb } from "../src/lib/thumbnail.js";

async function makeLargeImage(): Promise<Buffer> {
  // 4000x3000 photo-like image with non-uniform content (so trim() keeps it).
  const width = 4000;
  const height = 3000;
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = (i * 31) % 256;
  }
  return sharp(raw, { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

describe("generateImageThumb", () => {
  it("decodes/encodes the source exactly once and fits within the thumb box", async () => {
    const source = await makeLargeImage();
    sharpCalls.count = 0;

    const thumb = await generateImageThumb(source);

    // One pipeline construction = one decode + one encode of the source.
    expect(sharpCalls.count).toBe(1);

    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeLessThanOrEqual(512);
    expect(meta.height).toBeLessThanOrEqual(512);
    // Aspect ratio (4:3) preserved within the 512px box.
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(384);
  });
});
