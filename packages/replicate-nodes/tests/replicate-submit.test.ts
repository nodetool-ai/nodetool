/**
 * Tests for assetToUrl upload paths and registerReplicateNodes registry integration.
 *
 * The prediction lifecycle lives in the runtime provider and is tested there
 * (packages/runtime/tests/providers/replicate-provider.test.ts).
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { assetToUrl } from "../src/replicate-base.js";
import { registerReplicateNodes } from "../src/index.js";
import { NodeRegistry } from "@nodetool-ai/node-sdk";

/* ------------------------------------------------------------------ */
/*  fetch mock setup                                                    */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** A context whose provider upload resolves with `url`, or rejects. */
function uploadContext(result: string | Error) {
  return {
    uploadProviderMedia: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    })
  };
}

/* ================================================================== */
/*  assetToUrl with an upload context (upload paths)                    */
/* ================================================================== */

describe("assetToUrl with an upload context (upload paths)", () => {
  it("fetches an external URL and uploads it through the provider", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: new Headers({ "content-type": "image/jpeg" })
    });
    const ctx = uploadContext("https://replicate.delivery/uploads/1.jpg");

    const result = await assetToUrl(
      { uri: "https://example.com/image.jpg" },
      ctx
    );

    expect(result).toBe("https://replicate.delivery/uploads/1.jpg");
    expect(ctx.uploadProviderMedia).toHaveBeenCalledWith({
      provider: "replicate",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
      filename: "upload.jpeg"
    });
  });

  it("falls back to direct URL when Replicate upload fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: new Headers({ "content-type": "image/png" })
    });

    const result = await assetToUrl(
      { uri: "https://example.com/image.png" },
      uploadContext(new Error("No URL in upload response"))
    );
    // Should fall back to original URL
    expect(result).toBe("https://example.com/image.png");
  });

  it("returns external URL directly without an upload context", async () => {
    const result = await assetToUrl({
      uri: "https://example.com/image.png"
    });
    expect(result).toBe("https://example.com/image.png");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to direct URL when source fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const ctx = uploadContext("https://replicate.delivery/unused");

    const result = await assetToUrl(
      { uri: "https://example.com/missing.png" },
      ctx
    );
    expect(result).toBe("https://example.com/missing.png");
    expect(ctx.uploadProviderMedia).not.toHaveBeenCalled();
  });

  it("returns null for un-fetchable local paths instead of a broken relative URL", async () => {
    // No storage in context and the local-server fetch fails — Replicate
    // cannot use a relative path, so the arg should be omitted (null).
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await assetToUrl(
      { uri: "/api/storage/missing.png", type: "image" },
      uploadContext("https://replicate.delivery/unused")
    );
    expect(result).toBeNull();
  });
});

/* ================================================================== */
/*  registerReplicateNodes                                              */
/* ================================================================== */

describe("registerReplicateNodes", () => {
  it("registers all replicate nodes in the registry", () => {
    const registry = new NodeRegistry();
    registerReplicateNodes(registry);

    // Should have registered a substantial number of nodes
    const allMeta = registry.listMetadata();
    expect(allMeta.length).toBeGreaterThan(100);
  });

  it("registered nodes can be looked up by type", () => {
    const registry = new NodeRegistry();
    registerReplicateNodes(registry);

    // Spot-check a few known types
    expect(registry.has("replicate.image.generate.StableDiffusionXL")).toBe(
      true
    );
    expect(registry.has("replicate.audio.generate.MusicGen")).toBe(true);
  });
});
