import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import {
  removeNulls,
  isRefSet,
  inferContentType,
  callFalEndpoint,
  uploadToFal,
  assetToFalUrl,
  imageToDataUrl,
  type FalUploadContext
} from "../src/fal-base.js";

/* ------------------------------------------------------------------ */
/*  Scripted fal_ai provider behind a real processing context          */
/* ------------------------------------------------------------------ */

let provider: ScriptedProvider;
let falCtx: ProcessingContext;
let uploadUrls: string[];

/** A test context with storage hooks whose uploads still reach the provider. */
function withUpload(context: Omit<FalUploadContext, "uploadProviderMedia">): FalUploadContext {
  return {
    ...context,
    uploadProviderMedia: (args) => falCtx.uploadProviderMedia(args)
  };
}

/* ------------------------------------------------------------------ */
/*  Fetch mock for imageToDataUrl / assetToFalUrl fallback paths       */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  uploadUrls = [];
  provider = new ScriptedProvider([], {
    providerId: "fal_ai",
    uploadUrl: () => uploadUrls.shift() ?? "https://v3.fal.media/files/default"
  });
  falCtx = new ProcessingContext({ jobId: "job-fal-base" });
  falCtx.setProviderResolver(async () => provider);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/* ================================================================== */
/*  callFalEndpoint                                                     */
/* ================================================================== */

describe("callFalEndpoint", () => {
  const request = {
    endpoint: "fal-ai/flux/dev",
    args: { prompt: "a beautiful sunset" },
    nodeType: "fal.text_to_image.FluxDev",
    capability: "text_to_image" as const
  };

  it("calls the fal_ai provider and returns its output and request id", async () => {
    provider.scriptEndpoint("fal-ai/flux/dev", {
      output: { images: [{ url: "https://fal.media/result.png" }] },
      requestId: "req_123"
    });

    const result = await callFalEndpoint(falCtx, request);

    expect(result).toEqual({
      data: { images: [{ url: "https://fal.media/result.png" }] },
      requestId: "req_123"
    });
    expect(provider.endpointCalls).toHaveLength(1);
    expect(provider.endpointCalls[0]).toMatchObject({
      model: "fal-ai/flux/dev",
      input: { prompt: "a beautiful sunset" }
    });
    expect(provider.endpointCalls[0].route).toBeUndefined();
  });

  it("propagates provider errors", async () => {
    provider.scriptEndpoint("fal-ai/flux/dev", new Error("API error: 422"));
    await expect(callFalEndpoint(falCtx, request)).rejects.toThrow(
      "API error: 422"
    );
  });

  it("refuses output that is not a JSON object", async () => {
    provider.scriptEndpoint("fal-ai/flux/dev", { output: ["not", "a", "record"] });
    await expect(callFalEndpoint(falCtx, request)).rejects.toThrow(
      "FAL fal-ai/flux/dev returned no JSON object"
    );
  });

  it("needs a processing context", async () => {
    await expect(callFalEndpoint(undefined, request)).rejects.toThrow(
      "fal.text_to_image.FluxDev needs a processing context to call FAL"
    );
  });
});

/* ================================================================== */
/*  uploadToFal                                                         */
/* ================================================================== */

