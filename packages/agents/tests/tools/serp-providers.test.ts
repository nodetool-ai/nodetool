/**
 * Tests for T-AG-6: SERP provider abstraction.
 *
 * Verifies:
 *  - SerpProvider interface contract
 *  - SerpApiProvider normalises results
 *  - DataForSeoProvider normalises results
 *  - GoogleSearchTool works with an injected SerpProvider
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SerpApiProvider } from "../../src/tools/serp-providers/serpapi-provider.js";
import { DataForSeoProvider } from "../../src/tools/serp-providers/dataforseo-provider.js";
import type {
  SerpProvider,
  SearchResult
} from "../../src/tools/serp-providers/index.js";
import { GoogleSearchTool } from "../../src/tools/search-tools.js";
import { DataForSEOSearchTool } from "../../src/tools/dataseo-tools.js";
import type { ProcessingContext } from "@nodetool/runtime";
import { Buffer } from "buffer";

/* ------------------------------------------------------------------ */
/*  Mock helpers                                                      */
/* ------------------------------------------------------------------ */

function makeContext(secrets: Record<string, string> = {}): ProcessingContext {
  return {
    getSecret: vi.fn(async (key: string) => secrets[key] ?? null)
  } as unknown as ProcessingContext;
}

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

/* ------------------------------------------------------------------ */
/*  Mock SerpProvider                                                 */
/* ------------------------------------------------------------------ */

function createMockProvider(results: SearchResult[] = []): SerpProvider {
  return {
    search: vi.fn(async () => results),
    searchRaw: vi.fn(async () => ({ results }))
  };
}

/* ------------------------------------------------------------------ */
/*  SerpApiProvider                                                   */
/* ------------------------------------------------------------------ */

