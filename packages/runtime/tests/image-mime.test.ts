import { describe, it, expect } from "vitest";
import {
  IMAGE_MIME_TO_EXT,
  bytesToImageDataUri,
  detectImageMime,
  extForImageMime,
  sniffImageMime
} from "../src/providers/image-mime.js";

const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const gif = () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const bmp = () => new Uint8Array([0x42, 0x4d, 0x36, 0x00]);
/** "RIFF" + 4 size bytes + "WEBP" — Replicate's actual output container. */
const webp = () =>
  new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
  ]);

describe("sniffImageMime", () => {
  it.each([
    ["image/png", png()],
    ["image/jpeg", jpeg()],
    ["image/webp", webp()],
    ["image/gif", gif()],
    ["image/bmp", bmp()]
  ])("identifies %s", (expected, bytes) => {
    expect(sniffImageMime(bytes)).toBe(expected);
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(sniffImageMime(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });

  it("does not mistake a non-WebP RIFF container for WebP", () => {
    // "RIFF"????"WAVE" — a wav file, not an image.
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45
    ]);
    expect(sniffImageMime(wav)).toBeNull();
  });
});

describe("detectImageMime", () => {
  it("agrees with sniffImageMime on every recognized container", () => {
    for (const bytes of [png(), jpeg(), webp(), gif(), bmp()]) {
      expect(detectImageMime(bytes)).toBe(sniffImageMime(bytes));
    }
  });

  it("falls back to PNG only where a string is required", () => {
    expect(detectImageMime(new Uint8Array([0x00, 0x01]))).toBe("image/png");
  });
});

describe("bytesToImageDataUri", () => {
  it("declares the sniffed container, not an assumed PNG", () => {
    expect(bytesToImageDataUri(webp())).toMatch(/^data:image\/webp;base64,/);
    expect(bytesToImageDataUri(jpeg())).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("round-trips the bytes", () => {
    const payload = bytesToImageDataUri(gif()).split(",")[1];
    expect([...Buffer.from(payload, "base64")]).toEqual([...gif()]);
  });
});

describe("extForImageMime", () => {
  it("maps every entry of the table", () => {
    for (const [mime, ext] of Object.entries(IMAGE_MIME_TO_EXT)) {
      expect(extForImageMime(mime)).toBe(ext);
    }
  });

  it("is case-insensitive and rejects non-image types", () => {
    expect(extForImageMime("IMAGE/WEBP")).toBe("webp");
    expect(extForImageMime("audio/mpeg")).toBeNull();
  });
});
