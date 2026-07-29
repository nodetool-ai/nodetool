import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockFilesCreate = vi.fn();

vi.mock("replicate", () => ({
  default: class {
    files = { create: mockFilesCreate };
  }
}));

import {
  getReplicateApiKey,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "../src/replicate-base.js";

/* ------------------------------------------------------------------ */
/*  Environment setup                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  delete process.env.REPLICATE_API_TOKEN;
});

afterEach(() => {
  delete process.env.REPLICATE_API_TOKEN;
});

/* ================================================================== */
/*  getReplicateApiKey                                                  */
/* ================================================================== */

describe("getReplicateApiKey", () => {
  it("returns key from secrets.REPLICATE_API_TOKEN", () => {
    const key = getReplicateApiKey({
      REPLICATE_API_TOKEN: "secret-from-secrets"
    });
    expect(key).toBe("secret-from-secrets");
  });

  it("returns key from process.env.REPLICATE_API_TOKEN", () => {
    process.env.REPLICATE_API_TOKEN = "secret-from-env";
    const key = getReplicateApiKey({});
    expect(key).toBe("secret-from-env");
  });

  it("prefers secrets over process.env", () => {
    process.env.REPLICATE_API_TOKEN = "env-key";
    const key = getReplicateApiKey({
      REPLICATE_API_TOKEN: "secrets-key"
    });
    expect(key).toBe("secrets-key");
  });

  it("throws when no key available", () => {
    expect(() => getReplicateApiKey({})).toThrow(
      "REPLICATE_API_TOKEN is not configured"
    );
  });

  it("throws when secrets.REPLICATE_API_TOKEN is empty string", () => {
    expect(() => getReplicateApiKey({ REPLICATE_API_TOKEN: "" })).toThrow(
      "REPLICATE_API_TOKEN is not configured"
    );
  });
});

/* ================================================================== */
/*  removeNulls                                                         */
/* ================================================================== */

describe("removeNulls", () => {
  it("removes null values from top-level keys", () => {
    const obj: Record<string, unknown> = { a: 1, b: null, c: "hello" };
    removeNulls(obj);
    expect(obj).toEqual({ a: 1, c: "hello" });
    expect("b" in obj).toBe(false);
  });

  it("removes undefined values from top-level keys", () => {
    const obj: Record<string, unknown> = { a: 1, b: undefined };
    removeNulls(obj);
    expect(obj).toEqual({ a: 1 });
    expect("b" in obj).toBe(false);
  });

  it("does not recurse into nested objects (preserves pass-through dicts)", () => {
    const obj: Record<string, unknown> = {
      a: 1,
      nested: { x: "keep", y: null, z: "" }
    };
    removeNulls(obj);
    expect(obj.a).toBe(1);
    // Nested values are left untouched — dict[...] inputs must keep their shape.
    expect(obj.nested).toEqual({ x: "keep", y: null, z: "" });
  });

  it("keeps zero and false values", () => {
    const obj: Record<string, unknown> = { a: 0, b: false };
    removeNulls(obj);
    expect(obj).toEqual({ a: 0, b: false });
  });

  it("removes empty strings", () => {
    const obj: Record<string, unknown> = { a: "keep", b: "", c: 1 };
    removeNulls(obj);
    expect(obj).toEqual({ a: "keep", c: 1 });
    expect("b" in obj).toBe(false);
  });

  it("does not recurse into arrays", () => {
    const obj: Record<string, unknown> = { arr: [null, 1, 2] };
    removeNulls(obj);
    expect(obj.arr).toEqual([null, 1, 2]);
  });

  it("handles empty object without throwing", () => {
    const obj: Record<string, unknown> = {};
    expect(() => removeNulls(obj)).not.toThrow();
    expect(obj).toEqual({});
  });
});

/* ================================================================== */
/*  isRefSet                                                            */
/* ================================================================== */

describe("isRefSet", () => {
  it("returns false for null", () => expect(isRefSet(null)).toBe(false));
  it("returns false for undefined", () =>
    expect(isRefSet(undefined)).toBe(false));
  it("returns false for empty object", () => expect(isRefSet({})).toBe(false));
  it("returns false for non-object (string)", () =>
    expect(isRefSet("hello")).toBe(false));
  it("returns true for { data: 'abc' }", () =>
    expect(isRefSet({ data: "abc" })).toBe(true));
  it("returns true for { uri: 'https://...' }", () =>
    expect(isRefSet({ uri: "https://example.com/img.png" })).toBe(true));
  it("returns true for asset_id-only refs (resolved via the context)", () =>
    expect(isRefSet({ asset_id: "123" })).toBe(true));
  it("returns false for a null asset_id", () =>
    expect(isRefSet({ uri: "", data: null, asset_id: null })).toBe(false));
  it("returns false for an empty-string asset_id", () =>
    expect(isRefSet({ asset_id: "" })).toBe(false));
});

/* ================================================================== */
/*  assetToUrl                                                          */
/* ================================================================== */

describe("assetToUrl", () => {
  it("returns uri when present", async () => {
    expect(await assetToUrl({ uri: "https://example.com/img.png" })).toBe(
      "https://example.com/img.png"
    );
  });

  it("returns data URL when data is present", async () => {
    const b64 = Buffer.from("fake-image").toString("base64");
    const url = await assetToUrl({ data: b64, type: "image" });
    expect(url).toBe(`data:image/png;base64,${b64}`);
  });

  it("returns null when no uri and no data", async () => {
    expect(await assetToUrl({})).toBeNull();
  });

  it("prefers uri over data", async () => {
    expect(await assetToUrl({ uri: "https://x.com/a.png", data: "abc" })).toBe(
      "https://x.com/a.png"
    );
  });

  it("passes through replicate delivery URLs", async () => {
    const url = "https://replicate.delivery/xezq/abc/img.webp";
    expect(await assetToUrl({ uri: url })).toBe(url);
  });

  it("passes through data URIs", async () => {
    const dataUri = "data:image/png;base64,abc123";
    expect(await assetToUrl({ uri: dataUri })).toBe(dataUri);
  });

  it("resolves asset:// refs via context.resolveAssetBytes and uploads them", async () => {
    mockFilesCreate.mockResolvedValueOnce({
      urls: { get: "https://replicate.delivery/uploaded/asset-123.png" }
    });

    const ctx = {
      storage: { retrieve: vi.fn().mockResolvedValue(null) },
      resolveAssetBytes: vi
        .fn()
        .mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]) })
    };

    const result = await assetToUrl(
      { type: "image", uri: "asset://asset-123" },
      "api-key",
      ctx
    );

    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123");
    expect(result).toBe("https://replicate.delivery/uploaded/asset-123.png");
    expect(result).not.toBe("asset://asset-123");
  });

  it("resolves an asset_id-only ref (empty uri) via context.resolveAssetBytes", async () => {
    mockFilesCreate.mockResolvedValueOnce({
      urls: { get: "https://replicate.delivery/uploaded/asset-456.png" }
    });

    const ctx = {
      storage: { retrieve: vi.fn().mockResolvedValue(null) },
      resolveAssetBytes: vi
        .fn()
        .mockResolvedValue({ bytes: Uint8Array.from([137, 80, 78, 71]) })
    };

    const result = await assetToUrl(
      { type: "image", uri: "", asset_id: "asset-456" },
      "api-key",
      ctx
    );

    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-456");
    expect(result).toBe("https://replicate.delivery/uploaded/asset-456.png");
  });
});

