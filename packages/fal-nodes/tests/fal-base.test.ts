import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getFalApiKey,
  removeNulls,
  isRefSet,
  inferContentType,
  falSubmit,
  falUpload,
  assetToFalUrl,
  imageToDataUrl,
} from "../src/fal-base.js";

/* ------------------------------------------------------------------ */
/*  Fetch mock helpers                                                 */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.FAL_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.FAL_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new Uint8Array([116, 101, 115, 116]).buffer,
  } as unknown as Response;
}

/* ================================================================== */
/*  getFalApiKey                                                        */
/* ================================================================== */

describe("getFalApiKey", () => {
  it("returns key from _secrets.FAL_API_KEY", () => {
    const key = getFalApiKey({ _secrets: { FAL_API_KEY: "secret-from-secrets" } });
    expect(key).toBe("secret-from-secrets");
  });

  it("returns key from process.env.FAL_API_KEY", () => {
    process.env.FAL_API_KEY = "secret-from-env";
    const key = getFalApiKey({});
    expect(key).toBe("secret-from-env");
  });

  it("prefers _secrets over process.env", () => {
    process.env.FAL_API_KEY = "env-key";
    const key = getFalApiKey({ _secrets: { FAL_API_KEY: "secrets-key" } });
    expect(key).toBe("secrets-key");
  });

  it("throws when no key available", () => {
    expect(() => getFalApiKey({})).toThrow("FAL_API_KEY is not configured");
  });

  it("throws when _secrets.FAL_API_KEY is empty string", () => {
    expect(() => getFalApiKey({ _secrets: { FAL_API_KEY: "" } })).toThrow(
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
      nested: { x: "keep", y: null, z: undefined },
    };
    removeNulls(obj);
    expect(obj.a).toBe(1);
    expect((obj.nested as Record<string, unknown>).x).toBe("keep");
    expect("y" in (obj.nested as Record<string, unknown>)).toBe(false);
    expect("z" in (obj.nested as Record<string, unknown>)).toBe(false);
  });

  it("does not remove falsy non-null values (0, false, empty string)", () => {
    const obj: Record<string, unknown> = { a: 0, b: false, c: "" };
    removeNulls(obj);
    expect(obj).toEqual({ a: 0, b: false, c: "" });
  });

  it("does not recurse into arrays", () => {
    const obj: Record<string, unknown> = { arr: [null, 1, 2] };
    removeNulls(obj);
    // Array itself is kept as-is (not recursed into)
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
  it("returns false for null", () => {
    expect(isRefSet(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRefSet(undefined)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isRefSet({})).toBe(false);
  });

  it("returns false for non-object (string)", () => {
    expect(isRefSet("hello")).toBe(false);
  });

  it("returns false for non-object (number)", () => {
    expect(isRefSet(42)).toBe(false);
  });

  it("returns false for non-object (boolean)", () => {
    expect(isRefSet(true)).toBe(false);
  });

  it("returns true for { data: 'abc' }", () => {
    expect(isRefSet({ data: "abc" })).toBe(true);
  });

  it("returns true for { uri: 'https://example.com/img.png' }", () => {
    expect(isRefSet({ uri: "https://example.com/img.png" })).toBe(true);
  });

  it("returns true for { asset_id: '123' }", () => {
    expect(isRefSet({ asset_id: "123" })).toBe(true);
  });

  it("returns true for object with all three fields", () => {
    expect(isRefSet({ data: "abc", uri: "https://x.com", asset_id: "id" })).toBe(true);
  });
});

/* ================================================================== */
/*  inferContentType                                                    */
/* ================================================================== */

describe("inferContentType", () => {
  it("returns image/png for 'image'", () => {
    expect(inferContentType("image")).toBe("image/png");
  });

  it("returns video/mp4 for 'video'", () => {
    expect(inferContentType("video")).toBe("video/mp4");
  });

  it("returns audio/wav for 'audio'", () => {
    expect(inferContentType("audio")).toBe("audio/wav");
  });

  it("returns application/octet-stream for unknown string", () => {
    expect(inferContentType("document")).toBe("application/octet-stream");
  });

  it("returns application/octet-stream for undefined", () => {
    expect(inferContentType(undefined)).toBe("application/octet-stream");
  });

  it("returns application/octet-stream for empty string", () => {
    expect(inferContentType("")).toBe("application/octet-stream");
  });
});

/* ================================================================== */
/*  falSubmit                                                           */
/* ================================================================== */

describe("falSubmit", () => {
  const apiKey = "test-fal-key";
  const endpoint = "fal-ai/flux/dev";
  const args = { prompt: "a beautiful sunset" };

  it("successful submit → poll (COMPLETED) → fetch result", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/requests") && !urlStr.includes("/status") && !urlStr.endsWith("/req_123")) {
        return jsonResponse(
          { request_id: "req_123", response_url: "", status_url: "", cancel_url: "" },
          201
        );
      }
      if (urlStr.includes("/status")) {
        return jsonResponse({ status: "COMPLETED" });
      }
      if (urlStr.endsWith("/req_123")) {
        return jsonResponse({ images: [{ url: "https://fal.media/result.png" }] });
      }
      return jsonResponse({ error: "unknown" }, 404);
    });

    const result = await falSubmit(apiKey, endpoint, args, 0, 5);
    expect(result).toHaveProperty("images");
  });

  it("submit returns non-ok status → throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "bad request" }, 400));
    await expect(falSubmit(apiKey, endpoint, args, 0, 1)).rejects.toThrow(
      "FAL submit failed"
    );
  });

  it("submit response has no request_id → throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    await expect(falSubmit(apiKey, endpoint, args, 0, 1)).rejects.toThrow(
      "No request_id"
    );
  });

  it("job FAILED status → throws", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/requests") && !urlStr.includes("/status")) {
        return jsonResponse({ request_id: "req_fail" }, 201);
      }
      if (urlStr.includes("/status")) {
        return jsonResponse({ status: "FAILED", error: "out of memory" });
      }
      return jsonResponse({}, 404);
    });
    await expect(falSubmit(apiKey, endpoint, args, 0, 5)).rejects.toThrow(
      "FAL job failed"
    );
  });

  it("status check returns non-ok → throws", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/requests") && !urlStr.includes("/status")) {
        return jsonResponse({ request_id: "req_se" }, 201);
      }
      if (urlStr.includes("/status")) {
        return jsonResponse({ error: "server error" }, 500);
      }
      return jsonResponse({}, 404);
    });
    await expect(falSubmit(apiKey, endpoint, args, 0, 3)).rejects.toThrow(
      "FAL status check failed"
    );
  });

  it("times out when never COMPLETED", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/requests") && !urlStr.includes("/status")) {
        return jsonResponse({ request_id: "req_to" }, 201);
      }
      if (urlStr.includes("/status")) {
        return jsonResponse({ status: "IN_PROGRESS" });
      }
      return jsonResponse({}, 404);
    });
    await expect(falSubmit(apiKey, endpoint, args, 0, 2)).rejects.toThrow(
      "FAL job timed out"
    );
  });

  it("result fetch returns non-ok → throws", async () => {
    mockFetch.mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/requests") && !urlStr.includes("/status") && !urlStr.endsWith("/req_rf")) {
        return jsonResponse({ request_id: "req_rf" }, 201);
      }
      if (urlStr.includes("/status")) {
        return jsonResponse({ status: "COMPLETED" });
      }
      if (urlStr.endsWith("/req_rf")) {
        return jsonResponse({ error: "not found" }, 404);
      }
      return jsonResponse({}, 404);
    });
    await expect(falSubmit(apiKey, endpoint, args, 0, 5)).rejects.toThrow(
      "FAL result fetch failed"
    );
  });
});

