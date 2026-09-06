import { describe, it, expect } from "vitest";
import {
  sniffAudioMime,
  sniffAudioMimeOrNull
} from "../src/providers/audio-mime.js";
import {
  sniffVideoMime,
  sniffVideoMimeOrNull
} from "../src/providers/video-mime.js";
import { sniffMedia, sniffMediaMime } from "../src/providers/media-mime.js";

const riff = (form: string, tail: number[] = []) =>
  new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0x24,
    0x00,
    0x00,
    0x00,
    ...[...form].map((c) => c.charCodeAt(0)),
    ...tail
  ]);

const wav = () => riff("WAVE");
const webp = () => riff("WEBP");
const avi = () => riff("AVI ");
const ogg = () => new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
const flac = () => new Uint8Array([0x66, 0x4c, 0x61, 0x43]);
const mp3 = () => new Uint8Array([0x49, 0x44, 0x33, 0x04]);
const mp4 = () =>
  new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d
  ]);
const mov = () =>
  new Uint8Array([
    0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20
  ]);
const webm = () => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("sniffAudioMimeOrNull", () => {
  it.each([
    ["audio/wav", wav()],
    ["audio/ogg", ogg()],
    ["audio/flac", flac()],
    ["audio/mpeg", mp3()]
  ])("identifies %s", (expected, bytes) => {
    expect(sniffAudioMimeOrNull(bytes)).toBe(expected);
  });

  it("does not claim a non-WAVE RIFF container", () => {
    expect(sniffAudioMimeOrNull(webp())).toBeNull();
    expect(sniffAudioMimeOrNull(avi())).toBeNull();
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(sniffAudioMimeOrNull(png())).toBeNull();
    expect(sniffAudioMimeOrNull(new Uint8Array())).toBeNull();
  });

  it("sniffAudioMime keeps the audio/mpeg default", () => {
    expect(sniffAudioMime(new Uint8Array())).toBe("audio/mpeg");
    expect(sniffAudioMime(wav())).toBe("audio/wav");
  });
});

describe("sniffVideoMimeOrNull", () => {
  it.each([
    ["video/mp4", mp4()],
    ["video/quicktime", mov()],
    ["video/webm", webm()],
    ["video/x-msvideo", avi()]
  ])("identifies %s", (expected, bytes) => {
    expect(sniffVideoMimeOrNull(bytes)).toBe(expected);
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(sniffVideoMimeOrNull(png())).toBeNull();
    expect(sniffVideoMimeOrNull(new Uint8Array())).toBeNull();
  });

  it("sniffVideoMime keeps the video/mp4 default", () => {
    expect(sniffVideoMime(new Uint8Array())).toBe("video/mp4");
  });
});

describe("sniffMedia", () => {
  it("routes each RIFF form to the right kind", () => {
    expect(sniffMedia(webp())).toEqual({ kind: "image", mime: "image/webp" });
    expect(sniffMedia(wav())).toEqual({ kind: "audio", mime: "audio/wav" });
    expect(sniffMedia(avi())).toEqual({
      kind: "video",
      mime: "video/x-msvideo"
    });
  });

  it("classifies across all three families", () => {
    expect(sniffMedia(png())?.kind).toBe("image");
    expect(sniffMedia(flac())?.kind).toBe("audio");
    expect(sniffMedia(mp4())?.kind).toBe("video");
  });

  it("returns null for an unrecognized blob", () => {
    expect(sniffMedia(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});

describe("sniffMediaMime", () => {
  it("uses the caller's fallback, not a guessed media type", () => {
    const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(sniffMediaMime(unknown, "image/png")).toBe("image/png");
    expect(sniffMediaMime(unknown, "audio/mpeg")).toBe("audio/mpeg");
    expect(sniffMediaMime(unknown)).toBe("application/octet-stream");
  });

  it("prefers the sniffed type over the fallback", () => {
    expect(sniffMediaMime(webp(), "image/png")).toBe("image/webp");
    expect(sniffMediaMime(wav(), "audio/mpeg")).toBe("audio/wav");
  });
});
