import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  GoogleSearchNode,
  GoogleNewsNode,
  GoogleImagesNode,
  GoogleFinanceNode,
  GoogleJobsNode,
  GoogleLensNode,
  GoogleMapsNode,
  GoogleShoppingNode,
} from "../src/nodes/search.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.SERPAPI_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SERPAPI_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const secrets = { _secrets: { SERPAPI_API_KEY: "test-key" } };

// ── GoogleSearch ──────────────────────────────────────────────────────────

describe("GoogleSearchNode", () => {
  it("returns organic results", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ organic_results: [{ title: "Result 1" }] })
    );
    const result = await node.process({ keyword: "test", ...secrets });
    expect(result.output).toEqual([{ title: "Result 1" }]);
  });

  it("throws on empty keyword", async () => {
    const node = new GoogleSearchNode();
    await expect(
      node.process({ keyword: "", ...secrets })
    ).rejects.toThrow("Keyword is required");
  });

  it("throws when API key missing", async () => {
    const node = new GoogleSearchNode();
    await expect(
      node.process({ keyword: "test" })
    ).rejects.toThrow("SERPAPI_API_KEY is required");
  });

  it("throws on SerpAPI error status", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ search_metadata: { status: "Error" }, error: "bad query" })
    );
    await expect(
      node.process({ keyword: "test", ...secrets })
    ).rejects.toThrow("bad query");
  });

  it("throws on HTTP error", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));
    await expect(
      node.process({ keyword: "test", ...secrets })
    ).rejects.toThrow("SerpAPI HTTP error: 500");
  });
});

// ── GoogleNews ────────────────────────────────────────────────────────────

describe("GoogleNewsNode", () => {
  it("returns news results", async () => {
    const node = new GoogleNewsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ news_results: [{ title: "News 1" }] })
    );
    const result = await node.process({ keyword: "ai", ...secrets });
    expect(result.output).toEqual([{ title: "News 1" }]);
  });

  it("throws on empty keyword", async () => {
    const node = new GoogleNewsNode();
    await expect(
      node.process({ keyword: "", ...secrets })
    ).rejects.toThrow("Keyword is required");
  });
});

// ── GoogleImages ──────────────────────────────────────────────────────────

describe("GoogleImagesNode", () => {
  it("returns image URIs from keyword", async () => {
    const node = new GoogleImagesNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        images_results: [{ original: "https://img.com/1.png" }],
      })
    );
    const result = await node.process({ keyword: "cats", ...secrets });
    expect(result.output).toEqual([{ uri: "https://img.com/1.png" }]);
  });

  it("uses reverse image search for image_url", async () => {
    const node = new GoogleImagesNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ images_results: [] })
    );
    await node.process({
      image_url: "https://example.com/img.jpg",
      ...secrets,
    });
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("google_reverse_image");
  });

  it("throws when both empty", async () => {
    const node = new GoogleImagesNode();
    await expect(
      node.process({ keyword: "", image_url: "", ...secrets })
    ).rejects.toThrow("One of 'keyword' or 'image_url' is required");
  });
});

// ── GoogleFinance ─────────────────────────────────────────────────────────

describe("GoogleFinanceNode", () => {
  it("returns finance data", async () => {
    const node = new GoogleFinanceNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ summary: { price: 150 } })
    );
    const result = await node.process({ query: "AAPL:NASDAQ", ...secrets });
    const output = result.output as Record<string, unknown>;
    expect(output.success).toBe(true);
  });

  it("returns error when query empty", async () => {
    const node = new GoogleFinanceNode();
    const result = await node.process({ query: "", ...secrets });
    const output = result.output as Record<string, unknown>;
    expect(output.error).toBeDefined();
  });
});

// ── GoogleJobs ────────────────────────────────────────────────────────────

describe("GoogleJobsNode", () => {
  it("returns job results", async () => {
    const node = new GoogleJobsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ jobs_results: [{ title: "Engineer" }] })
    );
    const result = await node.process({ query: "software", ...secrets });
    expect(result.output).toEqual([{ title: "Engineer" }]);
  });

  it("throws on empty query", async () => {
    const node = new GoogleJobsNode();
    await expect(
      node.process({ query: "", ...secrets })
    ).rejects.toThrow("Query is required");
  });
});

// ── GoogleLens ────────────────────────────────────────────────────────────

describe("GoogleLensNode", () => {
  it("returns visual matches", async () => {
    const node = new GoogleLensNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        visual_matches: [{ image: "https://img.com/match.png", title: "Match" }],
      })
    );
    const result = await node.process({
      image_url: "https://example.com/img.jpg",
      ...secrets,
    });
    const output = result.output as Record<string, unknown>;
    expect((output.results as unknown[]).length).toBe(1);
    expect((output.images as { uri: string }[])[0].uri).toBe(
      "https://img.com/match.png"
    );
  });

  it("throws on empty image_url", async () => {
    const node = new GoogleLensNode();
    await expect(
      node.process({ image_url: "", ...secrets })
    ).rejects.toThrow("Image URL is required");
  });
});

// ── GoogleMaps ────────────────────────────────────────────────────────────

describe("GoogleMapsNode", () => {
  it("returns places with renamed type field", async () => {
    const node = new GoogleMapsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        local_results: [{ title: "Cafe", type: "restaurant", rating: 4.5 }],
      })
    );
    const result = await node.process({ query: "cafes", ...secrets });
    const output = result.output as Array<Record<string, unknown>>;
    expect(output[0].place_type).toBe("restaurant");
    expect(output[0].type).toBeUndefined();
  });

  it("throws on empty query", async () => {
    const node = new GoogleMapsNode();
    await expect(
      node.process({ query: "", ...secrets })
    ).rejects.toThrow("Query is required");
  });
});

// ── GoogleShopping ────────────────────────────────────────────────────────

describe("GoogleShoppingNode", () => {
  it("returns shopping results", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ shopping_results: [{ title: "Widget", price: "$10" }] })
    );
    const result = await node.process({ query: "widget", ...secrets });
    expect(result.output).toEqual([{ title: "Widget", price: "$10" }]);
  });

  it("builds tbs filter for price and condition", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ shopping_results: [] })
    );
    await node.process({
      query: "phone",
      min_price: 100,
      max_price: 500,
      condition: "new",
      sort_by: "review_score",
      ...secrets,
    });
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("ppr_min%3A100");
    expect(url).toContain("ppr_max%3A500");
    expect(url).toContain("p_cond%3Anew");
    expect(url).toContain("sort%3Areview_score");
  });

  it("throws on empty query", async () => {
    const node = new GoogleShoppingNode();
    await expect(
      node.process({ query: "", ...secrets })
    ).rejects.toThrow("Query is required");
  });
});