/* ================================================================== */
/*  Output converters                                                   */
/* ================================================================== */

describe("outputToImageRef", () => {
  it("extracts URL from string output", () => {
    expect(outputToImageRef("https://replicate.com/img.png")).toEqual({
      type: "image",
      uri: "https://replicate.com/img.png"
    });
  });

  it("extracts first URL from array output", () => {
    expect(
      outputToImageRef([
        "https://replicate.com/img1.png",
        "https://replicate.com/img2.png"
      ])
    ).toEqual({
      type: "image",
      uri: "https://replicate.com/img1.png"
    });
  });

  it("returns ref without uri for null output", () => {
    expect(outputToImageRef(null)).toEqual({ type: "image" });
  });

  it("extracts URL from object with url field", () => {
    expect(outputToImageRef({ url: "https://replicate.com/img.png" })).toEqual({
      type: "image",
      uri: "https://replicate.com/img.png"
    });
  });

  it("extracts URL from object with a named asset field", () => {
    expect(
      outputToImageRef({ image: "https://replicate.com/img.png" })
    ).toEqual({ type: "image", uri: "https://replicate.com/img.png" });
  });

  it("extracts URL from a nested FileOutput-like object", () => {
    expect(
      outputToImageRef({ output: { url: "https://replicate.com/img.png" } })
    ).toEqual({ type: "image", uri: "https://replicate.com/img.png" });
  });

  it("ignores non-URL string fields when scanning objects", () => {
    expect(
      outputToImageRef({
        status: "succeeded",
        image: "https://replicate.com/img.png"
      })
    ).toEqual({ type: "image", uri: "https://replicate.com/img.png" });
  });
});

describe("outputToVideoRef", () => {
  it("extracts URL from string output", () => {
    expect(outputToVideoRef("https://replicate.com/vid.mp4")).toEqual({
      type: "video",
      uri: "https://replicate.com/vid.mp4"
    });
  });

  it("returns ref without uri for null output", () => {
    expect(outputToVideoRef(null)).toEqual({ type: "video" });
  });
});

describe("outputToAudioRef", () => {
  it("extracts URL from string output", () => {
    expect(outputToAudioRef("https://replicate.com/audio.wav")).toEqual({
      type: "audio",
      uri: "https://replicate.com/audio.wav"
    });
  });

  it("returns ref without uri for null output", () => {
    expect(outputToAudioRef(null)).toEqual({ type: "audio" });
  });
});

describe("outputToString", () => {
  it("returns string output as-is", () => {
    expect(outputToString("hello world")).toBe("hello world");
  });

  it("joins array output", () => {
    expect(outputToString(["hello", " ", "world"])).toBe("hello world");
  });

  it("returns empty string for null", () => {
    expect(outputToString(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(outputToString(undefined)).toBe("");
  });

  it("JSON-stringifies object output", () => {
    expect(outputToString({ key: "value" })).toBe('{"key":"value"}');
  });
});
