/**
 * `toAssetResponse` passes the row's `updated_at` to the URL builder for both
 * the file and its thumbnail, so an unchanged asset keeps the signed URL the
 * browser already cached, and an edited one gets a new URL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Asset } from "@nodetool-ai/models";

const storageMocks = vi.hoisted(() => ({
  sign: vi.fn(
    async (key: string, version?: string) =>
      `https://cdn.test/${key}?v=${version ?? "none"}`
  )
}));

vi.mock("@nodetool-ai/config", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    loadAssetStorageConfig: () => ({ kind: "supabase" })
  };
});

vi.mock("@nodetool-ai/storage", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/storage")>();
  return {
    ...actual,
    createAssetUrlBuilder: () => storageMocks.sign
  };
});

import { toAssetResponse } from "../src/lib/asset-response.js";

function imageAsset(updatedAt: string): Asset {
  // Safety: toAssetResponse reads only these row fields.
  return {
    id: "a1",
    user_id: "u1",
    name: "photo.png",
    content_type: "image/png",
    parent_id: "u1",
    project_id: "p1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: updatedAt,
    favorite: false
  } as unknown as Asset;
}

describe("toAssetResponse URL versioning", () => {
  beforeEach(() => {
    storageMocks.sign.mockClear();
  });

  it("versions the file and thumbnail URLs with updated_at", async () => {
    const response = await toAssetResponse(imageAsset("2026-10-05T10:00:00Z"));
    expect(storageMocks.sign).toHaveBeenCalledTimes(2);
    for (const [, version] of storageMocks.sign.mock.calls) {
      expect(version).toBe("2026-10-05T10:00:00Z");
    }
    expect(response.get_url).toBe(
      "https://cdn.test/u1/a1.png?v=2026-10-05T10:00:00Z"
    );
    expect(response.thumb_url).toContain("v=2026-10-05T10:00:00Z");
  });
});
