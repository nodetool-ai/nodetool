import { describe, it, expect } from "vitest";
import {
  isWithinRoot,
  normalizeStorageKey,
  joinStorageKey,
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
