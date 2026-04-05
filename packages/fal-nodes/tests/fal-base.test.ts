import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getFalApiKey,
  removeNulls,
  isRefSet,
  inferContentType,
  falSubmit,
  falUpload,
  assetToFalUrl,
  imageToDataUrl
} from "../src/fal-base.js";

/* ------------------------------------------------------------------ */
/*  Mock @fal-ai/client SDK                                            */
/* ------------------------------------------------------------------ */

const mockSubscribe = vi.fn();
const mockStorageUpload = vi.fn();

vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    subscribe: mockSubscribe,
    storage: { upload: mockStorageUpload }
  }))
}));

/* ------------------------------------------------------------------ */
/*  Fetch mock for imageToDataUrl / assetToFalUrl fallback paths       */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  mockSubscribe.mockReset();
  mockStorageUpload.mockReset();
  delete process.env.FAL_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.FAL_API_KEY;
});

/* ================================================================== */
/*  getFalApiKey                                                        */
/* ================================================================== */

describe("getFalApiKey", () => {
  it("returns key from secrets.FAL_API_KEY", () => {
    const key = getFalApiKey({ FAL_API_KEY: "secret-from-secrets" });
    expect(key).toBe("secret-from-secrets");
  });

  it("returns key from process.env.FAL_API_KEY", () => {
    process.env.FAL_API_KEY = "secret-from-env";
    const key = getFalApiKey({});
    expect(key).toBe("secret-from-env");
  });

  it("prefers secrets over process.env", () => {
    process.env.FAL_API_KEY = "env-key";
    const key = getFalApiKey({ FAL_API_KEY: "secrets-key" });
    expect(key).toBe("secrets-key");
  });

  it("throws when no key available", () => {
    expect(() => getFalApiKey({})).toThrow("FAL_API_KEY is not configured");
  });

  it("throws when secrets.FAL_API_KEY is empty string", () => {
    expect(() => getFalApiKey({ FAL_API_KEY: "" })).toThrow(
      "FAL_API_KEY is not configured"
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

  it("does not remove falsy non-null values (0, false)", () => {
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
  it("returns false for non-object (number)", () =>
    expect(isRefSet(42)).toBe(false));
  it("returns false for non-object (boolean)", () =>
    expect(isRefSet(true)).toBe(false));
  it("returns true for { data: 'abc' }", () =>
    expect(isRefSet({ data: "abc" })).toBe(true));
  it("returns true for { uri: 'https://...' }", () =>
    expect(isRefSet({ uri: "https://example.com/img.png" })).toBe(true));
  it("returns true for { asset_id: '123' }", () =>
    expect(isRefSet({ asset_id: "123" })).toBe(true));
  it("returns true for object with all three fields", () =>
    expect(
      isRefSet({ data: "abc", uri: "https://x.com", asset_id: "id" })
    ).toBe(true));
});

/* ================================================================== */
/*  inferContentType                                                    */
/* ================================================================== */

describe("inferContentType", () => {
  it("returns image/png for 'image'", () =>
    expect(inferContentType("image")).toBe("image/png"));
  it("returns video/mp4 for 'video'", () =>
    expect(inferContentType("video")).toBe("video/mp4"));
  it("returns audio/wav for 'audio'", () =>
    expect(inferContentType("audio")).toBe("audio/wav"));
  it("returns application/octet-stream for unknown", () =>
    expect(inferContentType("document")).toBe("application/octet-stream"));
  it("returns application/octet-stream for undefined", () =>
    expect(inferContentType(undefined)).toBe("application/octet-stream"));
  it("returns application/octet-stream for empty string", () =>
    expect(inferContentType("")).toBe("application/octet-stream"));
});

/* ================================================================== */
/*  falSubmit (uses SDK client.subscribe)                               */
/* ================================================================== */

describe("falSubmit", () => {
  const apiKey = "test-fal-key";
  const endpoint = "fal-ai/flux/dev";
  const args = { prompt: "a beautiful sunset" };

  it("returns result.data from SDK subscribe", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [{ url: "https://fal.media/result.png" }] },
      requestId: "req_123"
    });

    const result = await falSubmit(apiKey, endpoint, args);
    expect(result).toEqual({
      images: [{ url: "https://fal.media/result.png" }]
    });
    expect(mockSubscribe).toHaveBeenCalledWith(endpoint, {
      input: args,
      logs: true
    });
  });

  it("falls back to result itself when data is missing", async () => {
    mockSubscribe.mockResolvedValueOnce({
      images: [{ url: "https://fal.media/result.png" }]
    });

    const result = await falSubmit(apiKey, endpoint, args);
    expect(result).toEqual({
      images: [{ url: "https://fal.media/result.png" }]
    });
  });

  it("propagates SDK errors", async () => {
    mockSubscribe.mockRejectedValueOnce(new Error("API error: 422"));
    await expect(falSubmit(apiKey, endpoint, args)).rejects.toThrow(
      "API error: 422"
    );
  });
});

/* ================================================================== */
/*  falUpload (uses SDK client.storage.upload)                          */
/* ================================================================== */

describe("falUpload", () => {
  const apiKey = "test-fal-key";
  const data = new Uint8Array([1, 2, 3, 4]);
  const contentType = "image/png";

  it("returns URL from SDK storage.upload", async () => {
    mockStorageUpload.mockResolvedValueOnce(
      "https://v3.fal.media/files/abc.png"
    );

    const url = await falUpload(apiKey, data, contentType);
    expect(url).toBe("https://v3.fal.media/files/abc.png");
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    // Verify a Blob was passed
    const blob = mockStorageUpload.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });

  it("propagates SDK upload errors", async () => {
    mockStorageUpload.mockRejectedValueOnce(new Error("upload failed"));
    await expect(falUpload(apiKey, data, contentType)).rejects.toThrow(
      "upload failed"
    );
  });
});

/* ================================================================== */
/*  assetToFalUrl                                                       */
/* ================================================================== */

describe("assetToFalUrl", () => {
  const apiKey = "test-fal-key";

  it("returns FAL CDN URI directly (no upload)", async () => {
    const url = await assetToFalUrl(apiKey, {
      uri: "https://v3.fal.media/files/abc.png"
    });
    expect(url).toBe("https://v3.fal.media/files/abc.png");
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("fetches and uploads external HTTPS URI to FAL CDN", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: new Headers({ "content-type": "image/png" })
    } as unknown as Response);
    mockStorageUpload.mockResolvedValueOnce(
      "https://v3.fal.media/files/uploaded.png"
    );

    const url = await assetToFalUrl(apiKey, {
      uri: "https://cdn.example.com/img.png"
    });
    expect(url).toBe("https://v3.fal.media/files/uploaded.png");
  });

  it("does not return localhost HTTPS URI directly", async () => {
    const url = await assetToFalUrl(apiKey, {
      uri: "https://localhost:8080/img.png"
    });
    expect(url).toBeNull();
  });

  it("uploads when data is present", async () => {
    const b64 = Buffer.from("fake-image-bytes").toString("base64");
    mockStorageUpload.mockResolvedValueOnce(
      "https://v3.fal.media/files/img.png"
    );

    const url = await assetToFalUrl(apiKey, { data: b64, type: "image" });
    expect(url).toBe("https://v3.fal.media/files/img.png");
  });

  it("returns null when no uri and no data", async () => {
    const url = await assetToFalUrl(apiKey, { type: "image" });
    expect(url).toBeNull();
  });

  it("fetches and uploads non-HTTPS URI", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([10, 20]).buffer,
      headers: new Headers({ "content-type": "image/jpeg" })
    } as unknown as Response);
    mockStorageUpload.mockResolvedValueOnce(
      "https://v3.fal.media/files/uploaded.jpg"
    );

    const url = await assetToFalUrl(apiKey, { uri: "http://local/img.jpg" });
    expect(url).toBe("https://v3.fal.media/files/uploaded.jpg");
  });
});

