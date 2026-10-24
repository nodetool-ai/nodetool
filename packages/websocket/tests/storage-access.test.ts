/**
 * Unit tests for the `/api/storage/<key>` ownership rules. The REST handler and
 * tRPC router tests cover how these are applied; these cover the helpers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findAsset = vi.fn();
vi.mock("@nodetool-ai/models", () => ({
  Asset: { find: (...args: unknown[]) => findAsset(...args) }
}));
const isAssetIdShared = vi.fn();
vi.mock("../src/lib/document-access.js", () => ({
  isAssetIdSharedWithUser: (...args: unknown[]) => isAssetIdShared(...args)
}));

import {
  assetIdFromKey,
  callerOwnsStorageKey,
  canReadStorageKey,
  isRuntimeScratchKey
} from "../src/lib/storage-access.js";

const SHARED_ID = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  findAsset.mockReset();
  isAssetIdShared.mockReset();
  isAssetIdShared.mockResolvedValue(false);
});

describe("assetIdFromKey", () => {
  it.each([
    ["abc123.png", "abc123"],
    ["abc123_thumb.jpg", "abc123"],
    ["abc123_proxy.mp4", "abc123"],
    ["abc123", "abc123"],
    ["nested/dir/abc123.png", "abc123"],
    ["nested\\dir\\abc123.png", "abc123"]
  ])("maps %s to %s", (key, expected) => {
    expect(assetIdFromKey(key)).toBe(expected);
  });

  it("returns null when no id remains", () => {
    expect(assetIdFromKey("")).toBeNull();
    expect(assetIdFromKey(".png")).toBeNull();
  });
});

describe("isRuntimeScratchKey", () => {
  it.each(["temp/x.png", "assets/x.bin", "/temp/x.png", "temp/nested/x.png"])(
    "recognises %s",
    (key) => {
      expect(isRuntimeScratchKey(key)).toBe(true);
    }
  );

  it.each(["x.png", "tempx/x.png", "assetsy/x.png", "a/temp/x.png"])(
    "does not recognise %s",
    (key) => {
      expect(isRuntimeScratchKey(key)).toBe(false);
    }
  );
});

describe("callerOwnsStorageKey", () => {
  it("grants the owner", async () => {
    findAsset.mockResolvedValue({ id: "abc", user_id: "user-a" });
    await expect(callerOwnsStorageKey("user-a", "abc.png")).resolves.toBe(true);
    expect(findAsset).toHaveBeenCalledWith("user-a", "abc");
  });

  it("denies when the asset is not the caller's", async () => {
    findAsset.mockResolvedValue(null);
    await expect(callerOwnsStorageKey("user-b", "abc.png")).resolves.toBe(
      false
    );
  });

  it("scopes a thumbnail to the underlying asset", async () => {
    findAsset.mockResolvedValue({ id: "abc", user_id: "user-a" });
    await expect(
      callerOwnsStorageKey("user-a", "abc_thumb.jpg")
    ).resolves.toBe(true);
    expect(findAsset).toHaveBeenCalledWith("user-a", "abc");
  });

  it("fails closed when the lookup throws", async () => {
    findAsset.mockRejectedValue(new Error("db down"));
    await expect(callerOwnsStorageKey("user-a", "abc.png")).resolves.toBe(
      false
    );
  });

  it("fails closed for a key with no derivable id", async () => {
    await expect(callerOwnsStorageKey("user-a", "")).resolves.toBe(false);
    expect(findAsset).not.toHaveBeenCalled();
  });
});

describe("canReadStorageKey", () => {
  it("allows runtime scratch keys without a lookup", async () => {
    await expect(canReadStorageKey("anyone", "temp/x.png")).resolves.toBe(true);
    expect(findAsset).not.toHaveBeenCalled();
  });

  it("settles an owner-prefixed key from the prefix alone", async () => {
    await expect(
      canReadStorageKey("user-a", "user-a/abc.png")
    ).resolves.toBe(true);
    expect(findAsset).not.toHaveBeenCalled();
  });

  it("denies another owner's prefix even when the asset row would match", async () => {
    // A stale/permissive row must not override the prefix — the prefix is the
    // same boundary the bucket policy enforces on the object itself.
    findAsset.mockResolvedValue({ id: "abc", user_id: "user-b" });
    await expect(
      canReadStorageKey("user-b", "user-a/abc.png")
    ).resolves.toBe(false);
  });

  it("does not treat a prefix match as a substring match", async () => {
    await expect(
      canReadStorageKey("user-a", "user-abc/abc.png")
    ).resolves.toBe(false);
  });

  it("falls back to the asset row for legacy flat keys", async () => {
    findAsset.mockResolvedValue({ id: "abc", user_id: "user-a" });
    await expect(canReadStorageKey("user-a", "abc.png")).resolves.toBe(true);
    expect(findAsset).toHaveBeenCalledWith("user-a", "abc");
  });

  it("allows another owner's key when a document shared with the caller shows the asset", async () => {
    isAssetIdShared.mockResolvedValue(true);
    findAsset.mockResolvedValue({ id: SHARED_ID, user_id: "user-a" });
    await expect(
      canReadStorageKey("user-b", `user-a/${SHARED_ID}_thumb.jpg`)
    ).resolves.toBe(true);
    expect(isAssetIdShared).toHaveBeenCalledWith("user-b", "user-a", SHARED_ID);
    expect(findAsset).toHaveBeenCalledWith("user-a", SHARED_ID);
  });

  it("denies another owner's key when no shared document shows the asset", async () => {
    findAsset.mockResolvedValue({ id: SHARED_ID, user_id: "user-a" });
    await expect(
      canReadStorageKey("user-b", `user-a/${SHARED_ID}.png`)
    ).resolves.toBe(false);
    expect(findAsset).not.toHaveBeenCalled();
  });

  it("denies a shared asset whose row is gone", async () => {
    isAssetIdShared.mockResolvedValue(true);
    findAsset.mockResolvedValue(null);
    await expect(
      canReadStorageKey("user-b", `user-a/${SHARED_ID}.png`)
    ).resolves.toBe(false);
  });

  it("does not extend sharing to nested keys or short ids", async () => {
    isAssetIdShared.mockResolvedValue(true);
    findAsset.mockResolvedValue({ id: SHARED_ID, user_id: "user-a" });
    await expect(
      canReadStorageKey("user-b", `user-a/other/${SHARED_ID}.png`)
    ).resolves.toBe(false);
    await expect(
      canReadStorageKey("user-b", `user-a/${SHARED_ID.slice(0, 12)}.png`)
    ).resolves.toBe(false);
    expect(isAssetIdShared).not.toHaveBeenCalled();
  });

  it("fails closed when the sharing lookup throws", async () => {
    isAssetIdShared.mockRejectedValue(new Error("db down"));
    await expect(
      canReadStorageKey("user-b", `user-a/${SHARED_ID}.png`)
    ).resolves.toBe(false);
  });

  it("requires ownership for legacy flat keys", async () => {
    findAsset.mockResolvedValue(null);
    await expect(canReadStorageKey("user-b", "abc.png")).resolves.toBe(false);
  });
});
