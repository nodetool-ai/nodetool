import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool
} from "../src/tools/search-tools.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Build a mock ProcessingContext whose getSecret returns the given map. */
function makeContext(secrets: Record<string, string | null> = {}) {
  return {
    getSecret: vi.fn(async (key: string) => secrets[key] ?? null)
  } as any;
}

/** Stub global.fetch to return the given JSON body. */
function stubFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response);
}

/* ------------------------------------------------------------------ */
/*  GoogleSearchTool                                                  */
/* ------------------------------------------------------------------ */

describe("GoogleSearchTool", () => {
  const tool = new GoogleSearchTool();
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
    delete process.env.SERPAPI_API_KEY;
  });

  it("parses organic results from SerpAPI response", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    fetchSpy = stubFetch({
      organic_results: [
        { title: "Result 1", link: "https://a.com", snippet: "Snippet 1" },
        { title: "Result 2", link: "https://b.com", snippet: "Snippet 2" }
      ]
    });

    const result = (await tool.process(ctx, {
      keyword: "test query"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.results).toEqual([
      { title: "Result 1", link: "https://a.com", snippet: "Snippet 1" },
      { title: "Result 2", link: "https://b.com", snippet: "Snippet 2" }
    ]);

    // Verify the URL contains the correct engine and query
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("engine=google");
    expect(calledUrl).toContain("q=test+query");
    expect(calledUrl).toContain("api_key=test-key");
  });

  it("returns error when query is missing", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    const result = (await tool.process(ctx, {})) as Record<string, unknown>;
    expect(result.error).toBeDefined();
  });

  it("throws when API key is missing", async () => {
    const ctx = makeContext({});
    await expect(tool.process(ctx, { keyword: "test" })).rejects.toThrow(
      "SERPAPI_API_KEY"
    );
  });

  it("falls back to process.env for API key", async () => {
    process.env.SERPAPI_API_KEY = "env-key";
    const ctx = makeContext({}); // no secret resolver value
    fetchSpy = stubFetch({ organic_results: [] });

    const result = (await tool.process(ctx, {
      keyword: "test"
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("api_key=env-key");
  });

  it("handles empty organic_results", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    fetchSpy = stubFetch({ organic_results: [] });

    const result = (await tool.process(ctx, {
      keyword: "nothing"
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  });

  it("userMessage returns search description", () => {
    expect(tool.userMessage({ keyword: "cats" })).toBe(
      "Searching Google for 'cats'..."
    );
  });

  it("userMessage truncates long queries", () => {
    const longQuery = "a".repeat(200);
    expect(tool.userMessage({ keyword: longQuery })).toBe(
      "Searching Google..."
    );
  });

  it("throws when SerpAPI returns non-OK response", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    fetchSpy = stubFetch({ error: "bad request" }, 400);

    await expect(tool.process(ctx, { keyword: "test" })).rejects.toThrow(
      "SerpAPI request failed (400)"
    );
  });

  it("has correct provider tool shape", () => {
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("google_search");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleNewsTool                                                    */
/* ------------------------------------------------------------------ */

describe("GoogleNewsTool", () => {
  const tool = new GoogleNewsTool();
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
    delete process.env.SERPAPI_API_KEY;
  });

  it("parses news results from SerpAPI response", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    fetchSpy = stubFetch({
      news_results: [
        {
          title: "News 1",
          link: "https://n1.com",
          snippet: "Breaking news",
          date: "2 hours ago",
          source: { name: "CNN" }
        }
      ]
    });

    const result = (await tool.process(ctx, {
      keyword: "AI"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.results).toEqual([
      {
        title: "News 1",
        link: "https://n1.com",
        snippet: "Breaking news",
        date: "2 hours ago",
        source: "CNN"
      }
    ]);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("engine=google_news");
  });

  it("returns error when query is missing", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    const result = (await tool.process(ctx, {})) as Record<string, unknown>;
    expect(result.error).toBeDefined();
  });

  it("throws when API key is missing", async () => {
    const ctx = makeContext({});
    await expect(tool.process(ctx, { keyword: "test" })).rejects.toThrow(
      "SERPAPI_API_KEY"
    );
  });

  it("userMessage returns news search description", () => {
    expect(tool.userMessage({ keyword: "AI" })).toBe(
      "Searching Google News for 'AI'..."
    );
  });

  it("userMessage truncates long queries", () => {
    const longQuery = "a".repeat(200);
    expect(tool.userMessage({ keyword: longQuery })).toBe(
      "Searching Google News..."
    );
  });

  it("has correct provider tool shape", () => {
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("google_news");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleImagesTool                                                  */
/* ------------------------------------------------------------------ */

describe("GoogleImagesTool", () => {
  const tool = new GoogleImagesTool();
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
    delete process.env.SERPAPI_API_KEY;
  });

  it("parses image results from SerpAPI response", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    fetchSpy = stubFetch({
      images_results: [
        {
          title: "Cat photo",
          link: "https://cats.com/1",
          original: "https://cats.com/1.jpg",
          thumbnail: "https://cats.com/1_thumb.jpg"
        },
        {
          title: "Dog photo",
          link: "https://dogs.com/1",
          original: "https://dogs.com/1.jpg",
          thumbnail: "https://dogs.com/1_thumb.jpg"
        }
      ]
    });

    const result = (await tool.process(ctx, {
      keyword: "cute animals"
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Cat photo",
      link: "https://cats.com/1",
      original: "https://cats.com/1.jpg",
      thumbnail: "https://cats.com/1_thumb.jpg"
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("engine=google_images");
  });

  it("returns error when query is missing", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    const result = (await tool.process(ctx, {})) as Record<string, unknown>;
    expect(result.error).toBeDefined();
  });

  it("throws when API key is missing", async () => {
    const ctx = makeContext({});
    await expect(tool.process(ctx, { keyword: "test" })).rejects.toThrow(
      "SERPAPI_API_KEY"
    );
  });

  it("handles empty images_results", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    fetchSpy = stubFetch({ images_results: [] });

    const result = (await tool.process(ctx, {
      keyword: "nothing"
    })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  });

  it("userMessage returns image search description", () => {
    expect(tool.userMessage({ keyword: "sunset" })).toBe(
      "Searching Google Images for 'sunset'..."
    );
  });

  it("userMessage truncates long queries", () => {
    const longQuery = "a".repeat(200);
    expect(tool.userMessage({ keyword: longQuery })).toBe(
      "Searching Google Images..."
    );
  });

  it("has correct provider tool shape", () => {
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("google_images");
    expect(pt.inputSchema).toBeDefined();
  });
});
