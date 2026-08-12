import { describe, it, expect, vi } from "vitest";
import { googleGroundedSearch } from "../src/tools/google-tools.js";

const ctx = {} as any;

// ---------------------------------------------------------------------------
// The gemini grounded-search backend
// ---------------------------------------------------------------------------

describe("the gemini grounded-search backend", () => {
  it("returns error when query is missing", async () => {
    const result = (await googleGroundedSearch(ctx, {})) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when query is empty string", async () => {
    const result = (await googleGroundedSearch(ctx, { query: "" })) as any;
    expect(result.error).toBeDefined();
  });

  it("returns error when GEMINI_API_KEY is not set", async () => {
    const original = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    try {
      const result = (await googleGroundedSearch(ctx, { query: "test query" })) as any;
      expect(result.error).toBeDefined();
    } finally {
      if (original !== undefined) process.env["GEMINI_API_KEY"] = original;
    }
  });

  it("returns error on API failure", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    // Mock fetch to return an error response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden"
    }) as any;
    try {
      const result = (await googleGroundedSearch(ctx, { query: "test" })) as any;
      expect(result.error).toContain("403");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("parses successful response with grounding metadata", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "Search result text" }]
          },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://example.com", title: "Example" } },
              { web: { uri: "https://other.com", title: "Other" } }
            ]
          }
        }
      ]
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    }) as any;
    try {
      const result = (await googleGroundedSearch(ctx, { query: "test search" })) as any;
      expect(result.status).toBe("success");
      expect(result.query).toBe("test search");
      expect(result.results).toContain("Search result text");
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].url).toBe("https://example.com");
      expect(result.sources[0].title).toBe("Example");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/models/gemini-3.5-flash:generateContent"),
        expect.any(Object)
      );
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("handles response with no candidates", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [] })
    }) as any;
    try {
      const result = (await googleGroundedSearch(ctx, { query: "test" })) as any;
      expect(result.error).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("handles response with no grounding metadata", async () => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const mockResponse = {
      candidates: [
        {
          content: { parts: [{ text: "Plain result" }] }
        }
      ]
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    }) as any;
    try {
      const result = (await googleGroundedSearch(ctx, { query: "test" })) as any;
      expect(result.status).toBe("success");
      expect(result.sources).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    }
  });
});
