import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIME_TYPE,
  INLINE_USER_FILE_MIME_OVERRIDES,
  MIME_TYPES_BY_EXTENSION,
  fileExtension,
  mimeTypeForPath
} from "../src/mime-types.js";

describe("fileExtension", () => {
  it.each([
    ["clip.MP4", ".mp4"],
    ["dir.v2/clip.webm", ".webm"],
    ["C:\\media\\take.WAV", ".wav"],
    ["archive.tar.gz", ".gz"],
    ["dir.v2/README", ""],
    [".bashrc", ""],
    ["", ""]
  ])("%s → %s", (path, ext) => {
    expect(fileExtension(path)).toBe(ext);
  });
});

describe("mimeTypeForPath", () => {
  it("uses the registered types the five websocket tables disagreed on", () => {
    expect(mimeTypeForPath("a.m4a")).toBe("audio/mp4");
    expect(mimeTypeForPath("a.flac")).toBe("audio/flac");
    expect(mimeTypeForPath("a.html")).toBe("text/html");
    expect(mimeTypeForPath("a.glb")).toBe("model/gltf-binary");
  });

  it("falls back to octet-stream for unknown or missing extensions", () => {
    expect(mimeTypeForPath("data.xyz")).toBe(DEFAULT_MIME_TYPE);
    expect(mimeTypeForPath("README")).toBe(DEFAULT_MIME_TYPE);
    expect(mimeTypeForPath("a.constructor")).toBe(DEFAULT_MIME_TYPE);
  });

  it("lets an override win over the shared table", () => {
    expect(mimeTypeForPath("a.flac", { ".flac": "audio/x-flac" })).toBe("audio/x-flac");
    expect(mimeTypeForPath("a.wav", { ".flac": "audio/x-flac" })).toBe("audio/wav");
  });

  it("keeps every table key a lowercase dotted extension", () => {
    const keys = Object.keys(MIME_TYPES_BY_EXTENSION);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).toMatch(/^\.[a-z0-9]+$/);
  });
});

describe("INLINE_USER_FILE_MIME_OVERRIDES", () => {
  it.each([".html", ".htm", ".xml", ".js"])(
    "serves %s as text/plain",
    (ext) => {
      expect(mimeTypeForPath(`page${ext}`, INLINE_USER_FILE_MIME_OVERRIDES)).toBe("text/plain");
    }
  );

  it("leaves SVG as image/svg+xml for <img>", () => {
    expect(mimeTypeForPath("x.svg", INLINE_USER_FILE_MIME_OVERRIDES)).toBe("image/svg+xml");
  });
});
