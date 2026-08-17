import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

vi.mock("openai", () => ({
  OpenAI: class {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "openai backend answer" } }]
        })
      }
    };
  }
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Routing reads real configuration (secrets/env), so ambient keys in the test
 * process would change which backend is picked. Pin them all to absent.
 */
const BACKEND_ENV_KEYS = [
  "SERPAPI_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DATA_FOR_SEO_LOGIN",
  "DATA_FOR_SEO_PASSWORD"
] as const;
const envStash: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of BACKEND_ENV_KEYS) {
    envStash[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of BACKEND_ENV_KEYS) {
    if (envStash[key] === undefined) delete process.env[key];
    else process.env[key] = envStash[key];
  }
});

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
/*  WebSearchTool                                                  */
/* ------------------------------------------------------------------ */

describe("WebSearchTool", () => {
  const tool = toolForCapabilityName("web_search");
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
    delete process.env.SERPAPI_API_KEY;
  });

  it("returns organic results as formatted text", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    fetchSpy = stubFetch({
      organic_results: [
        { title: "Result 1", link: "https://a.com", snippet: "Snippet 1" },
        { title: "Result 2", link: "https://b.com", snippet: "Snippet 2" }
      ]
    });

    const result = (await tool.process(ctx, {
      query: "test query"
    })) as string;

    expect(typeof result).toBe("string");
    expect(result).toContain("1. Result 1");
    expect(result).toContain("https://a.com");
    expect(result).toContain("Snippet 1");
    expect(result).toContain("2. Result 2");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("engine=google");
    expect(calledUrl).toContain("q=test+query");
    expect(calledUrl).toContain("api_key=test-key");
  });

  it("accepts the legacy `keyword` arg for backwards compat", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    fetchSpy = stubFetch({
      organic_results: [{ title: "X", link: "https://x.com", snippet: "S" }]
    });
    const result = (await tool.process(ctx, {
      keyword: "still works"
    })) as string;
    expect(result).toContain("1. X");
  });

  it("returns error string when query is missing", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    const result = await tool.process(ctx, {});
    expect(result).toBe("Error: query is required");
  });

  it("throws when API key is missing", async () => {
    const ctx = makeContext({});
    await expect(tool.process(ctx, { query: "test" })).rejects.toThrow(
      "SERPAPI_API_KEY"
    );
  });

  it("falls back to process.env for API key", async () => {
    process.env.SERPAPI_API_KEY = "env-key";
    const ctx = makeContext({});
    fetchSpy = stubFetch({ organic_results: [] });

    const result = (await tool.process(ctx, { query: "test" })) as string;
    expect(result).toBe("No results.");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("api_key=env-key");
  });

  it("renders empty organic_results as 'No results.'", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    fetchSpy = stubFetch({ organic_results: [] });

    const result = (await tool.process(ctx, { query: "nothing" })) as string;
    expect(result).toBe("No results.");
  });

  it("allowlist matches on a label boundary, not a bare suffix (#19)", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    fetchSpy = stubFetch({
      organic_results: [
        { title: "Real", link: "https://bank.com/login", snippet: "s" },
        { title: "Sub", link: "https://secure.bank.com/x", snippet: "s" },
        // Look-alike domain that a bare endsWith("bank.com") would wrongly keep.
        { title: "Phish", link: "https://fakebank.com/login", snippet: "s" }
      ]
    });

    const result = (await tool.process(ctx, {
      query: "login help",
      allowed_domains: ["bank.com"]
    })) as string;

    expect(result).toContain("bank.com/login");
    expect(result).toContain("secure.bank.com");
    expect(result).not.toContain("fakebank.com");
  });

  it("blocklist does not over-block look-alike domains (#19)", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    fetchSpy = stubFetch({
      organic_results: [
        { title: "Ad", link: "https://ads.com/x", snippet: "s" },
        // "downloads.com" ends with "ads.com" but is unrelated — must survive.
        { title: "DL", link: "https://downloads.com/y", snippet: "s" }
      ]
    });

    const result = (await tool.process(ctx, {
      query: "files",
      blocked_domains: ["ads.com"]
    })) as string;

    expect(result).not.toContain("ads.com/x");
    expect(result).toContain("downloads.com");
  });

  it("userMessage returns search description", () => {
    expect(tool.userMessage({ query: "cats" })).toBe(
      "Searching the web for 'cats'"
    );
  });

  it("userMessage truncates long queries", () => {
    const longQuery = "a".repeat(200);
    expect(tool.userMessage({ query: longQuery })).toBe("Searching the web");
  });

  it("throws when SerpAPI returns non-OK response", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "test-key" });
    fetchSpy = stubFetch({ error: "bad request" }, 400);

    await expect(tool.process(ctx, { query: "test" })).rejects.toThrow(
      "SerpAPI request failed (400)"
    );
  });

  it("has correct provider tool shape", () => {
    const pt = tool.toProviderTool();
    expect(pt.name).toBe("web_search");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleNewsTool                                                    */
/* ------------------------------------------------------------------ */

describe("GoogleNewsTool", () => {
  const tool = toolForCapabilityName("google_news");
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

  it("refuses a missing query, naming it, without reaching a backend", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    fetchSpy = stubFetch({});
    const result = (await tool.process(ctx, {})) as Record<string, unknown>;
    // The key is configured, so an unguarded call would spend a real request.
    expect(result.error).toEqual(expect.stringContaining("keyword"));
    expect(fetchSpy).not.toHaveBeenCalled();
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
  const tool = toolForCapabilityName("google_images");
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

  it("refuses a missing query, naming it, without reaching a backend", async () => {
    const ctx = makeContext({ SERPAPI_API_KEY: "k" });
    fetchSpy = stubFetch({});
    const result = (await tool.process(ctx, {})) as Record<string, unknown>;
    // The key is configured, so an unguarded call would spend a real request.
    expect(result.error).toEqual(expect.stringContaining("keyword"));
    expect(fetchSpy).not.toHaveBeenCalled();
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

/* ------------------------------------------------------------------ */
/*  Host-side backend routing                                         */
/* ------------------------------------------------------------------ */

describe("search backend routing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
  });

  it("web_search falls to the OpenAI backend when SerpAPI is unconfigured", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({ OPENAI_API_KEY: "ok" });
    const result = await tool.process(ctx, { query: "fox" });
    expect(result).toBe("openai backend answer");
  });

  it("web_search falls to DataForSEO when only its credentials exist", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    fetchSpy = stubFetch({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "organic",
                  title: "Fox facts",
                  url: "https://foxes.example",
                  description: "All about foxes"
                }
              ]
            }
          ]
        }
      ]
    });
    const result = (await tool.process(ctx, { query: "fox" })) as string;
    expect(result).toContain("1. Fox facts");
    expect(result).toContain("https://foxes.example");
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain("api.dataforseo.com");
  });

  it("web_search pinned to the Gemini backend formats text plus sources", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({
      SERPAPI_API_KEY: "serp",
      GEMINI_API_KEY: "gem"
    });
    fetchSpy = stubFetch({
      candidates: [
        {
          content: { parts: [{ text: "Grounded answer." }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { title: "Source A", uri: "https://a.example" } }
            ]
          }
        }
      ]
    });
    const result = (await tool.process(ctx, {
      query: "fox",
      backend: "gemini"
    })) as string;
    expect(result).toContain("Grounded answer.");
    expect(result).toContain("Sources:");
    expect(result).toContain("https://a.example");
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain("generativelanguage.googleapis.com");
  });

  it("a pin overrides preference order even when earlier backends are configured", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({
      SERPAPI_API_KEY: "serp",
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    fetchSpy = stubFetch({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [{ result: [{ items: [] }] }]
    });
    await tool.process(ctx, { query: "fox", backend: "dataforseo" });
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain("api.dataforseo.com");
  });

  it("a pinned unconfigured backend is an error naming the missing key", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({ SERPAPI_API_KEY: "serp" });
    await expect(
      tool.process(ctx, { query: "fox", backend: "openai" })
    ).rejects.toThrow(/openai.*OPENAI_API_KEY/);
    await expect(
      toolForCapabilityName("google_news").process(ctx, {
        keyword: "fox",
        backend: "dataforseo"
      })
    ).rejects.toThrow(/DATA_FOR_SEO_LOGIN and DATA_FOR_SEO_PASSWORD/);
  });

  it("an unknown backend pin is an error listing the valid ones", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({ SERPAPI_API_KEY: "serp" });
    await expect(
      tool.process(ctx, { query: "fox", backend: "bing" })
    ).rejects.toThrow(/unknown backend "bing".*serpapi, openai, gemini, dataforseo/);
  });

  it('backend "default" means the tool\'s own first backend', async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({ SERPAPI_API_KEY: "serp" });
    fetchSpy = stubFetch({ organic_results: [] });
    const result = await tool.process(ctx, {
      query: "fox",
      backend: "default"
    });
    expect(result).toBe("No results.");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("serpapi.com");
  });

  it("a real error from a configured backend does not fall through", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({
      SERPAPI_API_KEY: "serp",
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    fetchSpy = stubFetch({ error: "boom" }, 500);
    await expect(tool.process(ctx, { query: "fox" })).rejects.toThrow(
      "SerpAPI request failed (500)"
    );
    // Only the SerpAPI call happened — no DataForSEO fallthrough.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("serpapi.com");
  });

  it("google_news routes to DataForSEO and keeps its result shape", async () => {
    const tool = toolForCapabilityName("google_news");
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    fetchSpy = stubFetch({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "news_search",
                  title: "Fox news item",
                  url: "https://news.example/fox",
                  source: "Example News",
                  timestamp: "2026-08-01 10:00:00 +00:00",
                  description: "A fox did something."
                }
              ]
            }
          ]
        }
      ]
    });
    const result = (await tool.process(ctx, { keyword: "fox" })) as Record<
      string,
      unknown
    >;
    expect(result.success).toBe(true);
    expect(result.results).toEqual([
      {
        title: "Fox news item",
        link: "https://news.example/fox",
        snippet: "A fox did something.",
        date: "2026-08-01",
        source: "Example News"
      }
    ]);
  });

  it("google_images routes to DataForSEO and keeps its result shape", async () => {
    const tool = toolForCapabilityName("google_images");
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    fetchSpy = stubFetch({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          result: [
            {
              items: [
                {
                  type: "images_search",
                  title: "A fox",
                  image_url: "https://img.example/fox.jpg",
                  source_url: "https://page.example/fox",
                  alt: "fox"
                }
              ]
            }
          ]
        }
      ]
    });
    const result = (await tool.process(ctx, { keyword: "fox" })) as Record<
      string,
      unknown
    >;
    expect(result.success).toBe(true);
    expect(result.results).toEqual([
      {
        title: "A fox",
        link: "https://page.example/fox",
        original: "https://img.example/fox.jpg",
        thumbnail: null
      }
    ]);
  });

  it("no configured backend at all names every missing key", async () => {
    const tool = toolForCapabilityName("web_search");
    const ctx = makeContext({});
    await expect(tool.process(ctx, { query: "fox" })).rejects.toThrow(
      /no search backend is configured.*SERPAPI_API_KEY.*OPENAI_API_KEY.*GEMINI_API_KEY.*DATA_FOR_SEO_LOGIN/
    );
  });
});
