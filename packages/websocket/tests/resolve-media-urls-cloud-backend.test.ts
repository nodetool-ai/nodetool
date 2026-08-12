/**
 * Regression: chat media content resolved to `/api/storage/<key>` regardless of
 * the configured storage backend. On a deployment with auth enforced and asset
 * bytes in Supabase/S3 that URL is unloadable twice over — a media element
 * sends no `Authorization` header (401), and the local file backend behind the
 * route does not hold the bytes. Generated images in chat therefore showed as
 * broken tiles while the asset browser (which resolves through
 * `createAssetUrlBuilder`) worked. Message content now uses the same builder.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const storageMocks = vi.hoisted(() => ({
  kind: "file" as string,
  sign: vi.fn(async (key: string) => `https://cdn.test/${key}?token=sig`)
}));

vi.mock("@nodetool-ai/config", () => ({
  buildAssetUrl: (key: string) => `/api/storage/${key}`,
  getAssetFilePath: (key: string) => `/var/assets/${key}`,
  loadAssetStorageConfig: () => ({ kind: storageMocks.kind })
}));

vi.mock("@nodetool-ai/storage", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/storage")>();
  return {
    ...actual,
    createAssetUrlBuilder: () => storageMocks.sign
  };
});

import { resolveContentUrls } from "../src/resolve-media-urls.js";

type ImageBlock = { image: { uri: string } };

const imageContent = [
  { type: "image_url", image: { asset_id: "abc", mimeType: "image/png" } }
];

describe("resolveContentUrls across storage backends", () => {
  beforeEach(() => {
    storageMocks.sign.mockClear();
  });

  it("signs the asset URL when the backend is supabase", async () => {
    storageMocks.kind = "supabase";
    const out = (await resolveContentUrls(imageContent, "user-1")) as ImageBlock[];
    expect(storageMocks.sign).toHaveBeenCalledWith("user-1/abc.png");
    expect(out[0].image.uri).toBe("https://cdn.test/user-1/abc.png?token=sig");
  });

  it("signs video and audio refs too", async () => {
    storageMocks.kind = "s3";
    const out = (await resolveContentUrls(
      [
        { type: "video", video: { asset_id: "v" } },
        { type: "audio", audio: { asset_id: "a" } }
      ],
      "user-1"
    )) as Array<{ video?: { uri: string }; audio?: { uri: string } }>;
    expect(out[0].video?.uri).toBe("https://cdn.test/user-1/v.mp4?token=sig");
    expect(out[1].audio?.uri).toBe("https://cdn.test/user-1/a.wav?token=sig");
  });

  it("falls back to the server route when signing fails", async () => {
    storageMocks.kind = "s3";
    storageMocks.sign.mockRejectedValueOnce(new Error("credentials expired"));
    const out = (await resolveContentUrls(imageContent, "user-1")) as ImageBlock[];
    expect(out[0].image.uri).toBe("/api/storage/user-1/abc.png");
  });

  it("keeps the server route for the local file backend", async () => {
    storageMocks.kind = "file";
    const out = (await resolveContentUrls(imageContent, "user-1")) as ImageBlock[];
    expect(storageMocks.sign).not.toHaveBeenCalled();
    expect(out[0].image.uri).toBe("/api/storage/user-1/abc.png");
  });
});
