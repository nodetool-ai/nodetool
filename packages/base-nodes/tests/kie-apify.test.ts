import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";
import {
  ApifyWebScraperNode,
  ApifyGoogleSearchScraperNode,
  ApifyInstagramScraperNode,
  ApifyAmazonScraperNode,
  ApifyYouTubeScraperNode,
  ApifyTwitterScraperNode,
  ApifyLinkedInScraperNode
} from "../src/nodes/apify.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
  delete process.env.APIFY_API_TOKEN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.APIFY_API_TOKEN;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

const secrets = { _secrets: { APIFY_API_TOKEN: "test-key" } };

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}

/** Mock a successful runActor flow: POST actor run -> GET dataset items */
function mockRunActor(items: Record<string, unknown>[]) {
  mockFetch
    .mockResolvedValueOnce(
      jsonResponse({ data: { id: "run1", defaultDatasetId: "ds1" } })
    )
    .mockResolvedValueOnce(jsonResponse(items));
}

// ── ApifyWebScraperNode ────────────────────────────────────────────────────

describe("ApifyWebScraperNode", () => {
  it("returns scraped items", async () => {
    const node = new ApifyWebScraperNode();
    const items = [{ url: "https://example.com", title: "Example" }];
    mockRunActor(items);

    node.assign({
      start_urls: ["https://example.com"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual(items);
  });

  it("throws when start_urls is empty", async () => {
    const node = new ApifyWebScraperNode();

    node.assign({
      start_urls: []
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("start_urls is required");
  });

  it("throws when API key missing", async () => {
    const node = new ApifyWebScraperNode();

    node.assign({
      start_urls: ["https://example.com"]
    });

    await expect(node.process()).rejects.toThrow(
      "APIFY_API_TOKEN not configured"
    );
  });

  it("throws on API error", async () => {
    const node = new ApifyWebScraperNode();
    mockFetch.mockResolvedValueOnce(jsonResponse("forbidden", 403));

    node.assign({
      start_urls: ["https://example.com"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("Apify API error (403)");
  });

  it("returns empty array when no datasetId", async () => {
    const node = new ApifyWebScraperNode();
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "run1" } }));

    node.assign({
      start_urls: ["https://example.com"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([]);
  });

  it("returns empty array when dataset fetch fails", async () => {
    const node = new ApifyWebScraperNode();
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: "run1", defaultDatasetId: "ds1" } })
      )
      .mockResolvedValueOnce(jsonResponse("not found", 404));

    node.assign({
      start_urls: ["https://example.com"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([]);
  });

  it("uses env var API key", async () => {
    process.env.APIFY_API_TOKEN = "env-key";
    const node = new ApifyWebScraperNode();
    mockRunActor([]);

    node.assign({
      start_urls: ["https://example.com"]
    });

    const result = await node.process();
    expect(result.output).toEqual([]);
  });
});

// ── ApifyGoogleSearchScraperNode ───────────────────────────────────────────

describe("ApifyGoogleSearchScraperNode", () => {
  it("returns search results", async () => {
    const node = new ApifyGoogleSearchScraperNode();
    const items = [{ title: "Result 1", url: "https://example.com" }];
    mockRunActor(items);

    node.assign({
      queries: ["test query"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual(items);
  });

  it("throws when queries empty", async () => {
    const node = new ApifyGoogleSearchScraperNode();

    node.assign({
      queries: []
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow("queries is required");
  });

  it("clamps results_per_page to valid range", async () => {
    const node = new ApifyGoogleSearchScraperNode();
    mockRunActor([]);

    node.assign({
      queries: ["test"],

      // below MIN_RESULTS_PER_PAGE
      results_per_page: 5
    });

    node.setDynamic("_secrets", secrets._secrets);
    await node.process();
    // Verify the fetch was called (no error)
    expect(mockFetch).toHaveBeenCalled();
  });
});

// ── ApifyInstagramScraperNode ──────────────────────────────────────────────

describe("ApifyInstagramScraperNode", () => {
  it("returns items with usernames", async () => {
    const node = new ApifyInstagramScraperNode();
    const items = [{ username: "test_user", posts: 10 }];
    mockRunActor(items);

    node.assign({
      usernames: ["test_user"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual(items);
  });

  it("returns items with hashtags", async () => {
    const node = new ApifyInstagramScraperNode();
    mockRunActor([{ tag: "coding" }]);

    node.assign({
      hashtags: ["coding"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ tag: "coding" }]);
  });

  it("throws when both usernames and hashtags empty", async () => {
    const node = new ApifyInstagramScraperNode();

    node.assign({
      usernames: [],
      hashtags: []
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Either usernames or hashtags is required"
    );
  });
});

// ── ApifyAmazonScraperNode ─────────────────────────────────────────────────

describe("ApifyAmazonScraperNode", () => {
  it("returns products from search queries", async () => {
    const node = new ApifyAmazonScraperNode();
    const items = [{ title: "Product", price: "$10" }];
    mockRunActor(items);

    node.assign({
      search_queries: ["laptop"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual(items);
  });

  it("returns products from product URLs", async () => {
    const node = new ApifyAmazonScraperNode();
    mockRunActor([{ title: "Item" }]);

    node.assign({
      product_urls: ["https://amazon.com/dp/123"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ title: "Item" }]);
  });

  it("throws when both search_queries and product_urls empty", async () => {
    const node = new ApifyAmazonScraperNode();

    node.assign({
      search_queries: [],
      product_urls: []
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "Either search_queries or product_urls is required"
    );
  });
});

// ── ApifyYouTubeScraperNode ────────────────────────────────────────────────

describe("ApifyYouTubeScraperNode", () => {
  it("returns results from search queries", async () => {
    const node = new ApifyYouTubeScraperNode();
    mockRunActor([{ title: "Video 1" }]);

    node.assign({
      search_queries: ["cats"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ title: "Video 1" }]);
  });

  it("returns results from video URLs", async () => {
    const node = new ApifyYouTubeScraperNode();
    mockRunActor([{ title: "Video" }]);

    node.assign({
      video_urls: ["https://youtube.com/watch?v=abc"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ title: "Video" }]);
  });

  it("returns results from channel URLs", async () => {
    const node = new ApifyYouTubeScraperNode();
    mockRunActor([{ channel: "test" }]);

    node.assign({
      channel_urls: ["https://youtube.com/@testchannel"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ channel: "test" }]);
  });

  it("throws when all input arrays empty", async () => {
    const node = new ApifyYouTubeScraperNode();

    node.assign({
      search_queries: [],
      video_urls: [],
      channel_urls: []
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "At least one of search_queries, video_urls, or channel_urls is required"
    );
  });
});

// ── ApifyTwitterScraperNode ────────────────────────────────────────────────

describe("ApifyTwitterScraperNode", () => {
  it("returns tweets from search terms", async () => {
    const node = new ApifyTwitterScraperNode();
    mockRunActor([{ text: "tweet content" }]);

    node.assign({
      search_terms: ["AI"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ text: "tweet content" }]);
  });

  it("returns tweets from usernames", async () => {
    const node = new ApifyTwitterScraperNode();
    mockRunActor([{ text: "user tweet" }]);

    node.assign({
      usernames: ["elonmusk"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ text: "user tweet" }]);
  });

  it("returns tweets from tweet URLs", async () => {
    const node = new ApifyTwitterScraperNode();
    mockRunActor([{ text: "specific tweet" }]);

    node.assign({
      tweet_urls: ["https://twitter.com/user/status/123"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ text: "specific tweet" }]);
  });

  it("throws when all inputs empty", async () => {
    const node = new ApifyTwitterScraperNode();

    node.assign({
      search_terms: [],
      usernames: [],
      tweet_urls: []
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "At least one of search_terms, usernames, or tweet_urls is required"
    );
  });
});

// ── ApifyLinkedInScraperNode ───────────────────────────────────────────────

describe("ApifyLinkedInScraperNode", () => {
  it("returns profiles from profile URLs", async () => {
    const node = new ApifyLinkedInScraperNode();
    mockRunActor([{ name: "John" }]);

    node.assign({
      profile_urls: ["https://linkedin.com/in/john"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ name: "John" }]);
  });

  it("returns results from company URLs", async () => {
    const node = new ApifyLinkedInScraperNode();
    mockRunActor([{ company: "Acme" }]);

    node.assign({
      company_urls: ["https://linkedin.com/company/acme"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ company: "Acme" }]);
  });

  it("returns results from job search URLs", async () => {
    const node = new ApifyLinkedInScraperNode();
    mockRunActor([{ job: "Engineer" }]);

    node.assign({
      job_search_urls: ["https://linkedin.com/jobs/search?q=engineer"]
    });

    node.setDynamic("_secrets", secrets._secrets);
    const result = await node.process();
    expect(result.output).toEqual([{ job: "Engineer" }]);
  });

  it("throws when all inputs empty", async () => {
    const node = new ApifyLinkedInScraperNode();

    node.assign({
      profile_urls: [],
      company_urls: [],
      job_search_urls: []
    });

    node.setDynamic("_secrets", secrets._secrets);
    await expect(node.process()).rejects.toThrow(
      "At least one of profile_urls, company_urls, or job_search_urls is required"
    );
  });
});

// ── Defaults coverage ────────────────────────────────────────────────────

describe("Node defaults coverage", () => {
  it("ApifyWebScraperNode defaults", () => {
    expectMetadataDefaults(ApifyWebScraperNode);
  });

  it("ApifyGoogleSearchScraperNode defaults", () => {
    expectMetadataDefaults(ApifyGoogleSearchScraperNode);
  });

  it("ApifyInstagramScraperNode defaults", () => {
    expectMetadataDefaults(ApifyInstagramScraperNode);
  });

  it("ApifyAmazonScraperNode defaults", () => {
    expectMetadataDefaults(ApifyAmazonScraperNode);
  });

  it("ApifyYouTubeScraperNode defaults", () => {
    expectMetadataDefaults(ApifyYouTubeScraperNode);
  });

  it("ApifyTwitterScraperNode defaults", () => {
    expectMetadataDefaults(ApifyTwitterScraperNode);
  });

  it("ApifyLinkedInScraperNode defaults", () => {
    expectMetadataDefaults(ApifyLinkedInScraperNode);
  });
});
