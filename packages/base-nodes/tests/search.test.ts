import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  GoogleSearchNode,
  GoogleNewsNode,
  GoogleImagesNode,
  GoogleFinanceNode,
  GoogleJobsNode,
  GoogleLensNode,
  GoogleMapsNode,
  GoogleShoppingNode
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
    text: async () => JSON.stringify(body)
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
    node.assign({ keyword: "test" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toEqual([{ title: "Result 1" }]);
  });

  it("throws on empty keyword", async () => {
    const node = new GoogleSearchNode();
    node.assign({ keyword: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Keyword is required");
  });

  it("throws when API key missing", async () => {
    const node = new GoogleSearchNode();
    node.assign({ keyword: "test" });
    await expect(node.process()).rejects.toThrow("SERPAPI_API_KEY is required");
  });

  it("throws on SerpAPI error status", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ search_metadata: { status: "Error" }, error: "bad query" })
    );
    node.assign({ keyword: "test" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("bad query");
  });

  it("throws on HTTP error", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 500));
    node.assign({ keyword: "test" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("SerpAPI HTTP error: 500");
  });
});

// ── GoogleNews ────────────────────────────────────────────────────────────

describe("GoogleNewsNode", () => {
  it("returns news results", async () => {
    const node = new GoogleNewsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ news_results: [{ title: "News 1" }] })
    );
    node.assign({ keyword: "ai" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toEqual([{ title: "News 1" }]);
  });

  it("throws on empty keyword", async () => {
    const node = new GoogleNewsNode();
    node.assign({ keyword: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Keyword is required");
  });
});

// ── GoogleImages ──────────────────────────────────────────────────────────

describe("GoogleImagesNode", () => {
  it("returns image URIs from keyword", async () => {
    const node = new GoogleImagesNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        images_results: [{ original: "https://img.com/1.png" }]
      })
    );
    node.assign({ keyword: "cats" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toEqual([{ uri: "https://img.com/1.png" }]);
  });

  it("uses reverse image search for image_url", async () => {
    const node = new GoogleImagesNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ images_results: [] }));
    node.assign({
      image_url: "https://example.com/img.jpg"
    });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await node.process();
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("google_reverse_image");
  });

  it("throws when both empty", async () => {
    const node = new GoogleImagesNode();
    node.assign({ keyword: "", image_url: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow(
      "One of 'keyword' or 'image_url' is required"
    );
  });
});

// ── GoogleFinance ─────────────────────────────────────────────────────────

describe("GoogleFinanceNode", () => {
  it("returns finance data with full output shape", async () => {
    const node = new GoogleFinanceNode();
    const apiData = {
      summary: { price: 150, currency: "USD" },
      markets: { us: [] }
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(apiData));
    node.assign({ query: "AAPL:NASDAQ" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.success).toBe(true);
    expect(output.results).toEqual(apiData);
    expect(typeof output.results).toBe("object");
    expect((output.results as Record<string, unknown>).summary).toEqual({
      price: 150,
      currency: "USD"
    });
  });

  it("passes window parameter when provided", async () => {
    const node = new GoogleFinanceNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ graph: [1, 2, 3] }));
    node.assign({ query: "GOOG:NASDAQ", window: "1y" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.success).toBe(true);
    expect(output.results).toEqual({ graph: [1, 2, 3] });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("window=1y");
    expect(url).toContain("engine=google_finance");
  });

  it("returns error object with exact message when query empty", async () => {
    const node = new GoogleFinanceNode();
    node.assign({ query: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output).toEqual({
      error: "Query is required for Google Finance search."
    });
    expect(output.success).toBeUndefined();
    expect(output.results).toBeUndefined();
  });

  it("throws when API key missing", async () => {
    const node = new GoogleFinanceNode();
    node.assign({ query: "AAPL" });
    await expect(node.process()).rejects.toThrow("SERPAPI_API_KEY is required");
  });
});

// ── GoogleJobs ────────────────────────────────────────────────────────────

describe("GoogleJobsNode", () => {
  it("returns job results", async () => {
    const node = new GoogleJobsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ jobs_results: [{ title: "Engineer" }] })
    );
    node.assign({ query: "software" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toEqual([{ title: "Engineer" }]);
  });

  it("throws on empty query", async () => {
    const node = new GoogleJobsNode();
    node.assign({ query: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Query is required");
  });
});

// ── GoogleLens ────────────────────────────────────────────────────────────

describe("GoogleLensNode", () => {
  it("returns visual matches", async () => {
    const node = new GoogleLensNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        visual_matches: [{ image: "https://img.com/match.png", title: "Match" }]
      })
    );
    node.assign({
      image_url: "https://example.com/img.jpg"
    });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect((output.results as unknown[]).length).toBe(1);
    expect((output.images as { uri: string }[])[0].uri).toBe(
      "https://img.com/match.png"
    );
  });

  it("throws on empty image_url", async () => {
    const node = new GoogleLensNode();
    node.assign({ image_url: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Image URL is required");
  });
});

// ── GoogleMaps ────────────────────────────────────────────────────────────

describe("GoogleMapsNode", () => {
  it("returns places with renamed type field", async () => {
    const node = new GoogleMapsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        local_results: [{ title: "Cafe", type: "restaurant", rating: 4.5 }]
      })
    );
    node.assign({ query: "cafes" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    const output = result.output as Array<Record<string, unknown>>;
    expect(output[0].place_type).toBe("restaurant");
    expect(output[0].type).toBeUndefined();
  });

  it("throws on empty query", async () => {
    const node = new GoogleMapsNode();
    node.assign({ query: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Query is required");
  });
});

// ── GoogleShopping ────────────────────────────────────────────────────────

describe("GoogleShoppingNode", () => {
  it("returns shopping results", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ shopping_results: [{ title: "Widget", price: "$10" }] })
    );
    node.assign({ query: "widget" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    const result = await node.process();
    expect(result.output).toEqual([{ title: "Widget", price: "$10" }]);
  });

  it("builds tbs filter for price and condition", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));
    node.assign({
      query: "phone",
      min_price: 100,
      max_price: 500,
      condition: "new",
      sort_by: "review_score"
    });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await node.process();
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("ppr_min%3A100");
    expect(url).toContain("ppr_max%3A500");
    expect(url).toContain("p_cond%3Anew");
    expect(url).toContain("sort%3Areview_score");
  });

  it("throws on empty query", async () => {
    const node = new GoogleShoppingNode();
    node.assign({ query: "" });
    node.setDynamic("_secrets", { SERPAPI_API_KEY: "test-key" });
    await expect(node.process()).rejects.toThrow("Query is required");
  });
});
