import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import { gameAssetBinding3D } from "@nodetool-ai/protocol";
import { prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";
import { decodeGameImage3D, GameImageCache3D } from "../src/renderer3d/assets/image-cache.js";
import type { PreparedGameImage3D } from "../src/renderer3d/assets/image-contract.js";

declare global {
  interface Window { exifImageProbe: (bytes: number[]) => Promise<{ width: number; height: number; textureBytes: number }>; }
}

function png(): Uint8Array {
  const canvas = createCanvas(2, 3);
  canvas.getContext("2d").fillRect(0, 0, 2, 3);
  return new Uint8Array(canvas.toBuffer("image/png"));
}
function exifJpeg(orientation: number, littleEndian: boolean, afterSof = false, mutate?: (view: DataView) => void): Uint8Array {
  const jpeg = new Uint8Array(createCanvas(4, 2).toBuffer("image/jpeg"));
  const exif = new Uint8Array(36);
  exif.set([69, 120, 105, 102, 0, 0]);
  const view = new DataView(exif.buffer, 6);
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, littleEndian); view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian); view.setUint16(10, 0x112, littleEndian);
  view.setUint16(12, 3, littleEndian); view.setUint32(14, 1, littleEndian);
  view.setUint16(18, orientation, littleEndian); mutate?.(view);
  let offset = 2;
  if (afterSof) {
    const source = new DataView(jpeg.buffer);
    while (offset + 4 <= jpeg.length) {
      const marker = jpeg[offset + 1]; const length = source.getUint16(offset + 2);
      offset += length + 2;
      if (marker !== undefined && [192, 193, 194].includes(marker)) { break; }
    }
  }
  const segment = new Uint8Array(exif.length + 4);
  segment.set([255, 225]); new DataView(segment.buffer).setUint16(2, exif.length + 2); segment.set(exif, 4);
  const bytes = new Uint8Array(jpeg.length + segment.length);
  bytes.set(jpeg.subarray(0, offset)); bytes.set(segment, offset); bytes.set(jpeg.subarray(offset), offset + segment.length);
  return bytes;
}
function jpegWithMarkerFill(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 2;
  while (cursor + 4 <= bytes.length) {
    const marker = bytes[cursor + 1]; cursor += view.getUint16(cursor + 2) + 2;
    if (marker !== undefined && [192, 193, 194].includes(marker)) {
      const filled = new Uint8Array(bytes.length + 1);
      filled.set(bytes.subarray(0, cursor)); filled[cursor] = 255; filled.set(bytes.subarray(cursor), cursor + 1);
      return filled;
    }
  }
  throw new Error("Fixture JPEG SOF missing");
}
async function prepared(): Promise<PreparedGameImage3D> {
  const result = await prepareGameImage3D(png(), { assetId: "owned-image" });
  if (!result.ok) { throw new Error(result.diagnostics[0]?.message); }
  return result.image;
}
async function decode(image: PreparedGameImage3D): Promise<Texture> {
  return new Texture(await loadImage(image.bytes));
}

