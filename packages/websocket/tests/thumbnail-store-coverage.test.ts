import { describe, it, expect, vi, beforeEach } from "vitest";

const storeMock = vi.fn();
vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => ({ store: storeMock })
}));

import sharp from "sharp";
import {
  thumbnailKey,
  storeAssetWithThumbnail,
  generateImageThumb
} from "../src/lib/thumbnail.js";

async function tinyPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 10, g: 20, b: 30 }
    }
  })
    .png()
    .toBuffer();
}

describe("thumbnailKey", () => {
  it("appends the _thumb.jpg suffix", () => {
    expect(thumbnailKey("abc123")).toBe("abc123_thumb.jpg");
  });
});

describe("storeAssetWithThumbnail", () => {
  beforeEach(() => {
    storeMock.mockReset();
    storeMock.mockResolvedValue(undefined);
  });

  it("stores the original but no thumbnail for an unsupported content type", async () => {
    await storeAssetWithThumbnail(
      "id1",
      "file.txt",
      new Uint8Array([1, 2, 3]),
      "text/plain"
    );
    expect(storeMock).toHaveBeenCalledTimes(1);
    expect(storeMock).toHaveBeenCalledWith(
      "file.txt",
      expect.any(Uint8Array),
      "text/plain"
    );
  });

  it("stores original and a jpeg thumbnail for an image", async () => {
    const png = await tinyPng();
    await storeAssetWithThumbnail("id2", "pic.png", new Uint8Array(png), "image/png");
    expect(storeMock).toHaveBeenCalledTimes(2);
    // second call stores the thumbnail
    const thumbCall = storeMock.mock.calls[1];
    expect(thumbCall[0]).toBe("id2_thumb.jpg");
    expect(thumbCall[2]).toBe("image/jpeg");
  });

  it("swallows thumbnail generation failure but still stores the original", async () => {
    const notAnImage = new Uint8Array([0, 1, 2, 3, 4]);
    await storeAssetWithThumbnail("id3", "broken.png", notAnImage, "image/png");
    // original stored; thumbnail generation failed and was swallowed
    expect(storeMock).toHaveBeenCalledTimes(1);
    expect(storeMock.mock.calls[0][0]).toBe("broken.png");
  });

  it("selects the generator by content-type prefix (audio path attempts thumb)", async () => {
    // audio uses ffmpeg which will fail on these bytes; failure is swallowed,
    // so only the original store call remains.
    await storeAssetWithThumbnail(
      "id4",
      "clip.wav",
      new Uint8Array([1, 2, 3]),
      "audio/wav"
    );
    expect(storeMock.mock.calls[0][0]).toBe("clip.wav");
  });
});

describe("generateImageThumb", () => {
  it("falls back to a plain rotate pass when trim fails on a uniform image", async () => {
    // A fully-uniform image can trim to nothing; the impl falls back and still
    // returns a valid jpeg.
    const uniform = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
      .png()
      .toBuffer();
    const thumb = await generateImageThumb(new Uint8Array(uniform));
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("jpeg");
  });
});
