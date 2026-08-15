import { describe, it, expect, vi } from "vitest";
import { googleGroundedSearch } from "../src/tools/google-tools.js";

const ctx = {} as any;

// ---------------------------------------------------------------------------
// The gemini grounded-search backend
// ---------------------------------------------------------------------------

describe("the gemini grounded-search backend", () => {
  // The query guard has to be what refuses, and it has to refuse before the
  // request goes out — otherwise an empty query reaches Gemini and is billed,
  // and the run only fails later on whatever the API says back.
  it.each([
    ["missing", {}],
    ["empty string", { query: "" }]
  ])("refuses a %s query without fetching", async (_label, params) => {
    process.env["GEMINI_API_KEY"] = "fake-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = (await googleGroundedSearch(ctx, params)) as any;
      expect(result.error).toBe("Search query is required");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      delete process.env["GEMINI_API_KEY"];
    }
  });

  it("refuses without fetching when GEMINI_API_KEY is not set", async () => {
    const original = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = (await googleGroundedSearch(ctx, { query: "test query" })) as any;
      expect(result.error).toContain("GEMINI_API_KEY is not set");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
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
      expect(result.error).toBe("No response received from Gemini API");
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