describe("prepared primitive image assets", () => {
  it("derives identity and accepts the image binding without changing the font union index", async () => {
    const image = await prepared();
    expect(gameAssetBinding3D.parse(image.binding)).toEqual(image.binding);
    expect(image.binding).toMatchObject({ width: 2, height: 3, format: "png", preparationVersion: "1" });
    expect(image.binding.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(gameAssetBinding3D.options[3].parse({ mediaKind: "font", assetId: "font", digest: "digest", fontFormat: "ttf" }).mediaKind).toBe("font");
  });
  it.each([new Uint8Array(), new Uint8Array(16 * 1024 * 1024 + 1), png().subarray(0, 33)])("rejects empty, over-budget or truncated images", async (bytes) => {
    expect((await prepareGameImage3D(bytes, { assetId: "image" })).ok).toBe(false);
  });
  it.each([0, 4097, 0xffffffff])("rejects invalid decoded width %s before decoder allocation", async (width) => {
    const bytes = png(); new DataView(bytes.buffer).setUint32(16, width);
    expect((await prepareGameImage3D(bytes, { assetId: "image" })).ok).toBe(false);
  });
  it("accepts the maximum dimension and rejects a genuine image beyond it", async () => {
    for (const width of [4096, 4097]) {
      const bytes = new Uint8Array(createCanvas(width, 1).toBuffer("image/png"));
      const result = await prepareGameImage3D(bytes, { assetId: "image" });
      expect(result.ok).toBe(width === 4096);
      if (!result.ok) { expect(result.diagnostics[0]?.message).toContain("allocation bounds"); }
    }
  });
  it("enforces content digest and cancellation", async () => {
    expect((await prepareGameImage3D(png(), { assetId: "image", expectedDigest: "different" })).ok).toBe(false);
    await expect(prepareGameImage3D(png(), { assetId: "image", signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
  });
  it.each(["jpeg", "webp"] as const)("prepares and decodes actual %s image bytes", async (format) => {
    const canvas = createCanvas(2, 3);
    const bytes = new Uint8Array(format === "jpeg" ? canvas.toBuffer("image/jpeg") : canvas.toBuffer("image/webp"));
    const result = await prepareGameImage3D(bytes, { assetId: "image" });
    expect(result.ok).toBe(true);
    if (!result.ok) { return; }
    expect(result.image.binding).toMatchObject({ format, width: 2, height: 3 });
    const cache = new GameImageCache3D({ resolveImage: async () => result.image, decodeImage: decode }, new AbortController().signal);
    expect((await cache.get("slot")).image.width).toBe(2); cache.dispose();
  });
  it("loads EXIF orientations 1, 6 and 8 through the actual browser bitmap cache", async () => {
    const bundle = await build({ stdin: { contents: `
      import {prepareGameImage3D} from "./src/renderer3d/assets/image-preparation.ts";
      import {GameImageCache3D} from "./src/renderer3d/assets/image-cache.ts";
      window.exifImageProbe = async (bytes) => {
        const prepared = await prepareGameImage3D(new Uint8Array(bytes), {assetId: "image"});
        if (!prepared.ok) { throw new Error(JSON.stringify(prepared.diagnostics)); }
        const cache = new GameImageCache3D({resolveImage: async () => prepared.image}, new AbortController().signal);
        try { const texture = await cache.get("image"); return {width: texture.image.width, height: texture.image.height, textureBytes: cache.textureBytes}; }
        finally { cache.dispose(); }
      };`, resolveDir: resolve(".") }, bundle: true, platform: "browser", format: "iife", write: false, conditions: ["nodetool-dev"] });
    const script = bundle.outputFiles[0]; if (!script) { throw new Error("Image probe bundle missing"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<html></html>" }) : route.abort());
      await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
      for (const orientation of [1, 6, 8]) {
        for (const littleEndian of [false, true]) {
          const bytes = jpegWithMarkerFill(exifJpeg(orientation, littleEndian, littleEndian));
          expect(await page.evaluate((input) => window.exifImageProbe(input), [...bytes]))
            .toEqual({ width: orientation >= 5 ? 2 : 4, height: orientation >= 5 ? 4 : 2, textureBytes: 32 });
        }
      }
    } finally { await browser.close(); }
  });
  it("accepts legal repeated marker fill bytes after JPEG SOF", async () => {
    const bytes = jpegWithMarkerFill(new Uint8Array(createCanvas(4, 2).toBuffer("image/jpeg")));
    const decoded = await loadImage(bytes);
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 4, height: 2 });
    const result = await prepareGameImage3D(bytes, { assetId: "image" });
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.image.binding).toMatchObject({ width: 4, height: 2 }); }
  });
  it.each([false, true])("uses bounded EXIF orientation in %s-endian JPEG metadata", async (littleEndian) => {
    for (const afterSof of [false, true]) {
      for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const bytes = exifJpeg(orientation, littleEndian, afterSof);
        const result = await prepareGameImage3D(bytes, { assetId: "image" });
        expect(result.ok).toBe(true);
        if (!result.ok) { return; }
        expect(result.image.binding).toMatchObject({ width: orientation >= 5 ? 2 : 4, height: orientation >= 5 ? 4 : 2 });
        expect(result.image.bytes).toEqual(bytes);
      }
    }
  });
  it.each([
    (view: DataView) => view.setUint32(4, 0xffffffff, true),
    (view: DataView) => view.setUint16(8, 0xffff, true),
    (view: DataView) => view.setUint32(14, 2, true),
    (view: DataView) => view.setUint16(18, 9, true),
    (view: DataView) => view.setUint16(10, 0x999, true),
    (view: DataView) => view.setUint16(2, 0, true),
    (view: DataView) => view.setUint32(4, 29, true)
  ])("ignores malformed or unrelated EXIF metadata without unbounded reads", async (mutate) => {
    const result = await prepareGameImage3D(exifJpeg(6, true, false, mutate), { assetId: "image" });
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.image.binding).toMatchObject({ width: 4, height: 2 }); }
  });
  it("loads once, accounts decoded memory and disposes each canonical source on invalidation", async () => {
    const image = await prepared();
    const decoder = vi.fn(decode);
    const cache = new GameImageCache3D({ resolveImage: async () => image, decodeImage: decoder }, new AbortController().signal);
    const [first, shared] = await Promise.all([cache.get("slot"), cache.get("slot")]);
    expect(first).toBe(shared); expect(decoder).toHaveBeenCalledTimes(1); expect(cache.textureBytes).toBe(24);
    const disposal = vi.fn(); first.addEventListener("dispose", disposal);
    const clone = first.clone(); clone.dispose(); expect(disposal).not.toHaveBeenCalled();
    await cache.invalidate("slot"); expect(disposal).toHaveBeenCalledTimes(1); expect(cache.textureBytes).toBe(0);
    expect(await cache.get("slot")).not.toBe(first);
    cache.dispose(); cache.dispose();
    await expect(cache.get("slot")).rejects.toThrow("disposed");
  });
  it("rejects binding dimension, byte length, format and digest mismatches before decode", async () => {
    const image = await prepared();
    for (const patch of [{ width: 3 }, { byteLength: 1 }, { format: "jpeg" as const }, { digest: "different" }]) {
      const decoder = vi.fn(decode);
      const cache = new GameImageCache3D({ resolveImage: async () => ({ ...image, binding: { ...image.binding, ...patch } }), decodeImage: decoder }, new AbortController().signal);
      await expect(cache.get("slot")).rejects.toThrow(); expect(decoder).not.toHaveBeenCalled(); cache.dispose();
    }
  });
  it("rejects damaged PNG image data before decoding", async () => {
    const bytes = png();
    const view = new DataView(bytes.buffer);
    for (let cursor = 8; cursor + 12 <= bytes.length; cursor += view.getUint32(cursor) + 12) {
      if (view.getUint32(cursor + 4) === 0x49444154) { bytes.fill(0, cursor + 8, cursor + 8 + view.getUint32(cursor)); }
    }
    const result = await prepareGameImage3D(bytes, { assetId: "image" });
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.diagnostics[0]?.message).toContain("checksum"); }
  });
  it("closes the default decoder bitmap only when its source texture is disposed", async () => {
    const bitmap = { width: 2, height: 3, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    try {
      const texture = await decodeGameImage3D(await prepared(), new AbortController().signal);
      expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
        imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none"
      });
      texture.clone().dispose(); expect(bitmap.close).not.toHaveBeenCalled();
      texture.dispose(); texture.dispose(); expect(bitmap.close).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("closes a bitmap arriving after cancellation before creating a texture", async () => {
    const controller = new AbortController(); const bitmap = { width: 2, height: 3, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { controller.abort(); return bitmap; }));
    try {
      await expect(decodeGameImage3D(await prepared(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
      expect(bitmap.close).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("disposes a decoder result with unexpected dimensions", async () => {
    const image = await prepared(); const texture = new Texture({ width: 1, height: 1 });
    const disposal = vi.fn(); texture.addEventListener("dispose", disposal);
    const cache = new GameImageCache3D({ resolveImage: async () => image, decodeImage: async () => texture }, new AbortController().signal);
    await expect(cache.get("slot")).rejects.toThrow("dimensions"); expect(disposal).toHaveBeenCalledTimes(1); cache.dispose();
  });
  it("releases a decoder result arriving after invalidation and allows a fresh lookup", async () => {
    const image = await prepared(); const texture = new Texture({ width: 2, height: 3 });
    const disposal = vi.fn(); texture.addEventListener("dispose", disposal);
    let complete: ((texture: Texture) => void) | undefined;
    const decoderStarted = Promise.withResolvers<void>();
    const cache = new GameImageCache3D({ resolveImage: async () => image, decodeImage: async () => {
      decoderStarted.resolve(); return new Promise<Texture>((resolve) => { complete = resolve; });
    } }, new AbortController().signal);
    const lookup = cache.get("slot"); const rejection = expect(lookup).rejects.toMatchObject({ name: "AbortError" });
    await decoderStarted.promise;
    const invalidation = cache.invalidate("slot"); complete?.(texture);
    await invalidation; await rejection; expect(disposal).toHaveBeenCalledTimes(1); expect(cache.textureBytes).toBe(0); cache.dispose();
  });
});

describe("aggregate primitive texture budget", () => {
  async function largeImage(): Promise<PreparedGameImage3D> {
    const bytes = new Uint8Array(createCanvas(4096, 4096).toBuffer("image/png"));
    const result = await prepareGameImage3D(bytes, { assetId: "large" });
    if (!result.ok) { throw new Error(result.diagnostics[0]?.message); }
    return result.image;
  }
  it("reserves concurrent decodes and retains canceled reservations until decoding finishes", async () => {
    const image = await largeImage();
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<void>();
    const decoder = vi.fn(async () => {
      if (decoder.mock.calls.length === 2) { started.resolve(); }
      await pending.promise; return new Texture({ width: 4096, height: 4096 });
    });
    const cache = new GameImageCache3D({ resolveImage: async () => image, decodeImage: decoder }, new AbortController().signal);
    const first = cache.get("first"); const second = cache.get("second");
    const firstRejection = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await started.promise;
    await expect(cache.get("third")).rejects.toThrow("aggregate texture byte budget"); expect(decoder).toHaveBeenCalledTimes(2);
    const invalidated = cache.invalidate("first");
    await expect(cache.get("fourth")).rejects.toThrow("aggregate texture byte budget");
    pending.resolve();
    await invalidated; await firstRejection; await second;
    await cache.invalidate("third");
    expect(await cache.get("third")).toBeInstanceOf(Texture);
    expect(cache.textureBytes).toBe(128 * 1024 * 1024); cache.dispose(); expect(cache.textureBytes).toBe(0);
  });
  it("releases failed decoder reservations so other assets remain loadable", async () => {
    const image = await largeImage();
    const decoder = vi.fn(async () => { throw new Error("decode failed"); });
    const cache = new GameImageCache3D({ resolveImage: async () => image, decodeImage: decoder }, new AbortController().signal);
    for (const slot of ["one", "two", "one"]) { await expect(cache.get(slot)).rejects.toThrow("decode failed"); }
    expect(decoder).toHaveBeenCalledTimes(3); expect(cache.textureBytes).toBe(0); cache.dispose();
  });
});
