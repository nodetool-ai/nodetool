import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@nodetool-ai/config", () => ({
  buildAssetUrl: (name: string) => `https://assets.test/${name}`,
  getAssetFilePath: (name: string) => `/var/assets/${name}`
}));

import {
  resolveContentUrls,
  resolveContentForProvider
} from "../src/resolve-media-urls.js";

describe("resolveContentUrls", () => {
  it("returns non-array content unchanged (string)", () => {
    expect(resolveContentUrls("hello")).toBe("hello");
  });

  it("returns null unchanged", () => {
    expect(resolveContentUrls(null)).toBeNull();
  });

  it("returns a plain object (non-array) unchanged", () => {
    const obj = { type: "text" };
    expect(resolveContentUrls(obj)).toBe(obj);
  });

  it("passes through primitive and null blocks in an array", () => {
    const content = ["str", 42, null, true];
    expect(resolveContentUrls(content)).toEqual(["str", 42, null, true]);
  });

  it("resolves an image asset_id into an https asset url with mime->ext", () => {
    const content = [
      { type: "image", image: { asset_id: "abc", mimeType: "image/jpeg" } }
    ];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/abc.jpg");
  });

  it("resolves image_url type the same as image", () => {
    const content = [
      { type: "image_url", image: { asset_id: "xyz", mime_type: "image/png" } }
    ];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/xyz.png");
  });

  it("falls back to image/png ext when no mime present", () => {
    const content = [{ type: "image", image: { asset_id: "noext" } }];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/noext.png");
  });

  it("uses content_type field when present", () => {
    const content = [
      { type: "image", image: { asset_id: "c", content_type: "image/webp" } }
    ];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/c.webp");
  });

  it("maps unknown mime to bin extension", () => {
    const content = [
      { type: "image", image: { asset_id: "u", mimeType: "application/x-weird" } }
    ];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/u.bin");
  });

  it("resolves video with video/mp4 fallback", () => {
    const content = [{ type: "video", video: { asset_id: "v1" } }];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].video.uri).toBe("https://assets.test/v1.mp4");
  });

  it("resolves audio with audio/wav fallback", () => {
    const content = [{ type: "audio", audio: { asset_id: "a1" } }];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].audio.uri).toBe("https://assets.test/a1.wav");
  });

  it("leaves a ref without asset_id untouched (no uri added)", () => {
    const content = [{ type: "image", image: { uri: "existing://x" } }];
    const out = resolveContentUrls(content) as any[];
    expect(out[0].image.uri).toBe("existing://x");
  });

  it("does not resolve when image field is missing", () => {
    const content = [{ type: "image" }];
    const out = resolveContentUrls(content) as any[];
    expect(out[0]).toEqual({ type: "image" });
  });

  it("passes through a block with an unrecognized type", () => {
    const content = [{ type: "text", text: "hi" }];
    const out = resolveContentUrls(content) as any[];
    expect(out[0]).toEqual({ type: "text", text: "hi" });
  });

  it("ignores non-object image field", () => {
    const content = [{ type: "image", image: "not-an-object" }];
    const out = resolveContentUrls(content) as any[];
    expect(out[0]).toEqual({ type: "image", image: "not-an-object" });
  });

  it("does not mutate the input ref object", () => {
    const image = { asset_id: "m", mimeType: "image/gif" };
    const content = [{ type: "image", image }];
    resolveContentUrls(content);
    expect(image).not.toHaveProperty("uri");
  });
});

describe("resolveContentForProvider", () => {
  it("returns non-array content unchanged", () => {
    expect(resolveContentForProvider("plain")).toBe("plain");
    expect(resolveContentForProvider(null)).toBeNull();
  });

  it("resolves image asset_id to a file:// URI", () => {
    const content = [{ type: "image", image: { asset_id: "abc", mimeType: "image/png" } }];
    const out = resolveContentForProvider(content) as any[];
    expect(out[0].image.uri).toBe("file:///var/assets/abc.png");
  });

  it("does not overwrite an existing uri", () => {
    const content = [
      { type: "image", image: { asset_id: "abc", uri: "keep://this" } }
    ];
    const out = resolveContentForProvider(content) as any[];
    expect(out[0].image.uri).toBe("keep://this");
  });

  it("resolves video to file:// URI with mp4 fallback", () => {
    const content = [{ type: "video", video: { asset_id: "v" } }];
    const out = resolveContentForProvider(content) as any[];
    expect(out[0].video.uri).toBe("file:///var/assets/v.mp4");
  });

  it("resolves audio to file:// URI with wav fallback", () => {
    const content = [{ type: "audio", audio: { asset_id: "a" } }];
    const out = resolveContentForProvider(content) as any[];
    expect(out[0].audio.uri).toBe("file:///var/assets/a.wav");
  });

  it("passes through primitives and unknown blocks", () => {
    const content = ["x", null, { type: "text", text: "t" }];
    const out = resolveContentForProvider(content) as any[];
    expect(out).toEqual(["x", null, { type: "text", text: "t" }]);
  });

  it("uses provided mime over fallback for ext", () => {
    const content = [
      { type: "audio", audio: { asset_id: "a", mimeType: "audio/mpeg" } }
    ];
    const out = resolveContentForProvider(content) as any[];
    expect(out[0].audio.uri).toBe("file:///var/assets/a.mp3");
  });
});
