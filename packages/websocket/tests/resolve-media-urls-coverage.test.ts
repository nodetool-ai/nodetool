import { describe, it, expect, vi, beforeEach } from "vitest";
import { pathToFileURL } from "node:url";

// The source resolves paths through pathToFileURL, which on Windows prefixes
// the current drive (file:///C:/var/...). Build expectations the same way.
const fileUri = (name: string) => pathToFileURL(`/var/assets/${name}`).href;

vi.mock("@nodetool-ai/config", () => ({
  buildAssetUrl: (name: string) => `https://assets.test/${name}`,
  getAssetFilePath: (name: string) => `/var/assets/${name}`,
  loadAssetStorageConfig: () => ({ kind: "file" })
}));

import {
  resolveContentUrls,
  resolveContentForProvider
} from "../src/resolve-media-urls.js";

describe("resolveContentUrls", () => {
  it("returns non-array content unchanged (string)", async () => {
    expect(await resolveContentUrls("hello")).toBe("hello");
  });

  it("returns null unchanged", async () => {
    expect(await resolveContentUrls(null)).toBeNull();
  });

  it("returns a plain object (non-array) unchanged", async () => {
    const obj = { type: "text" };
    expect(await resolveContentUrls(obj)).toBe(obj);
  });

  it("passes through primitive and null blocks in an array", async () => {
    const content = ["str", 42, null, true];
    expect(await resolveContentUrls(content)).toEqual([
      "str",
      42,
      null,
      true
    ]);
  });

  it("resolves an image asset_id into an https asset url with mime->ext", async () => {
    const content = [
      { type: "image", image: { asset_id: "abc", mimeType: "image/jpeg" } }
    ];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/abc.jpg");
  });

  it("resolves image_url type the same as image", async () => {
    const content = [
      { type: "image_url", image: { asset_id: "xyz", mime_type: "image/png" } }
    ];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/xyz.png");
  });

  it("falls back to image/png ext when no mime present", async () => {
    const content = [{ type: "image", image: { asset_id: "noext" } }];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/noext.png");
  });

  it("uses content_type field when present", async () => {
    const content = [
      { type: "image", image: { asset_id: "c", content_type: "image/webp" } }
    ];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/c.webp");
  });

  it("maps unknown mime to bin extension", async () => {
    const content = [
      { type: "image", image: { asset_id: "u", mimeType: "application/x-weird" } }
    ];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].image.uri).toBe("https://assets.test/u.bin");
  });

  it("resolves video with video/mp4 fallback", async () => {
    const content = [{ type: "video", video: { asset_id: "v1" } }];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].video.uri).toBe("https://assets.test/v1.mp4");
  });

  it("resolves audio with audio/wav fallback", async () => {
    const content = [{ type: "audio", audio: { asset_id: "a1" } }];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].audio.uri).toBe("https://assets.test/a1.wav");
  });

  it("leaves a ref without asset_id untouched (no uri added)", async () => {
    const content = [{ type: "image", image: { uri: "existing://x" } }];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0].image.uri).toBe("existing://x");
  });

  it("does not resolve when image field is missing", async () => {
    const content = [{ type: "image" }];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0]).toEqual({ type: "image" });
  });

  it("passes through a block with an unrecognized type", async () => {
    const content = [{ type: "text", text: "hi" }];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0]).toEqual({ type: "text", text: "hi" });
  });

  it("ignores non-object image field", async () => {
    const content = [{ type: "image", image: "not-an-object" }];
    const out = (await resolveContentUrls(content)) as any[];
    expect(out[0]).toEqual({ type: "image", image: "not-an-object" });
  });

  it("does not mutate the input ref object", async () => {
    const image = { asset_id: "m", mimeType: "image/gif" };
    const content = [{ type: "image", image }];
    await resolveContentUrls(content);
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
    expect(out[0].image.uri).toBe(fileUri("abc.png"));
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
    expect(out[0].video.uri).toBe(fileUri("v.mp4"));
  });

  it("resolves audio to file:// URI with wav fallback", () => {
    const content = [{ type: "audio", audio: { asset_id: "a" } }];
    const out = resolveContentForProvider(content) as any[];
    expect(out[0].audio.uri).toBe(fileUri("a.wav"));
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
    expect(out[0].audio.uri).toBe(fileUri("a.mp3"));
  });
});
