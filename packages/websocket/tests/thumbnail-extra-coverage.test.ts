import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Branch coverage for storeAssetWithThumbnail's generator dispatch and the
 * failure-swallowing path. The image happy path (single decode/encode) is
 * covered by thumbnail.test.ts; here we exercise the non-image content types,
 * the "no thumbnail generator" early return, and the swallow-on-failure branch
 * that keeps an upload succeeding even when thumbnailing throws.
 */

const store = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => ({ store })
}));

import sharp from "sharp";
import { storeAssetWithThumbnail, thumbnailKey } from "../src/lib/thumbnail.js";

async function tinyPng(): Promise<Uint8Array> {
  const width = 8;
  const height = 8;
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 37) % 256;
  const buf = await sharp(raw, { raw: { width, height, channels } })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

describe("thumbnailKey", () => {
  it("appends the thumb suffix", () => {
    expect(thumbnailKey("asset-1")).toBe("asset-1_thumb.jpg");
  });
});

describe("storeAssetWithThumbnail", () => {
  beforeEach(() => {
    store.mockReset();
    store.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores only the original for a non-media content type", async () => {
    await storeAssetWithThumbnail(
      "a1",
      "notes.txt",
      new Uint8Array([1, 2, 3]),
      "text/plain"
    );
    // No generator -> exactly one store (the original), no thumbnail store.
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(
      "notes.txt",
      expect.any(Uint8Array),
      "text/plain"
    );
  });

  it("stores original and a JPEG thumbnail for an image", async () => {
    const bytes = await tinyPng();
    await storeAssetWithThumbnail("img1", "pic.png", bytes, "image/png");
    expect(store).toHaveBeenCalledTimes(2);
    expect(store).toHaveBeenNthCalledWith(1, "pic.png", bytes, "image/png");
    expect(store).toHaveBeenNthCalledWith(
      2,
      "img1_thumb.jpg",
      expect.any(Uint8Array),
      "image/jpeg"
    );
  });

  it("swallows image thumbnail failures but still stores the original", async () => {
    // Invalid image bytes: both the trim pass and the untrimmed fallback in
    // generateImageThumb throw, and storeAssetWithThumbnail swallows it.
    await storeAssetWithThumbnail(
      "bad",
      "broken.png",
      new Uint8Array([0, 1, 2, 3, 4]),
      "image/png"
    );
    // Original stored; thumbnail store never reached.
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(
      "broken.png",
      expect.any(Uint8Array),
      "image/png"
    );
  });

  it("selects the video generator and swallows ffmpeg failures", async () => {
    await storeAssetWithThumbnail(
      "vid",
      "clip.mp4",
      new Uint8Array([0, 1, 2, 3]),
      "video/mp4"
    );
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(
      "clip.mp4",
      expect.any(Uint8Array),
      "video/mp4"
    );
  });

  it("selects the audio generator and swallows ffmpeg failures", async () => {
    await storeAssetWithThumbnail(
      "aud",
      "sound.mp3",
      new Uint8Array([0, 1, 2, 3]),
      "audio/mpeg"
    );
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(
      "sound.mp3",
      expect.any(Uint8Array),
      "audio/mpeg"
    );
  });

  it("selects the pdf generator and swallows parse failures", async () => {
    await storeAssetWithThumbnail(
      "doc",
      "file.pdf",
      new Uint8Array([0, 1, 2, 3]),
      "application/pdf"
    );
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(
      "file.pdf",
      expect.any(Uint8Array),
      "application/pdf"
    );
  });
});
