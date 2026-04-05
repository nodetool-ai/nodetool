import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
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

  it("removes null values from nested objects", () => {
    const obj: Record<string, unknown> = {
      a: 1,
      nested: { x: "keep", y: null, z: undefined }
    };
    removeNulls(obj);
    expect(obj.a).toBe(1);
    expect((obj.nested as Record<string, unknown>).x).toBe("keep");
    expect("y" in (obj.nested as Record<string, unknown>)).toBe(false);
    expect("z" in (obj.nested as Record<string, unknown>)).toBe(false);
  });

  it("removes zero values but keeps false", () => {
    const obj: Record<string, unknown> = { a: 0, b: false };
    removeNulls(obj);
    expect(obj).toEqual({ b: false });
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
  it("returns true for { asset_id: '123' }", () =>
    expect(isRefSet({ asset_id: "123" })).toBe(true));
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
