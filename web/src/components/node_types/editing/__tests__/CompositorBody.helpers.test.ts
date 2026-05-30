/**
 * @jest-environment node
 */
import {
  asImageRef,
  resolveImageUrl,
  sortImageKeys,
  nextImageIndex
} from "../CompositorBody.helpers";

describe("asImageRef", () => {
  it("returns undefined for null/undefined/primitives", () => {
    expect(asImageRef(null)).toBeUndefined();
    expect(asImageRef(undefined)).toBeUndefined();
    expect(asImageRef(42)).toBeUndefined();
    expect(asImageRef("string")).toBeUndefined();
    expect(asImageRef(true)).toBeUndefined();
  });

  it("extracts uri, width, height, data from a valid object", () => {
    const result = asImageRef({ uri: "test.png", width: 100, height: 200, data: "abc" });
    expect(result).toEqual({ uri: "test.png", width: 100, height: 200, data: "abc" });
  });

  it("returns undefined fields for missing or wrong-typed properties", () => {
    const result = asImageRef({ uri: 123, width: "bad", height: null });
    expect(result).toEqual({ uri: undefined, width: undefined, height: undefined, data: undefined });
  });

  it("preserves data of any type", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = asImageRef({ data: bytes });
    expect(result?.data).toBe(bytes);
  });
});

describe("resolveImageUrl", () => {
  it("returns undefined for undefined input", () => {
    expect(resolveImageUrl(undefined)).toBeUndefined();
  });

  it("returns uri when present", () => {
    expect(resolveImageUrl({ uri: "http://example.com/img.png" })).toBe("http://example.com/img.png");
  });

  it("returns data: string as-is", () => {
    expect(resolveImageUrl({ data: "data:image/png;base64,abc" })).toBe("data:image/png;base64,abc");
  });

  it("returns blob: string as-is", () => {
    expect(resolveImageUrl({ data: "blob:http://localhost/abc" })).toBe("blob:http://localhost/abc");
  });

  it("returns http string as-is", () => {
    expect(resolveImageUrl({ data: "https://example.com/img.png" })).toBe("https://example.com/img.png");
  });

  it("wraps raw base64 string in data URI", () => {
    expect(resolveImageUrl({ data: "iVBOR" })).toBe("data:image/png;base64,iVBOR");
  });

  it("converts Uint8Array to base64 data URI", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const result = resolveImageUrl({ data: bytes });
    expect(result).toBe(`data:image/png;base64,${btoa("Hello")}`);
  });

  it("prefers uri over data", () => {
    expect(resolveImageUrl({ uri: "u.png", data: "d.png" })).toBe("u.png");
  });

  it("returns undefined when no uri or data", () => {
    expect(resolveImageUrl({ width: 100 })).toBeUndefined();
  });
});

describe("sortImageKeys", () => {
  it("sorts by numeric suffix", () => {
    expect(sortImageKeys(["image_2", "image_0", "image_10", "image_1"])).toEqual([
      "image_0", "image_1", "image_2", "image_10"
    ]);
  });

  it("filters out non-image keys", () => {
    expect(sortImageKeys(["image_0", "other", "name", "image_1"])).toEqual(["image_0", "image_1"]);
  });

  it("returns empty for empty input", () => {
    expect(sortImageKeys([])).toEqual([]);
  });
});

describe("nextImageIndex", () => {
  it("returns 0 for empty array", () => {
    expect(nextImageIndex([])).toBe(0);
  });

  it("returns max + 1", () => {
    expect(nextImageIndex(["image_0", "image_3", "image_1"])).toBe(4);
  });

  it("ignores non-image keys", () => {
    expect(nextImageIndex(["other", "image_2"])).toBe(3);
  });
});