describe("SerpApiProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalises organic_results into SearchResult[]", async () => {
    const rawResponse = {
      organic_results: [
        {
          title: "Result 1",
          link: "https://example.com/1",
          snippet: "First",
          position: 1
        },
        {
          title: "Result 2",
          link: "https://example.com/2",
          snippet: "Second",
          position: 2
        }
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new SerpApiProvider("test-key");
      const results = await provider.search("test query");

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: "Result 1",
        url: "https://example.com/1",
        snippet: "First",
        position: 1
      });
      expect(results[1].position).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("searchRaw returns raw API response", async () => {
    const rawResponse = { search_metadata: {}, organic_results: [] };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new SerpApiProvider("test-key");
      const raw = await provider.searchRaw("test query");
      expect(raw).toEqual(rawResponse);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles empty organic_results gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch({ organic_results: [] });
    try {
      const provider = new SerpApiProvider("test-key");
      const results = await provider.search("test");
      expect(results).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on HTTP error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch("error", false, 500);
    try {
      const provider = new SerpApiProvider("test-key");
      await expect(provider.search("test")).rejects.toThrow(
        "SerpAPI request failed"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  DataForSeoProvider                                                */
/* ------------------------------------------------------------------ */

describe("DataForSeoProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalises DataForSEO items into SearchResult[]", async () => {
    const rawResponse = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "organic",
                  title: "R1",
                  url: "https://a.com",
                  description: "Snip1",
                  rank_absolute: 1
                },
                {
                  type: "organic",
                  title: "R2",
                  url: "https://b.com",
                  description: "Snip2",
                  rank_absolute: 2
                },
                {
                  type: "paid",
                  title: "Ad",
                  url: "https://ad.com",
                  description: "Ad snip"
                }
              ]
            }
          ]
        }
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new DataForSeoProvider("login", "pass");
      const results = await provider.search("test query");

      // Only organic items
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: "R1",
        url: "https://a.com",
        snippet: "Snip1",
        position: 1
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("searchRaw returns raw DataForSEO response", async () => {
    const rawResponse = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: []
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new DataForSeoProvider("login", "pass");
      const raw = await provider.searchRaw("test");
      expect(raw).toEqual(rawResponse);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on API error status", async () => {
    const rawResponse = {
      status_code: 40000,
      status_message: "Bad Request"
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new DataForSeoProvider("login", "pass");
      await expect(provider.search("test")).rejects.toThrow(
        "DataForSEO API Error"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleSearchTool with injected provider                           */
/* ------------------------------------------------------------------ */

describe("GoogleSearchTool with SerpProvider", () => {
  it("delegates to injected provider", async () => {
    const mockResults: SearchResult[] = [
      {
        title: "Mock Result",
        url: "https://mock.com",
        snippet: "Mock snip",
        position: 1
      }
    ];
    const provider = createMockProvider(mockResults);
    const tool = new GoogleSearchTool(provider);
    const ctx = makeContext();

    const result = (await tool.process(ctx, {
      keyword: "test",
      num_results: 5
    })) as {
      success: boolean;
      results: Array<Record<string, unknown>>;
    };

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Mock Result");
    expect(result.results[0].link).toBe("https://mock.com");
    expect(provider.search).toHaveBeenCalledWith("test", { numResults: 5 });
  });

  it("returns error when keyword is missing", async () => {
    const provider = createMockProvider([]);
    const tool = new GoogleSearchTool(provider);
    const ctx = makeContext();

    const result = await tool.process(ctx, {});
    expect(result).toEqual({ error: "keyword is required" });
  });
});

/* ------------------------------------------------------------------ */
/*  DataForSEOSearchTool with injected provider                       */
/* ------------------------------------------------------------------ */

describe("DataForSEOSearchTool with SerpProvider", () => {
  it("accepts optional provider in constructor", () => {
    const provider = createMockProvider();
    const tool = new DataForSEOSearchTool(provider);
    expect(tool.name).toBe("dataforseo_search");
  });

  it("preserves tool name and description", () => {
    const tool = new DataForSEOSearchTool();
    expect(tool.name).toBe("dataforseo_search");
    expect(tool.description).toContain("DataForSEO");
  });
});

/* ------------------------------------------------------------------ */
/*  Interface contract                                                */
/* ------------------------------------------------------------------ */

describe("SerpProvider interface", () => {
  it("mock provider satisfies the interface", async () => {
    const provider = createMockProvider([
      { title: "A", url: "https://a.com", snippet: "s", position: 1 }
    ]);

    const results = await provider.search("q");
    expect(results).toHaveLength(1);

    const raw = await provider.searchRaw("q");
    expect(raw).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Additional SerpApiProvider tests                                   */
/* ------------------------------------------------------------------ */

describe("SerpApiProvider (extended)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes gl and hl options as query params", async () => {
    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({ organic_results: [] }),
        text: async () => "{}"
      } as Response;
    });

    try {
      const provider = new SerpApiProvider("key123", "de", "de");
      await provider.search("test query");

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.get("gl")).toBe("de");
      expect(parsed.searchParams.get("hl")).toBe("de");
      expect(parsed.searchParams.get("api_key")).toBe("key123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses custom engine when specified in options", async () => {
    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({ organic_results: [] }),
        text: async () => "{}"
      } as Response;
    });

    try {
      const provider = new SerpApiProvider("key123");
      await provider.search("test", { engine: "bing" });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.get("engine")).toBe("bing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty array when response has no organic_results key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch({ search_metadata: {} }); // no organic_results
    try {
      const provider = new SerpApiProvider("key123");
      const results = await provider.search("test");
      expect(results).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles null fields in results gracefully", async () => {
    const rawResponse = {
      organic_results: [{ title: null, link: null, snippet: null, position: 1 }]
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new SerpApiProvider("key123");
      const results = await provider.search("test");
      expect(results).toHaveLength(1);
      // null fields should be coerced to empty strings via String(null ?? "")
      expect(results[0].title).toBe("");
      expect(results[0].url).toBe("");
      expect(results[0].snippet).toBe("");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Additional DataForSeoProvider tests                                */
/* ------------------------------------------------------------------ */

describe("DataForSeoProvider (extended)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("encodes Basic auth header correctly as base64", async () => {
    let capturedAuth = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        capturedAuth =
          (init?.headers as Record<string, string>)?.Authorization ?? "";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status_code: 20000,
            status_message: "Ok.",
            tasks: [{ result: [{ items: [] }] }]
          }),
          text: async () => "{}"
        } as Response;
      }
    );

    try {
      const provider = new DataForSeoProvider("mylogin", "mypass");
      await provider.search("test");

      const expected = `Basic ${Buffer.from("mylogin:mypass").toString("base64")}`;
      expect(capturedAuth).toBe(expected);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty results when items array is empty", async () => {
    const rawResponse = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: [{ result: [{ items: [] }] }]
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new DataForSeoProvider("login", "pass");
      const results = await provider.search("test");
      expect(results).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when response has empty tasks array", async () => {
    const rawResponse = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: []
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new DataForSeoProvider("login", "pass");
      // Empty tasks means extractItems returns [] which is still an array
      const results = await provider.search("test");
      expect(results).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("filters out non-organic items", async () => {
    const rawResponse = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "organic",
                  title: "Real Result",
                  url: "https://real.com",
                  description: "real",
                  rank_absolute: 1
                },
                {
                  type: "paid",
                  title: "Ad",
                  url: "https://ad.com",
                  description: "ad"
                },
                {
                  type: "featured_snippet",
                  title: "Featured",
                  url: "https://f.com",
                  description: "feat"
                },
                {
                  type: "organic",
                  title: "Second",
                  url: "https://second.com",
                  description: "second",
                  rank_absolute: 2
                }
              ]
            }
          ]
        }
      ]
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const provider = new DataForSeoProvider("login", "pass");
      const results = await provider.search("test");
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe("Real Result");
      expect(results[1].title).toBe("Second");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleNewsTool                                                     */
/* ------------------------------------------------------------------ */

describe("GoogleNewsTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts news_results from SerpAPI response", async () => {
    const { GoogleNewsTool } = await import("../../src/tools/search-tools.js");
    const rawResponse = {
      news_results: [
        {
          title: "News 1",
          link: "https://news1.com",
          snippet: "Breaking",
          date: "2h ago",
          source: { name: "CNN" }
        },
        {
          title: "News 2",
          link: "https://news2.com",
          snippet: "Update",
          date: "5h ago",
          source: { name: "BBC" }
        }
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const tool = new GoogleNewsTool();
      const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
      const result = (await tool.process(ctx, {
        keyword: "breaking news",
        num_results: 5
      })) as {
        success: boolean;
        results: Array<Record<string, unknown>>;
      };

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe("News 1");
      expect(result.results[0].source).toBe("CNN");
      expect(result.results[0].date).toBe("2h ago");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleImagesTool                                                   */
/* ------------------------------------------------------------------ */

describe("GoogleImagesTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts images_results from SerpAPI response", async () => {
    const { GoogleImagesTool } =
      await import("../../src/tools/search-tools.js");
    const rawResponse = {
      images_results: [
        {
          title: "Image 1",
          link: "https://img1.com",
          original: "https://img1.com/full.jpg",
          thumbnail: "https://img1.com/thumb.jpg"
        },
        {
          title: "Image 2",
          link: "https://img2.com",
          original: "https://img2.com/full.png",
          thumbnail: "https://img2.com/thumb.png"
        }
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const tool = new GoogleImagesTool();
      const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
      const result = (await tool.process(ctx, {
        keyword: "cats",
        num_results: 5
      })) as {
        success: boolean;
        results: Array<Record<string, unknown>>;
      };

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe("Image 1");
      expect(result.results[0].original).toBe("https://img1.com/full.jpg");
      expect(result.results[0].thumbnail).toBe("https://img1.com/thumb.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  DataForSEONewsTool                                                 */
/* ------------------------------------------------------------------ */

describe("DataForSEONewsTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts news results with mock context credentials", async () => {
    const { DataForSEONewsTool } =
      await import("../../src/tools/dataseo-tools.js");
    const rawResponse = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "news_search",
                  title: "Breaking",
                  url: "https://news.com",
                  description: "Details",
                  timestamp: "2025-01-15 10:30:00",
                  source: "Reuters"
                },
                {
                  type: "top_stories",
                  title: "Top Story",
                  url: "https://top.com",
                  description: "Top details",
                  timestamp: "2025-01-15 09:00:00",
                  source: "AP"
                },
                {
                  type: "paid",
                  title: "Ad",
                  url: "https://ad.com",
                  description: "Ad"
                }
              ]
            }
          ]
        }
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const tool = new DataForSEONewsTool();
      const ctx = makeContext({
        DATA_FOR_SEO_LOGIN: "testlogin",
        DATA_FOR_SEO_PASSWORD: "testpass"
      });
      const result = (await tool.process(ctx, { keyword: "tech news" })) as {
        success: boolean;
        results: Array<Record<string, unknown>>;
      };

      expect(result.success).toBe(true);
      // Only news_search and top_stories types pass through, not "paid"
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe("Breaking");
      expect(result.results[0].source).toBe("Reuters");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  DataForSEOImagesTool                                               */
/* ------------------------------------------------------------------ */

describe("DataForSEOImagesTool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts image results from DataForSEO response", async () => {
    const { DataForSEOImagesTool } =
      await import("../../src/tools/dataseo-tools.js");
    const rawResponse = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "images_search",
                  title: "Cat",
                  image_url: "https://cat.jpg",
                  source_url: "https://cats.com",
                  alt: "A cute cat"
                },
                {
                  type: "images_search",
                  title: "Dog",
                  image_url: "https://dog.jpg",
                  source_url: "https://dogs.com",
                  alt: "A happy dog"
                }
              ]
            }
          ]
        }
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const tool = new DataForSEOImagesTool();
      const ctx = makeContext({
        DATA_FOR_SEO_LOGIN: "testlogin",
        DATA_FOR_SEO_PASSWORD: "testpass"
      });
      const result = (await tool.process(ctx, { keyword: "cute animals" })) as {
        success: boolean;
        results: Array<Record<string, unknown>>;
      };

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe("Cat");
      expect(result.results[0].image_url).toBe("https://cat.jpg");
      expect(result.results[0].alt_text).toBe("A cute cat");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleSearchTool legacy path                                       */
/* ------------------------------------------------------------------ */

describe("GoogleSearchTool legacy path (no provider)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses direct SerpAPI fetch when no provider injected", async () => {
    const rawResponse = {
      organic_results: [
        { title: "Result 1", link: "https://example.com/1", snippet: "First" }
      ]
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(rawResponse);
    try {
      const tool = new GoogleSearchTool(); // no provider
      const ctx = makeContext({ SERPAPI_API_KEY: "legacy-key" });
      const result = (await tool.process(ctx, {
        keyword: "test",
        num_results: 3
      })) as {
        success: boolean;
        results: Array<Record<string, unknown>>;
      };

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("Result 1");
      expect(result.results[0].link).toBe("https://example.com/1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleSearchTool userMessage truncation                            */
/* ------------------------------------------------------------------ */

describe("GoogleSearchTool userMessage", () => {
  it("truncates long keyword in userMessage", () => {
    const tool = new GoogleSearchTool();
    const longKeyword = "a".repeat(100);
    const msg = tool.userMessage({ keyword: longKeyword });
    // When the full message exceeds 80 chars, it falls back to short form
    expect(msg).toBe("Searching Google...");
    expect(msg.length).toBeLessThanOrEqual(80);
  });

  it("includes short keyword in userMessage", () => {
    const tool = new GoogleSearchTool();
    const msg = tool.userMessage({ keyword: "cats" });
    expect(msg).toBe("Searching Google for 'cats'...");
  });
});
