import { describe, it, expect } from "vitest";
import {
  isWithinRoot,
  normalizeStorageKey,
  joinStorageKey,
  assetObjectKey,
  assetKeyCandidates,
  assetKeyOwner,
  RESERVED_KEY_PREFIXES
} from "../src/storage-keys.js";

describe("isWithinRoot", () => {
  it("returns true for exact root match", () => {
    expect(isWithinRoot("/data", "/data")).toBe(true);
  });

  it("returns true for a child path", () => {
    expect(isWithinRoot("/data", "/data/file.txt")).toBe(true);
  });

  it("returns true for a nested child", () => {
    expect(isWithinRoot("/data", "/data/sub/dir/file.txt")).toBe(true);
  });

  it("returns false for a parent traversal", () => {
    expect(isWithinRoot("/data/uploads", "/data")).toBe(false);
  });

  it("returns false for a sibling directory", () => {
    expect(isWithinRoot("/data/uploads", "/data/secrets")).toBe(false);
  });

  it("returns false for path-traversal via ..", () => {
    expect(isWithinRoot("/data", "/data/../etc/passwd")).toBe(false);
  });
});

describe("normalizeStorageKey", () => {
  it("strips leading slashes", () => {
    expect(normalizeStorageKey("/foo/bar.txt")).toBe("foo/bar.txt");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(normalizeStorageKey("foo\\bar\\baz.txt")).toBe("foo/bar/baz.txt");
  });

  it("rejects empty key", () => {
    expect(() => normalizeStorageKey("")).toThrow("Invalid storage key");
  });

  it("rejects '..'", () => {
    expect(() => normalizeStorageKey("..")).toThrow("Invalid storage key");
  });

  it("rejects '../' traversal", () => {
    expect(() => normalizeStorageKey("../secret")).toThrow("Invalid storage key");
  });

  it("rejects '.' (current directory)", () => {
    expect(() => normalizeStorageKey(".")).toThrow("Invalid storage key");
  });

  it("accepts a simple filename", () => {
    expect(normalizeStorageKey("file.txt")).toBe("file.txt");
  });

  it("accepts nested paths", () => {
    expect(normalizeStorageKey("a/b/c.txt")).toBe("a/b/c.txt");
  });
});

describe("joinStorageKey", () => {
  it("joins prefix and key", () => {
    expect(joinStorageKey("uploads", "file.txt")).toBe("uploads/file.txt");
  });

  it("returns key alone when prefix is undefined", () => {
    expect(joinStorageKey(undefined, "file.txt")).toBe("file.txt");
  });

  it("returns key alone when prefix is empty", () => {
    expect(joinStorageKey("", "file.txt")).toBe("file.txt");
  });

  it("normalizes prefix and key", () => {
    expect(joinStorageKey("/uploads", "/sub/file.txt")).toBe(
      "uploads/sub/file.txt"
    );
  });

  it("rejects traversal in key", () => {
    expect(() => joinStorageKey("uploads", "../secret")).toThrow(
      "Invalid storage key"
    );
  });

  it("rejects traversal in prefix", () => {
    expect(() => joinStorageKey("../etc", "passwd")).toThrow(
      "Invalid storage key"
    );
  });
});

describe("assetObjectKey", () => {
  it("prefixes the file name with the owner", () => {
    expect(assetObjectKey("user-1", "abc.png")).toBe("user-1/abc.png");
  });

  it("rejects a userId that would escape its own prefix", () => {
    expect(() => assetObjectKey("a/b", "abc.png")).toThrow("Invalid userId");
    expect(() => assetObjectKey("a\\b", "abc.png")).toThrow("Invalid userId");
  });

  it("rejects an empty userId", () => {
    expect(() => assetObjectKey("", "abc.png")).toThrow("userId is required");
  });

  it("rejects a userId colliding with a runtime prefix", () => {
    for (const reserved of RESERVED_KEY_PREFIXES) {
      expect(() => assetObjectKey(reserved, "abc.png")).toThrow("reserved");
    }
  });

  it("still rejects traversal in the file name", () => {
    expect(() => assetObjectKey("user-1", "../secret")).toThrow(
      "Invalid storage key"
    );
  });
});

describe("assetKeyCandidates", () => {
  it("prefers the owner-prefixed key over the legacy flat key", () => {
    expect(assetKeyCandidates("user-1", "abc.png")).toEqual([
      "user-1/abc.png",
      "abc.png"
    ]);
  });
});

describe("assetKeyOwner", () => {
  it("reads the owner from a prefixed key", () => {
    expect(assetKeyOwner("user-1/abc.png")).toBe("user-1");
    expect(assetKeyOwner("user-1/nested/abc.png")).toBe("user-1");
  });

  it("returns null for a legacy flat key", () => {
    expect(assetKeyOwner("abc.png")).toBeNull();
  });

  it("ignores a leading slash rather than reporting an empty owner", () => {
    expect(assetKeyOwner("/abc.png")).toBeNull();
  });
});
