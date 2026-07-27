/**
 * Unit tests for the `/api/storage/<key>` ownership rules. The REST handler and
 * tRPC router tests cover how these are applied; these cover the helpers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findAsset = vi.fn();
vi.mock("@nodetool-ai/models", () => ({
  Asset: { find: (...args: unknown[]) => findAsset(...args) }
}));

import {
  assetIdFromKey,
  callerOwnsStorageKey,
  canReadStorageKey,
  isRuntimeScratchKey
} from "../src/lib/storage-access.js";

beforeEach(() => {
  findAsset.mockReset();
});

describe("assetIdFromKey", () => {
  it.each([
    ["abc123.png", "abc123"],
    ["abc123_thumb.jpg", "abc123"],
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

  it("requires ownership for asset keys", async () => {
    findAsset.mockResolvedValue(null);
    await expect(canReadStorageKey("user-b", "abc.png")).resolves.toBe(false);
  });
});
