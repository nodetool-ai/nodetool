import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool
} from "../src/tools/dataseo-tools.js";
import type { ProcessingContext } from "@nodetool/runtime";

/* ------------------------------------------------------------------ */
/*  Mock context                                                      */
/* ------------------------------------------------------------------ */

function makeContext(secrets: Record<string, string> = {}): ProcessingContext {
  return {
    getSecret: vi.fn(async (key: string) => secrets[key] ?? null)
  } as unknown as ProcessingContext;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

function makeSuccessResponse(items: unknown[]) {
  return {
    status_code: 20000,
    status_message: "Ok.",
    tasks: [{ result: [{ items }] }]
  };
}

/* ------------------------------------------------------------------ */
/*  DataForSEOSearchTool                                              */
/* ------------------------------------------------------------------ */

describe("DataForSEOSearchTool", () => {
  let tool: DataForSEOSearchTool;

  beforeEach(() => {
    tool = new DataForSEOSearchTool();
    vi.restoreAllMocks();
  });

  it("returns error when keyword is missing", async () => {
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = await tool.process(ctx, {});
    expect(result).toEqual({ error: "keyword is required" });
  });

  it("returns error when credentials are missing", async () => {
    const ctx = makeContext();
    const result = await tool.process(ctx, { keyword: "test" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("DATA_FOR_SEO");
  });

  it("returns organic results on success", async () => {
    const items = [
      {
        type: "organic",
        title: "Result 1",
        url: "https://example.com/1",
        description: "Snippet 1",
        rank_absolute: 1
      },
      {
        type: "organic",
        title: "Result 2",
        url: "https://example.com/2",
        description: "Snippet 2",
        rank_absolute: 2
      },
      { type: "paid", title: "Ad" }
    ];
    const fetchMock = mockFetch(makeSuccessResponse(items));
    vi.stubGlobal("fetch", fetchMock);

    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = (await tool.process(ctx, {
      keyword: "test",
      num_results: 5
    })) as { success: boolean; results: unknown[] };

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Result 1",
      url: "https://example.com/1",
      snippet: "Snippet 1",
      position: 1,
      type: "organic"
    });

    // Check auth header
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/v3/serp/google/organic/live/advanced");
    expect(opts.headers.Authorization).toMatch(/^Basic /);
  });

  it("handles API error status", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ status_code: 40000, status_message: "Rate limit" })
    );
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = (await tool.process(ctx, { keyword: "test" })) as {
      error: string;
    };
    expect(result.error).toContain("DataForSEO API Error");
  });

  it("handles HTTP error", async () => {
    vi.stubGlobal("fetch", mockFetch({ message: "forbidden" }, false, 403));
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = (await tool.process(ctx, { keyword: "test" })) as {
      error: string;
    };
    expect(result.error).toContain("HTTP error");
  });

  it("strips base64 images from results", async () => {
    const items = [
      {
        type: "organic",
        title: "Has image",
        url: "https://example.com",
        description: "text",
        rank_absolute: 1,
        thumbnail: "data:image/png;base64,abc123"
      }
    ];
    vi.stubGlobal("fetch", mockFetch(makeSuccessResponse(items)));
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = (await tool.process(ctx, { keyword: "test" })) as {
      results: Array<Record<string, unknown>>;
    };
    // The base64 image field should not appear in the mapped result
    // (we only map title, url, snippet, position, type)
    expect(result.results[0]).not.toHaveProperty("thumbnail");
  });

  it("userMessage returns expected string", () => {
    expect(tool.userMessage({ keyword: "cats" })).toBe(
      "Searching Google (DataForSEO) for 'cats'..."
    );
    expect(
      tool.userMessage({
        keyword: "a".repeat(80)
      })
    ).toBe("Searching Google (DataForSEO)...");
  });
});

/* ------------------------------------------------------------------ */
/*  DataForSEONewsTool                                                */
/* ------------------------------------------------------------------ */