/* ================================================================== */
/*  falUpload                                                           */
/* ================================================================== */

describe("falUpload", () => {
  const apiKey = "test-fal-key";
  const data = new Uint8Array([1, 2, 3, 4]);
  const contentType = "image/png";

  it("successful upload returns access_url", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token: "tok123", base_url: "https://v3.fal.media" }))
      .mockResolvedValueOnce(jsonResponse({ access_url: "https://v3.fal.media/files/abc.png" }));

    const url = await falUpload(apiKey, data, contentType);
    expect(url).toBe("https://v3.fal.media/files/abc.png");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("token endpoint returns non-ok → throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    await expect(falUpload(apiKey, data, contentType)).rejects.toThrow(
      "FAL upload token failed"
    );
  });

  it("token response missing token → throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ base_url: "https://v3.fal.media" }));
    await expect(falUpload(apiKey, data, contentType)).rejects.toThrow(
      "No token in FAL upload response"
    );
  });

  it("upload endpoint returns non-ok → throws", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token: "tok123", base_url: "https://v3.fal.media" }))
      .mockResolvedValueOnce(jsonResponse({ error: "upload failed" }, 500));
    await expect(falUpload(apiKey, data, contentType)).rejects.toThrow(
      "FAL file upload failed"
    );
  });

  it("upload response missing access_url → throws", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token: "tok123", base_url: "https://v3.fal.media" }))
      .mockResolvedValueOnce(jsonResponse({ other_field: "value" }));
    await expect(falUpload(apiKey, data, contentType)).rejects.toThrow(
      "No access_url in FAL upload response"
    );
  });
});

/* ================================================================== */
/*  assetToFalUrl                                                       */
/* ================================================================== */

describe("assetToFalUrl", () => {
  const apiKey = "test-fal-key";

  it("returns external HTTPS URI directly (no upload)", async () => {
    const url = await assetToFalUrl(apiKey, { uri: "https://cdn.example.com/img.png" });
    expect(url).toBe("https://cdn.example.com/img.png");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not return localhost HTTPS URI directly (tries upload)", async () => {
    const b64 = Buffer.from("fake").toString("base64");
    // No data so returns null after skipping localhost URI
    const url = await assetToFalUrl(apiKey, { uri: "https://localhost:8080/img.png" });
    expect(url).toBeNull();
  });

  it("uploads when data is present", async () => {
    const b64 = Buffer.from("fake-image-bytes").toString("base64");
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token: "tok", base_url: "https://v3.fal.media" }))
      .mockResolvedValueOnce(jsonResponse({ access_url: "https://v3.fal.media/files/img.png" }));

    const url = await assetToFalUrl(apiKey, { data: b64, type: "image" });
    expect(url).toBe("https://v3.fal.media/files/img.png");
  });

  it("returns null when no uri and no data", async () => {
    const url = await assetToFalUrl(apiKey, { type: "image" });
    expect(url).toBeNull();
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
    } as unknown as Response);

    const url = await imageToDataUrl({ uri: "https://cdn.example.com/img.png" });
    const expectedB64 = Buffer.from([10, 20, 30]).toString("base64");
    expect(url).toBe(`data:image/png;base64,${expectedB64}`);
  });

  it("returns null for empty ref", async () => {
    const url = await imageToDataUrl({});
    expect(url).toBeNull();
  });

  it("returns null for non-HTTPS URI (no data)", async () => {
    const url = await imageToDataUrl({ uri: "http://insecure.example.com/img.png" });
    expect(url).toBeNull();
  });
});
