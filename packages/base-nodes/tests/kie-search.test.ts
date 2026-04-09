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

// ── GoogleSearchNode ───────────────────────────────────────────────────────

describe("GoogleSearchNode", () => {
  it("returns organic results", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        organic_results: [{ title: "Result 1" }, { title: "Result 2" }],
        search_metadata: { status: "Success" }
      })
    );

    node.assign({
      keyword: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([
      { title: "Result 1" },
      { title: "Result 2" }
    ]);
  });

  it("returns empty array when no organic_results", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ search_metadata: { status: "Success" } })
    );

    node.assign({
      keyword: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([]);
  });

  it("throws when keyword is empty", async () => {
    const node = new GoogleSearchNode();

    node.assign({
      keyword: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Keyword is required");
  });

  it("throws when API key missing", async () => {
    const node = new GoogleSearchNode();

    node.assign({
      keyword: "test"
    });

    await expect(node.process()).rejects.toThrow("SERPAPI_API_KEY is required");
  });

  it("throws on HTTP error", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("err", 429));

    node.assign({
      keyword: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("SerpAPI HTTP error: 429");
  });

  it("throws on SerpAPI error in response", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Invalid API key" }));

    node.assign({
      keyword: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Invalid API key");
  });

  it("throws on SerpAPI metadata error status", async () => {
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        search_metadata: { status: "Error" }
      })
    );

    node.assign({
      keyword: "test"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("SerpAPI returned an error");
  });

  it("uses env var API key", async () => {
    process.env.SERPAPI_API_KEY = "env-key";
    const node = new GoogleSearchNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ organic_results: [] }));

    node.assign({
      keyword: "test"
    });

    const result = await node.process();
    expect(result.results).toEqual([]);
  });
});

// ── GoogleNewsNode ─────────────────────────────────────────────────────────

describe("GoogleNewsNode", () => {
  it("returns news results", async () => {
    const node = new GoogleNewsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ news_results: [{ title: "News 1" }] })
    );

    node.assign({
      keyword: "AI"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([{ title: "News 1" }]);
  });

  it("returns empty array when no news_results", async () => {
    const node = new GoogleNewsNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    node.assign({
      keyword: "AI"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([]);
  });

  it("throws when keyword is empty", async () => {
    const node = new GoogleNewsNode();

    node.assign({
      keyword: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Keyword is required");
  });
});

// ── GoogleImagesNode ───────────────────────────────────────────────────────

describe("GoogleImagesNode", () => {
  it("returns image results with keyword", async () => {
    const node = new GoogleImagesNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        images_results: [
          { original: "https://example.com/img1.jpg" },
          { original: "https://example.com/img2.jpg" }
        ]
      })
    );

    node.assign({
      keyword: "cats"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([
      { uri: "https://example.com/img1.jpg" },
      { uri: "https://example.com/img2.jpg" }
    ]);
  });

  it("uses reverse image search with image_url", async () => {
    const node = new GoogleImagesNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        images_results: [{ original: "https://match.com/img.jpg" }]
      })
    );

    node.assign({
      image_url: "https://example.com/photo.jpg"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([{ uri: "https://match.com/img.jpg" }]);
  });

  it("returns empty when no images_results", async () => {
    const node = new GoogleImagesNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    node.assign({
      keyword: "cats"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([]);
  });

  it("throws when both keyword and image_url empty", async () => {
    const node = new GoogleImagesNode();

    node.assign({
      keyword: "",
      image_url: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "One of 'keyword' or 'image_url' is required"
    );
  });
});

// ── GoogleFinanceNode ──────────────────────────────────────────────────────

describe("GoogleFinanceNode", () => {
  it("returns finance data", async () => {
    const node = new GoogleFinanceNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ price: "$150", change: "+2%" })
    );

    node.assign({
      query: "AAPL:NASDAQ"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual({ price: "$150", change: "+2%" });
  });

  it("returns error when query is empty", async () => {
    const node = new GoogleFinanceNode();

    node.assign({
      query: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Query is required for Google Finance search."
    );
  });

  it("passes window parameter when set", async () => {
    const node = new GoogleFinanceNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: "chart" }));

    node.assign({
      query: "GOOG:NASDAQ",
      window: "1Y"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("window=1Y");
  });
});

// ── GoogleJobsNode ─────────────────────────────────────────────────────────

describe("GoogleJobsNode", () => {
  it("returns job results", async () => {
    const node = new GoogleJobsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ jobs_results: [{ title: "Software Engineer" }] })
    );

    node.assign({
      query: "software engineer"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([{ title: "Software Engineer" }]);
  });

  it("returns empty array when no jobs_results", async () => {
    const node = new GoogleJobsNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    node.assign({
      query: "engineer"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([]);
  });

  it("throws when query is empty", async () => {
    const node = new GoogleJobsNode();

    node.assign({
      query: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Query is required for Google Jobs search"
    );
  });

  it("passes location parameter", async () => {
    const node = new GoogleJobsNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ jobs_results: [] }));

    node.assign({
      query: "engineer",
      location: "San Francisco"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("location=San");
  });
});

// ── GoogleLensNode ─────────────────────────────────────────────────────────

describe("GoogleLensNode", () => {
  it("returns visual matches and images", async () => {
    const node = new GoogleLensNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        visual_matches: [
          { image: "https://example.com/match.jpg", title: "Match" }
        ]
      })
    );

    node.assign({
      image_url: "https://example.com/photo.jpg"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([
      { image: "https://example.com/match.jpg", title: "Match" }
    ]);
    expect(result.images).toEqual([{ uri: "https://example.com/match.jpg" }]);
  });

  it("falls back to thumbnail when image missing", async () => {
    const node = new GoogleLensNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        visual_matches: [{ thumbnail: "https://example.com/thumb.jpg" }]
      })
    );

    node.assign({
      image_url: "https://example.com/photo.jpg"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect((result.images as { uri: string }[])[0].uri).toBe(
      "https://example.com/thumb.jpg"
    );
  });

  it("throws when image_url is empty", async () => {
    const node = new GoogleLensNode();

    node.assign({
      image_url: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Image URL is required for Google Lens search"
    );
  });
});

// ── GoogleMapsNode ─────────────────────────────────────────────────────────

describe("GoogleMapsNode", () => {
  it("returns local results with place_type", async () => {
    const node = new GoogleMapsNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        local_results: [{ title: "Coffee Shop", type: "cafe", rating: 4.5 }]
      })
    );

    node.assign({
      query: "coffee shops"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([
      { title: "Coffee Shop", place_type: "cafe", rating: 4.5 }
    ]);
  });

  it("returns empty array when no local_results", async () => {
    const node = new GoogleMapsNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    node.assign({
      query: "nothing"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([]);
  });

  it("throws when query is empty", async () => {
    const node = new GoogleMapsNode();

    node.assign({
      query: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Query is required for map search"
    );
  });
});

// ── GoogleShoppingNode ─────────────────────────────────────────────────────

describe("GoogleShoppingNode", () => {
  it("returns shopping results", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        shopping_results: [{ title: "Laptop", price: "$999" }]
      })
    );

    node.assign({
      query: "laptop"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([{ title: "Laptop", price: "$999" }]);
  });

  it("returns empty array when no shopping_results", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    node.assign({
      query: "nothing"
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.results).toEqual([]);
  });

  it("throws when query is empty", async () => {
    const node = new GoogleShoppingNode();

    node.assign({
      query: ""
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Query is required for Google Shopping search"
    );
  });

  it("builds tbs filter with price range", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));

    node.assign({
      query: "laptop",
      min_price: 500,
      max_price: 1000
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("ppr_min%3A500");
    expect(url).toContain("ppr_max%3A1000");
  });

  it("builds tbs filter with condition=new", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));

    node.assign({
      query: "phone",
      condition: "new"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("p_cond%3Anew");
  });

  it("builds tbs filter with condition=used", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));

    node.assign({
      query: "phone",
      condition: "used"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("p_cond%3Aused");
  });

  it("builds tbs filter with sort_by", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));

    node.assign({
      query: "phone",
      sort_by: "price_low_to_high"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("sort%3Aprice_low_to_high");
  });
});

