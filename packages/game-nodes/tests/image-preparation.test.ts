import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { imagePreparationSettings, prepareGameImage } from "../src/image-preparation.js";

async function png(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("game asset image preparation", () => {
  it("aligns pose feet on one baseline and returns row-major atlas frames", async () => {
    const pixels = Buffer.alloc(8 * 4 * 4);
    pixels.set([255, 0, 0, 255], (1 * 8 + 0) * 4);
    pixels.set([255, 0, 0, 255], (2 * 8 + 0) * 4);
    pixels.set([0, 255, 0, 255], (0 * 8 + 6) * 4);
    pixels.set([0, 255, 0, 255], (1 * 8 + 6) * 4);
    const prepared = await prepareGameImage(await png(8, 4, pixels),
      imagePreparationSettings.parse({ sheet: { cols: 2, rows: 1, baseline: 3 } }));
    expect(prepared.frames).toEqual([
      { x: 0, y: 0, width: 4, height: 4 },
      { x: 4, y: 0, width: 4, height: 4 }
    ]);
    const out = await sharp(prepared.bytes).ensureAlpha().raw().toBuffer();
    expect(out.subarray((3 * 8 + 1) * 4, (3 * 8 + 1) * 4 + 4)).toEqual(Buffer.from([255, 0, 0, 255]));
    expect(out.subarray((3 * 8 + 5) * 4, (3 * 8 + 5) * 4 + 4)).toEqual(Buffer.from([0, 255, 0, 255]));
    expect(out[(1 * 8 + 1) * 4 + 3]).toBe(0);
    expect(prepared.baseline).toBe(3);
  });

  it("rejects a sheet grid that would discard pixels or clip a pose", async () => {
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 4, background: "white" } }).png().toBuffer();
    await expect(prepareGameImage(bytes, imagePreparationSettings.parse({ sheet: { cols: 3, rows: 1 } })))
      .rejects.toThrow("divisible");
    await expect(prepareGameImage(bytes, imagePreparationSettings.parse({ sheet: { cols: 1, rows: 1, baseline: 1 } })))
      .rejects.toThrow("clip");
  });

  it("bakes every edge mask while keeping interior texture unchanged", async () => {
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 4,
      background: { r: 100, g: 100, b: 100, alpha: 1 } } }).png().toBuffer();
    const prepared = await prepareGameImage(bytes, imagePreparationSettings.parse({ tileset: {
      tileWidth: 4, tileHeight: 4, edges: 1, highlight: 1.2, shadow: 0.7
    } }));
    expect([prepared.width, prepared.height]).toEqual([16, 16]);
    expect(prepared.tiles?.map((tile) => tile.mask)).toEqual(Array.from({ length: 16 }, (_, mask) => mask));
    const out = await sharp(prepared.bytes).raw().toBuffer();
    const red = (x: number, y: number): number => out[(y * 16 + x) * 4];
    expect(red(0, 0)).toBe(100);
    expect(red(4, 0)).toBe(120);
    expect(red(11, 1)).toBe(70);
    expect(red(13, 1)).toBe(100);
  });

  it("packs an opaque identity LUT in the renderer's blue-major layout", async () => {
    const prepared = await prepareGameImage(new Uint8Array(), imagePreparationSettings.parse({ lut: { size: 2 } }));
    expect([prepared.width, prepared.height, prepared.lutSize]).toEqual([4, 2, 2]);
    const out = await sharp(prepared.bytes).raw().toBuffer();
    expect([...out]).toEqual([
      0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 255, 255,
      0, 255, 0, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255, 255, 255
    ]);
  });

  it("creates deterministic grades and rejects incompatible transforms", async () => {
    const settings = imagePreparationSettings.parse({ lut: { size: 2, gain: [0.5, 1, 1], brightness: 0.1 } });
    const first = await prepareGameImage(new Uint8Array(), settings);
    const second = await prepareGameImage(new Uint8Array(), settings);
    expect(first.bytes).toEqual(second.bytes);
    const out = await sharp(first.bytes).raw().toBuffer();
    expect([...out.subarray(4, 8)]).toEqual([128, 26, 26, 255]);
    expect(imagePreparationSettings.safeParse({ sheet: { cols: 2, rows: 2 }, trimAlpha: true }).success).toBe(false);
    expect(imagePreparationSettings.safeParse({ lut: {}, tileset: {} }).success).toBe(false);
    expect(imagePreparationSettings.safeParse({ tileset: { tileWidth: 2, tileHeight: 2, edges: 2 } }).success).toBe(false);
  });
});
