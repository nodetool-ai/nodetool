import { describe, it, expect } from "vitest";
import {
  MIME_TO_EXT,
  inferImageMime,
  timestampedName
} from "../../src/tools/asset-persist.js";

describe("MIME_TO_EXT mapping", () => {
  it("maps common image types", () => {
    expect(MIME_TO_EXT["image/png"]).toBe("png");
    expect(MIME_TO_EXT["image/jpeg"]).toBe("jpg");
    expect(MIME_TO_EXT["image/jpg"]).toBe("jpg");
    expect(MIME_TO_EXT["image/webp"]).toBe("webp");
    expect(MIME_TO_EXT["image/gif"]).toBe("gif");
  });

  it("maps audio types", () => {
    expect(MIME_TO_EXT["audio/mpeg"]).toBe("mp3");
    expect(MIME_TO_EXT["audio/mp3"]).toBe("mp3");
    expect(MIME_TO_EXT["audio/wav"]).toBe("wav");
    expect(MIME_TO_EXT["audio/x-wav"]).toBe("wav");
    expect(MIME_TO_EXT["audio/flac"]).toBe("flac");
    expect(MIME_TO_EXT["audio/ogg"]).toBe("ogg");
  });

  it("maps video types", () => {
    expect(MIME_TO_EXT["video/mp4"]).toBe("mp4");
    expect(MIME_TO_EXT["video/webm"]).toBe("webm");
  });

  it("maps application/octet-stream to bin", () => {
    expect(MIME_TO_EXT["application/octet-stream"]).toBe("bin");
  });

  it("returns undefined for unknown MIME type", () => {
    expect(MIME_TO_EXT["text/html"]).toBeUndefined();
  });
});

describe("inferImageMime", () => {
  it("detects PNG from magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(inferImageMime(png)).toBe("image/png");
  });

  it("detects JPEG from magic bytes", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(inferImageMime(jpeg)).toBe("image/jpeg");
  });

  it("detects GIF from magic bytes", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(inferImageMime(gif)).toBe("image/gif");
  });

  it("detects WebP from magic bytes", () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50
    ]);
    expect(inferImageMime(webp)).toBe("image/webp");
  });

  it("defaults to image/png for unknown bytes", () => {
    const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(inferImageMime(unknown)).toBe("image/png");
  });

  it("defaults to image/png for empty array", () => {
    expect(inferImageMime(new Uint8Array())).toBe("image/png");
  });

  it("handles very short byte arrays without crashing", () => {
    expect(inferImageMime(new Uint8Array([0xff]))).toBe("image/png");
    expect(inferImageMime(new Uint8Array([0xff, 0xd8]))).toBe("image/png");
  });
});

describe("timestampedName", () => {
  it("returns a string with prefix and extension", () => {
    const name = timestampedName("screenshot", "png");
    expect(name).toMatch(/^screenshot-.*\.png$/);
  });

  it("contains an ISO-like timestamp", () => {
    const name = timestampedName("output", "jpg");
    expect(name).toMatch(/^\w+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
  });

  it("replaces colons and dots in the timestamp", () => {
    const name = timestampedName("test", "wav");
    expect(name).not.toContain(":");
    const beforeExt = name.slice(0, name.lastIndexOf("."));
    expect(beforeExt).not.toContain(".");
  });

  it("uses the provided extension", () => {
    expect(timestampedName("audio", "mp3")).toMatch(/\.mp3$/);
    expect(timestampedName("video", "mp4")).toMatch(/\.mp4$/);
  });
});
