/**
 * Tests for `nodetool storage refresh-cache-control`: objects stored without
 * the upload Cache-Control are written back with it, under the same key and
 * content type, and objects that already carry it are left alone.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface StoredObject {
  bytes: Uint8Array;
  contentType?: string;
  cacheControl?: string;
}

const mocks = vi.hoisted(() => ({
  allForMigration: vi.fn(),
  objects: new Map<string, StoredObject>(),
  stores: [] as Array<{ key: string; contentType?: string }>,
  /** A key whose upload throws. */
  refuse: { key: "" }
}));

vi.mock("@nodetool-ai/models", () => ({
  Asset: { allForMigration: mocks.allForMigration }
}));

vi.mock("@nodetool-ai/config", async (orig) => ({
  ...(await orig<typeof import("@nodetool-ai/config")>()),
  loadAssetStorageConfig: () => ({ kind: "file", rootDir: "/tmp/assets" })
}));

vi.mock("@nodetool-ai/storage", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/storage")>();
  return {
    ...actual,
    createStorageAdapter: () => ({
      uriForKey: (key: string) => `mem://${key}`,
      stat: async (uri: string) => {
        const key = uri.slice(6);
        const object = mocks.objects.get(key);
        if (!object) return null;
        return {
          key,
          size: object.bytes.byteLength,
          modifiedAt: 0,
          contentType: object.contentType,
          cacheControl: object.cacheControl
        };
      },
      retrieve: async (uri: string) =>
        mocks.objects.get(uri.slice(6))?.bytes ?? null,
      store: async (key: string, bytes: Uint8Array, contentType?: string) => {
        if (key === mocks.refuse.key) throw new Error("upload refused");
        mocks.stores.push({ key, contentType });
        mocks.objects.set(key, {
          bytes,
          contentType,
          cacheControl: actual.objectCacheControl()
        });
        return `mem://${key}`;
      }
    })
  };
});

import { objectCacheControl } from "@nodetool-ai/storage";
import { refreshStorageCacheControl } from "../src/commands/storage-cache-control.js";

function asset(id: string, userId: string, contentType = "image/png") {
  return { id, user_id: userId, content_type: contentType };
}

beforeEach(() => {
  mocks.objects.clear();
  mocks.stores.length = 0;
  mocks.refuse.key = "";
  mocks.allForMigration.mockReset();
});

describe("refreshStorageCacheControl", () => {
  it("rewrites a no-cache object and its thumbnail with their content types", async () => {
    mocks.objects.set("user-1/a1.png", {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      cacheControl: "no-cache"
    });
    mocks.objects.set("user-1/a1_thumb.jpg", {
      bytes: new Uint8Array([4]),
      contentType: "image/jpeg",
      cacheControl: "no-cache"
    });
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    const report = await refreshStorageCacheControl();

    expect(report).toMatchObject({
      scanned: 2,
      refreshed: 2,
      current: 0,
      failed: 0,
      bytes: 4
    });
    expect(mocks.stores).toEqual(
      expect.arrayContaining([
        { key: "user-1/a1.png", contentType: "image/png" },
        { key: "user-1/a1_thumb.jpg", contentType: "image/jpeg" }
      ])
    );
    expect(mocks.objects.get("user-1/a1.png")?.bytes).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(mocks.objects.get("user-1/a1.png")?.cacheControl).toBe(
      objectCacheControl()
    );
  });

  it("skips objects that already carry the header, and counts absent thumbnails", async () => {
    mocks.objects.set("user-1/a1.png", {
      bytes: new Uint8Array([1]),
      contentType: "image/png",
      cacheControl: objectCacheControl()
    });
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    const report = await refreshStorageCacheControl();

    expect(report).toMatchObject({ current: 1, missing: 1, refreshed: 0 });
    expect(mocks.stores).toEqual([]);
  });

  it("writes nothing on a dry run but reports the bytes it would move", async () => {
    mocks.objects.set("user-1/a1.png", {
      bytes: new Uint8Array([1, 2]),
      contentType: "image/png",
      cacheControl: "no-cache"
    });
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    const report = await refreshStorageCacheControl({ dryRun: true });

    expect(report).toMatchObject({ refreshed: 1, bytes: 2 });
    expect(mocks.stores).toEqual([]);
  });

  it("skips folders and records a failing object without stopping", async () => {
    mocks.objects.set("user-1/a1.png", {
      bytes: new Uint8Array([1]),
      contentType: "image/png",
      cacheControl: "no-cache"
    });
    mocks.allForMigration.mockResolvedValue([
      asset("f1", "user-1", "folder"),
      asset("a1", "user-1")
    ]);
    mocks.refuse.key = "user-1/a1.png";

    const report = await refreshStorageCacheControl({ concurrency: 1 });

    expect(report.scanned).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.failures).toEqual([
      { key: "user-1/a1.png", error: "upload refused" }
    ]);
  });
});