describe("DataForSEONewsTool", () => {
  let tool: DataForSEONewsTool;

  beforeEach(() => {
    tool = new DataForSEONewsTool();
    vi.restoreAllMocks();
  });

  it("returns error when keyword is missing", async () => {
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = await tool.process(ctx, {});
    expect(result).toEqual({ error: "keyword is required" });
  });

  it("returns news results on success", async () => {
    const items = [
      {
        type: "news_search",
        title: "News 1",
        url: "https://news.example.com/1",
        source: "Example News",
        description: "Breaking news",
        timestamp: "2024-01-15 10:30:00 +00:00"
      },
      {
        type: "top_stories",
        title: "Top Story",
        url: "https://news.example.com/2",
        source: "Top Source",
        description: "Top story text",
        timestamp: "2024-01-14 08:00:00 +00:00"
      },
      { type: "organic", title: "Not news" }
    ];
    vi.stubGlobal("fetch", mockFetch(makeSuccessResponse(items)));
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = (await tool.process(ctx, { keyword: "AI" })) as {
      success: boolean;
      results: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "News 1",
      url: "https://news.example.com/1",
      source: "Example News",
      published_at: "2024-01-15",
      snippet: "Breaking news",
      type: "news"
    });
  });

  it("userMessage returns expected string", () => {
    expect(tool.userMessage({ keyword: "AI" })).toBe(
      "Searching Google News (DataForSEO) for 'AI'..."
    );
  });
});

/* ------------------------------------------------------------------ */
/*  DataForSEOImagesTool                                              */
/* ------------------------------------------------------------------ */

describe("DataForSEOImagesTool", () => {
  let tool: DataForSEOImagesTool;

  beforeEach(() => {
    tool = new DataForSEOImagesTool();
    vi.restoreAllMocks();
  });

  it("returns error when neither keyword nor image_url provided", async () => {
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = await tool.process(ctx, {});
    expect(result).toEqual({
      error: "One of 'keyword' or 'image_url' is required for image search."
    });
  });

  it("returns image results on success", async () => {
    const items = [
      {
        type: "images_search",
        title: "Image 1",
        image_url: "https://example.com/img1.jpg",
        source_url: "https://example.com/page1",
        alt: "Alt text 1"
      },
      {
        type: "carousel",
        items: [
          {
            type: "carousel_element",
            title: "Carousel Image",
            image_url: "https://example.com/carousel1.jpg",
            url: "https://example.com/carousel-page"
          },
          { type: "carousel_element", title: "No image" }
        ]
      },
      { type: "other_type", title: "Ignored" }
    ];
    vi.stubGlobal("fetch", mockFetch(makeSuccessResponse(items)));
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = (await tool.process(ctx, { keyword: "cats" })) as {
      success: boolean;
      results: unknown[];
    };

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Image 1",
      image_url: "https://example.com/img1.jpg",
      source_url: "https://example.com/page1",
      alt_text: "Alt text 1",
      type: "image"
    });
    expect(result.results[1]).toEqual({
      title: "Carousel Image",
      image_url: "https://example.com/carousel1.jpg",
      source_url: "https://example.com/carousel-page",
      alt_text: "Carousel Image",
      type: "image_carousel_element"
    });
  });

  it("sends image_url in payload for reverse image search", async () => {
    const fetchMock = mockFetch(makeSuccessResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    await tool.process(ctx, {
      image_url: "https://example.com/photo.jpg"
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body[0].image_url).toBe("https://example.com/photo.jpg");
    expect(body[0]).not.toHaveProperty("keyword");
  });

  it("userMessage shows keyword when available", () => {
    expect(tool.userMessage({ keyword: "dogs" })).toBe(
      "Searching Google Images (DataForSEO) for 'dogs'..."
    );
    expect(tool.userMessage({})).toBe(
      "Searching Google Images (DataForSEO)..."
    );
  });

  it("handles network error gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network timeout"))
    );
    const ctx = makeContext({
      DATA_FOR_SEO_LOGIN: "user",
      DATA_FOR_SEO_PASSWORD: "pass"
    });
    const result = (await tool.process(ctx, { keyword: "test" })) as {
      error: string;
    };
    expect(result.error).toContain("Network timeout");
  });
});