describe("uploadToFal", () => {
  const data = new Uint8Array([1, 2, 3, 4]);

  it("uploads through the fal_ai provider and returns its URL", async () => {
    uploadUrls.push("https://v3.fal.media/files/abc.png");

    const url = await uploadToFal(falCtx, data, "image/png");

    expect(url).toBe("https://v3.fal.media/files/abc.png");
    expect(provider.uploadCalls).toHaveLength(1);
    expect(provider.uploadCalls[0]).toMatchObject({
      bytes: data,
      mimeType: "image/png"
    });
  });

  it("needs a processing context", async () => {
    await expect(uploadToFal(undefined, data, "image/png")).rejects.toThrow(
      "Uploading media to FAL needs a processing context"
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

  it("leaves nested dict[...] inputs untouched", () => {
    // The only nested objects in a FAL arg bag are pass-through `dict[...]`
    // fields the user supplied. Recursing would delete keys they meant to send —
    // a deliberate `"negative_prompt": ""` inside one is a value, not an omission.
    const obj: Record<string, unknown> = {
      a: 1,
      nested: { x: "keep", negative_prompt: "", y: null }
    };
    removeNulls(obj);
    expect(obj.a).toBe(1);
    expect(obj.nested).toEqual({ x: "keep", negative_prompt: "", y: null });
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
  it("returns true for asset_id-only refs (resolved via the context)", () =>
    expect(isRefSet({ asset_id: "123" })).toBe(true));
  it("returns false for a null asset_id", () =>
    expect(isRefSet({ uri: "", data: null, asset_id: null })).toBe(false));
  it("returns false for an empty-string asset_id", () =>
    expect(isRefSet({ asset_id: "" })).toBe(false));
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
/*  assetToFalUrl                                                       */
/* ================================================================== */

describe("assetToFalUrl", () => {
  it("returns FAL CDN URI directly (no upload)", async () => {
    const url = await assetToFalUrl({
      uri: "https://v3.fal.media/files/abc.png"
    }, falCtx);
    expect(url).toBe("https://v3.fal.media/files/abc.png");
    expect(provider.uploadCalls).toHaveLength(0);
  });

  it("fetches and uploads external HTTPS URI to FAL CDN", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: new Headers({ "content-type": "image/png" })
    } as unknown as Response);
    uploadUrls.push("https://v3.fal.media/files/uploaded.png");

    const url = await assetToFalUrl({
      uri: "https://cdn.example.com/img.png"
    }, falCtx);
    expect(url).toBe("https://v3.fal.media/files/uploaded.png");
  });

  it("does not return localhost HTTPS URI directly", async () => {
    const url = await assetToFalUrl({
      uri: "https://localhost:8080/img.png"
    }, falCtx);
    expect(url).toBeNull();
  });

  it("uploads when data is present", async () => {
    const b64 = Buffer.from("fake-image-bytes").toString("base64");
    uploadUrls.push("https://v3.fal.media/files/img.png");

    const url = await assetToFalUrl({ data: b64, type: "image" }, falCtx);
    expect(url).toBe("https://v3.fal.media/files/img.png");
  });

  it("uploads local URI bytes from ProcessingContext storage before fetching", async () => {
    const context = {
      storage: {
        retrieve: vi.fn(async () => new Uint8Array([1, 2, 3]))
      }
    };
    uploadUrls.push("https://v3.fal.media/files/context.png");

    const url = await assetToFalUrl({ uri: "/api/storage/local.png", type: "image" }, withUpload(context));

    expect(url).toBe("https://v3.fal.media/files/context.png");
    expect(context.storage.retrieve).toHaveBeenCalledWith(
      "/api/storage/local.png"
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves asset:// ref via context.resolveAssetBytes and uploads", async () => {
    const context = {
      storage: {
        retrieve: vi.fn(async () => null)
      },
      resolveAssetBytes: vi.fn(async () => ({
        bytes: Uint8Array.from([137, 80, 78, 71])
      }))
    };
    uploadUrls.push("https://v3.fal.media/files/asset-resolved.png");

    const url = await assetToFalUrl({ type: "image", uri: "asset://asset-123" }, withUpload(context));

    expect(url).toBe("https://v3.fal.media/files/asset-resolved.png");
    expect(context.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-123");
    expect(provider.uploadCalls).toHaveLength(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves an asset_id-only ref via context.resolveAssetBytes and uploads", async () => {
    const context = {
      storage: { retrieve: vi.fn(async () => null) },
      resolveAssetBytes: vi.fn(async () => ({
        bytes: Uint8Array.from([137, 80, 78, 71])
      }))
    };
    uploadUrls.push("https://v3.fal.media/files/asset-id-resolved.png");

    const url = await assetToFalUrl({ type: "image", uri: "", asset_id: "asset-456" }, withUpload(context));

    expect(url).toBe("https://v3.fal.media/files/asset-id-resolved.png");
    expect(context.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-456");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null when no uri, data, or asset_id", async () => {
    const url = await assetToFalUrl({ type: "image" }, falCtx);
    expect(url).toBeNull();
  });

  it("fetches and uploads a public HTTPS URI through the egress policy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([10, 20]).buffer,
      headers: new Headers({ "content-type": "image/jpeg" })
    } as unknown as Response);
    uploadUrls.push("https://v3.fal.media/files/uploaded.jpg");

    const url = await assetToFalUrl({
      type: "video",
      uri: "https://example.com/clip.mp4"
    }, falCtx);
    expect(url).toBe("https://v3.fal.media/files/uploaded.jpg");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:7777/api/workflows",
    "https://10.0.0.5/internal",
    "/api/internal-route",
    "/api/storage/../secret"
  ])("does not fetch the workflow-supplied uri %s", async (uri) => {
    const url = await assetToFalUrl({ type: "video", uri }, falCtx);
    expect(url).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(provider.uploadCalls).toHaveLength(0);
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

  it("resolves an asset_id-only ref to a data URL via context.resolveAssetBytes", async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71]);
    const context = {
      resolveAssetBytes: vi.fn(async () => ({ bytes }))
    };
    const url = await imageToDataUrl(
      { type: "image", uri: "", asset_id: "asset-789" },
      context
    );
    expect(context.resolveAssetBytes).toHaveBeenCalledWith("asset://asset-789");
    expect(url).toBe(
      `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves an asset:// uri to a data URL via context.resolveAssetBytes", async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const context = {
      resolveAssetBytes: vi.fn(async () => ({ bytes }))
    };
    const url = await imageToDataUrl(
      { type: "image", uri: "asset://abc" },
      context
    );
    expect(context.resolveAssetBytes).toHaveBeenCalledWith("asset://abc");
    expect(url).toBe(
      `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
    );
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