// ── Defaults coverage ────────────────────────────────────────────────────

describe("Node defaults coverage", () => {
  it("GoogleSearchNode defaults", () => {
    const node = new GoogleSearchNode();
    const d = node.serialize();
    expect(d.keyword).toBe("");
    expect(d.num_results).toBe(10);
  });

  it("GoogleNewsNode defaults", () => {
    const node = new GoogleNewsNode();
    const d = node.serialize();
    expect(d.keyword).toBe("");
    expect(d.num_results).toBe(10);
  });

  it("GoogleImagesNode defaults", () => {
    const node = new GoogleImagesNode();
    const d = node.serialize();
    expect(d.keyword).toBe("");
    expect(d.image_url).toBe("");
    expect(d.num_results).toBe(20);
  });

  it("GoogleFinanceNode defaults", () => {
    const node = new GoogleFinanceNode();
    const d = node.serialize();
    expect(d.query).toBe("");
    expect(d.window).toBe("");
  });

  it("GoogleJobsNode defaults", () => {
    const node = new GoogleJobsNode();
    const d = node.serialize();
    expect(d.query).toBe("");
    expect(d.location).toBe("");
    expect(d.num_results).toBe(10);
  });

  it("GoogleLensNode defaults", () => {
    const node = new GoogleLensNode();
    const d = node.serialize();
    expect(d.image_url).toBe("");
    expect(d.num_results).toBe(10);
  });

  it("GoogleMapsNode defaults", () => {
    const node = new GoogleMapsNode();
    const d = node.serialize();
    expect(d.query).toBe("");
    expect(d.num_results).toBe(10);
  });

  it("GoogleShoppingNode defaults", () => {
    const node = new GoogleShoppingNode();
    const d = node.serialize();
    expect(d.query).toBe("");
    expect(d.country).toBe("us");
    expect(d.min_price).toBe(0);
    expect(d.max_price).toBe(0);
    expect(d.condition).toBe("");
    expect(d.sort_by).toBe("");
    expect(d.num_results).toBe(10);
  });

  it("GoogleShoppingNode with only min_price", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));

    node.assign({
      query: "laptop",
      min_price: 100
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("ppr_min%3A100");
  });

  it("GoogleShoppingNode with only max_price", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));

    node.assign({
      query: "laptop",
      max_price: 500
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("ppr_max%3A500");
  });

  it("GoogleShoppingNode with refurbished condition", async () => {
    const node = new GoogleShoppingNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ shopping_results: [] }));

    node.assign({
      query: "phone",
      condition: "refurbished"
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("p_cond%3Aused");
  });
});
