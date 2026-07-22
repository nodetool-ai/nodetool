import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeBase64, loadMediaRefBytes } from "../src/media-ref-bytes.js";
import type { ProcessingContext } from "../src/context.js";

describe("loadMediaRefBytes", () => {
  it("loads inline base64 data", async () => {
    const payload = Buffer.from([1, 2, 3]).toString("base64");
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: "",
      data: payload
    });
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("loads inline base64 data: URIs", async () => {
    const payload = Buffer.from([1, 2, 3]).toString("base64");
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: "",
      data: `data:image/png;base64,${payload}`
    });
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("loads inline plain-text data: URIs without base64-decoding", async () => {
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: "",
      data: "data:text/plain,hello%20world"
    });
    expect(bytes).toEqual(new TextEncoder().encode("hello world"));
  });

  it("returns null for malformed data: strings without a comma", async () => {
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: "",
      data: "data:text/plain"
    });
    expect(bytes).toBeNull();
  });

  it("keeps the full payload when it contains commas (#11)", async () => {
    // Regression: split(",", 2) truncated everything after the second comma,
    // corrupting SVG/CSV/text data URIs.
    const svg = '<svg><path d="M0,0 L10,10"/></svg>';
    const bytes = await loadMediaRefBytes({
      type: "image",
      uri: `data:image/svg+xml,${svg}`,
      data: ""
    });
    expect(bytes).toEqual(new TextEncoder().encode(svg));
  });

  it("returns null (no throw) on a malformed percent-escape (#12)", async () => {
    // Regression: decodeURIComponent threw URIError uncaught, aborting byte
    // resolution instead of returning null.
    await expect(
      loadMediaRefBytes({
        type: "image",
        uri: "data:text/plain,100%discount",
        data: ""
      })
    ).resolves.toBeNull();
  });

  it("resolves storage via asset_id when uri is stale", async () => {
    const ctx = {
      storage: {
        retrieve: vi.fn(async (uri: string) =>
          uri === "/api/storage/asset-99.png" ? new Uint8Array([4, 5, 6]) : null
        )
      }
    } as unknown as ProcessingContext;

    const bytes = await loadMediaRefBytes(
      {
        type: "image",
        uri: "C:\\missing\\path.png",
        asset_id: "asset-99"
      },
      ctx
    );

    expect(bytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("resolves asset:// via context.resolveAssetBytes", async () => {
    const ctx = {
      resolveAssetBytes: vi.fn(async () => ({
        bytes: new Uint8Array([7, 8, 9]),
        attempts: []
      }))
    } as unknown as ProcessingContext;

    const bytes = await loadMediaRefBytes(
      { type: "image", uri: "asset://abc-123.png" },
      ctx
    );

    expect(bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://abc-123.png");
  });

  it("resolves an asset_id-only ref (empty uri) via resolveAssetBytes", async () => {
    // Regression: the early `if (!uri) return null` bailed before the asset_id
    // fallback, so `{ asset_id, uri: "" }` never resolved.
    const ctx = {
      resolveAssetBytes: vi.fn(async () => ({
        bytes: new Uint8Array([10, 11, 12]),
        attempts: []
      }))
    } as unknown as ProcessingContext;

    const bytes = await loadMediaRefBytes(
      { type: "image", uri: "", asset_id: "abc" },
      ctx
    );

    expect(bytes).toEqual(new Uint8Array([10, 11, 12]));
    expect(ctx.resolveAssetBytes).toHaveBeenCalledWith("asset://abc");
  });

  it("resolves an asset_id-only ref via storage candidates", async () => {
    const ctx = {
      resolveAssetBytes: vi.fn(async () => ({ bytes: null, attempts: [] })),
      storage: {
        retrieve: vi.fn(async (uri: string) =>
          uri === "/api/storage/abc.png" ? new Uint8Array([13, 14, 15]) : null
        )
      }
    } as unknown as ProcessingContext;

    const bytes = await loadMediaRefBytes(
      { type: "image", asset_id: "abc" },
      ctx
    );

    expect(bytes).toEqual(new Uint8Array([13, 14, 15]));
  });
});

describe("encodeBase64", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes bytes via Buffer on Node", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(encodeBase64(bytes)).toBe(
      Buffer.from(bytes).toString("base64")
    );
  });

  it("falls back to btoa when Buffer is unavailable", () => {
    const bytes = new TextEncoder().encode("hello world");
    const expected = Buffer.from(bytes).toString("base64");
    vi.stubGlobal("Buffer", undefined);
    expect(encodeBase64(bytes)).toBe(expected);
  });

  it("handles payloads larger than one fromCharCode chunk without Buffer", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const expected = Buffer.from(bytes).toString("base64");
    vi.stubGlobal("Buffer", undefined);
    expect(encodeBase64(bytes)).toBe(expected);
  });
});
