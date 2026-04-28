/**
 * Tests for assetToUrl upload paths and registerReplicateNodes registry integration.
 *
 * Note: replicateSubmit now uses the Replicate SDK internally (client.run()),
 * so fetch-based mocking no longer applies. The submit/poll lifecycle is
 * tested via the runtime provider tests (replicate-provider.test.ts).
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

/* ================================================================== */
/*  assetToUrl with apiKey (upload paths)                               */
/* ================================================================== */

describe("assetToUrl with apiKey (upload paths)", () => {
  it("falls back to direct URL when Replicate upload fails", async () => {
    // First call: fetches the external URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: new Headers({ "content-type": "image/png" })
    });
    // Second call: upload fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await assetToUrl(
      { uri: "https://example.com/image.png" },
      "test-key"
    );
    // Should fall back to original URL
    expect(result).toBe("https://example.com/image.png");
  });

  it("returns external URL directly when no apiKey is provided", async () => {
    const result = await assetToUrl({
      uri: "https://example.com/image.png"
    });
    expect(result).toBe("https://example.com/image.png");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to direct URL when source fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await assetToUrl(
      { uri: "https://example.com/missing.png" },
      "test-key"
    );
    expect(result).toBe("https://example.com/missing.png");
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
