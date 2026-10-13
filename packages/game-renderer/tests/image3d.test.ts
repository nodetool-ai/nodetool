import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import { gameAssetBinding3D } from "@nodetool-ai/protocol";
import { prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";
import { decodeGameImage3D, GameImageCache3D } from "../src/renderer3d/assets/image-cache.js";
import type { PreparedGameImage3D } from "../src/renderer3d/assets/image-contract.js";

function png(): Uint8Array {
  const canvas = createCanvas(2, 3);
  canvas.getContext("2d").fillRect(0, 0, 2, 3);
  return new Uint8Array(canvas.toBuffer("image/png"));
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
