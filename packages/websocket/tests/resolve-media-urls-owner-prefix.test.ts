/**
 * Regression: `asset_id` refs used to resolve to pre-migration flat keys
 * (`<assetId>.<ext>`) while the bytes are written owner-prefixed by
 * `storeAssetWithThumbnail`. `/api/storage` only falls back prefixed → flat,
 * so every assistant-generated image 404'd on re-serve.
 */
import { describe, it, expect, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({ existing: new Set<string>() }));

vi.mock("@nodetool-ai/config", () => ({
  buildAssetUrl: (key: string) => `/api/storage/${key}`,
  getAssetFilePath: (key: string) => `/var/assets/${key}`
}));

vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (p: string) => fsMocks.existing.has(String(p))
  };
});

import {
  resolveContentUrls,
  resolveContentForProvider
} from "../src/resolve-media-urls.js";

type Block = { image: { uri: string } };

describe("resolveContentUrls with a known owner", () => {
  it("builds the owner-prefixed key the bytes were written under", () => {
    const content = [
      { type: "image", image: { asset_id: "abc", mimeType: "image/png" } }
    ];
    const out = resolveContentUrls(content, "user-1") as Block[];
    expect(out[0].image.uri).toBe("/api/storage/user-1/abc.png");
  });

  it("keeps the flat legacy key when no owner is known", () => {
    const content = [
      { type: "image", image: { asset_id: "abc", mimeType: "image/png" } }
    ];
    const out = resolveContentUrls(content) as Block[];
    expect(out[0].image.uri).toBe("/api/storage/abc.png");
  });

  it("prefixes video and audio refs too", () => {
    const out = resolveContentUrls(
      [
        { type: "video", video: { asset_id: "v" } },
        { type: "audio", audio: { asset_id: "a" } }
      ],
      "user-1"
    ) as Array<{ video?: { uri: string }; audio?: { uri: string } }>;
    expect(out[0].video?.uri).toBe("/api/storage/user-1/v.mp4");
    expect(out[1].audio?.uri).toBe("/api/storage/user-1/a.wav");
  });
});

describe("resolveContentForProvider with a known owner", () => {
  it("points at the owner-prefixed path", () => {
    fsMocks.existing.clear();
    fsMocks.existing.add("/var/assets/user-1/abc.png");
    const out = resolveContentForProvider(
      [{ type: "image", image: { asset_id: "abc", mimeType: "image/png" } }],
      "user-1"
    ) as Block[];
    expect(out[0].image.uri).toBe("file:///var/assets/user-1/abc.png");
  });

  it("falls back to the flat legacy path for pre-migration objects", () => {
    fsMocks.existing.clear();
    fsMocks.existing.add("/var/assets/abc.png");
    const out = resolveContentForProvider(
      [{ type: "image", image: { asset_id: "abc", mimeType: "image/png" } }],
      "user-1"
    ) as Block[];
    expect(out[0].image.uri).toBe("file:///var/assets/abc.png");
  });
});