/* ================================================================== */
/*  imageToDataUrl                                                      */
/* ================================================================== */

describe("imageToDataUrl", () => {
  it("returns data URL from base64 data field", async () => {
    const b64 = Buffer.from("png-bytes").toString("base64");
    const url = await imageToDataUrl({ data: b64 });
    expect(url).toBe(`data:image/png;base64,${b64}`);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches and encodes HTTPS URI", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([10, 20, 30]).buffer,
      headers: { get: () => null }
    } as unknown as Response);

    const url = await imageToDataUrl({
      uri: "https://cdn.example.com/img.png"
    });
    const expectedB64 = Buffer.from([10, 20, 30]).toString("base64");
    expect(url).toBe(`data:image/png;base64,${expectedB64}`);
  });

  it("returns null for empty ref", async () => {
    expect(await imageToDataUrl({})).toBeNull();
  });

  it("returns null for non-HTTPS URI (no data)", async () => {
    expect(
      await imageToDataUrl({ uri: "http://insecure.example.com/img.png" })
    ).toBeNull();
  });

  it("infers MIME from URI extension", async () => {
    const b64 = Buffer.from("jpeg-bytes").toString("base64");
    const url = await imageToDataUrl({
      data: b64,
      uri: "https://x.com/photo.jpg"
    });
    expect(url).toBe(`data:image/jpeg;base64,${b64}`);
  });
});
