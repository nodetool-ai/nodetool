/**
 * @jest-environment node
 */
import {
  resolveHistoryUri,
  normalizeHistoryResultUris
} from "../useNodeResultHistory";

describe("resolveHistoryUri", () => {
  it("converts asset:// URIs to API storage paths", () => {
    expect(resolveHistoryUri("asset://abc-123")).toBe("/api/storage/abc-123");
  });

  it("returns null for memory:// URIs", () => {
    expect(resolveHistoryUri("memory://something")).toBeNull();
  });

  it("returns HTTP URLs unchanged", () => {
    expect(resolveHistoryUri("http://example.com/img.png")).toBe(
      "http://example.com/img.png"
    );
  });

  it("returns HTTPS URLs unchanged", () => {
    expect(resolveHistoryUri("https://cdn.example.com/file")).toBe(
      "https://cdn.example.com/file"
    );
  });

  it("returns other URIs unchanged", () => {
    expect(resolveHistoryUri("blob:http://localhost/foo")).toBe(
      "blob:http://localhost/foo"
    );
  });

  it("handles asset:// with empty id", () => {
    expect(resolveHistoryUri("asset://")).toBe("/api/storage/");
  });
});

describe("normalizeHistoryResultUris", () => {
  it("resolves a top-level uri field", () => {
    const result = normalizeHistoryResultUris({ uri: "asset://abc" });
    expect(result).toEqual({ uri: "/api/storage/abc" });
  });

  it("drops entries with memory:// URIs", () => {
    const result = normalizeHistoryResultUris({ uri: "memory://tmp" });
    expect(result).toEqual({});
  });

  it("preserves non-uri fields", () => {
    const result = normalizeHistoryResultUris({
      uri: "https://cdn.example.com/img.png",
      name: "test",
      size: 42
    });
    expect(result).toEqual({
      uri: "https://cdn.example.com/img.png",
      name: "test",
      size: 42
    });
  });

  it("recursively normalizes nested objects", () => {
    const result = normalizeHistoryResultUris({
      image: { uri: "asset://nested-id", width: 100 }
    });
    expect(result).toEqual({
      image: { uri: "/api/storage/nested-id", width: 100 }
    });
  });

  it("recursively normalizes arrays", () => {
    const result = normalizeHistoryResultUris([
      { uri: "asset://a" },
      { uri: "asset://b" }
    ]);
    expect(result).toEqual([
      { uri: "/api/storage/a" },
      { uri: "/api/storage/b" }
    ]);
  });

  it("handles deeply nested mixed structures", () => {
    const result = normalizeHistoryResultUris({
      results: [
        { audio: { uri: "memory://volatile", duration: 3 } },
        { audio: { uri: "asset://audio-1", duration: 5 } }
      ]
    });
    expect(result).toEqual({
      results: [
        { audio: { duration: 3 } },
        { audio: { uri: "/api/storage/audio-1", duration: 5 } }
      ]
    });
  });

  it("passes primitives through unchanged", () => {
    expect(normalizeHistoryResultUris(42)).toBe(42);
    expect(normalizeHistoryResultUris("hello")).toBe("hello");
    expect(normalizeHistoryResultUris(null)).toBeNull();
    expect(normalizeHistoryResultUris(undefined)).toBeUndefined();
    expect(normalizeHistoryResultUris(true)).toBe(true);
  });

  it("handles empty objects and arrays", () => {
    expect(normalizeHistoryResultUris({})).toEqual({});
    expect(normalizeHistoryResultUris([])).toEqual([]);
  });
});
