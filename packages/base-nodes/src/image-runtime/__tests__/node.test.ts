import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { nodeImageRuntime } from "../node.js";
import type { ImageBytes } from "../index.js";

/**
 * Smoke coverage for the sharp-backed runtime. One test per op — we want to
 * know the wiring works end-to-end and that the contract (fresh bytes,
 * resolved width/height) is upheld. Functional correctness of sharp itself
 * is sharp's problem.
 */

const SIZE = 3;
let solidRed: ImageBytes;

beforeAll(async () => {
  // 3x3 solid red PNG, generated inline so tests don't depend on fixtures.
  const buf = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
    .png()
    .toBuffer();
  solidRed = {
    data: new Uint8Array(buf),
    width: SIZE,
    height: SIZE,
    mimeType: "image/png"
  };
});

describe("nodeImageRuntime", () => {
  it("resize: 3x3 → 6x6 produces fresh bytes with resolved dims", async () => {
    const out = await nodeImageRuntime.resize(solidRed, {
      width: 6,
      height: 6
    });
    expect(out.width).toBe(6);
    expect(out.height).toBe(6);
    expect(out.data.byteLength).toBeGreaterThan(0);
    expect(out.mimeType).toBe("image/png");
  });

  it("crop: 3x3 → 1x1 at origin", async () => {
    const out = await nodeImageRuntime.crop(solidRed, {
      x: 0,
      y: 0,
      width: 1,
      height: 1
    });
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(out.data.byteLength).toBeGreaterThan(0);
  });

  it("rotate: 90deg swaps width/height", async () => {
    // Use a non-square source so a 90deg rotation is observable.
    const buf = await sharp({
      create: {
        width: 4,
        height: 2,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    })
      .png()
      .toBuffer();
    const src: ImageBytes = {
      data: new Uint8Array(buf),
      width: 4,
      height: 2,
      mimeType: "image/png"
    };
    const out = await nodeImageRuntime.rotate(src, { angle: 90 });
    expect(out.width).toBe(2);
    expect(out.height).toBe(4);
    expect(out.data.byteLength).toBeGreaterThan(0);
  });

  it("flip: horizontal=true preserves dimensions and produces output", async () => {
    const out = await nodeImageRuntime.flip(solidRed, { horizontal: true });
    expect(out.width).toBe(SIZE);
    expect(out.height).toBe(SIZE);
    expect(out.data.byteLength).toBeGreaterThan(0);
  });

  it("blur: radius=5 preserves dimensions and produces output", async () => {
    const out = await nodeImageRuntime.blur(solidRed, { radius: 5 });
    expect(out.width).toBe(SIZE);
    expect(out.height).toBe(SIZE);
    expect(out.data.byteLength).toBeGreaterThan(0);
  });
});
