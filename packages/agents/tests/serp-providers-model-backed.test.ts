/**
 * The two model-backed SERP providers: OpenAI web search and Gemini grounded
 * search.
 *
 * They answer a query with prose plus the pages the model read, so what makes
 * them usable as SERP providers is the citation extraction — the prose is not
 * a result list. These tests pin that reading, in both directions: a citation
 * the API returned must become a result, and a response that carries no usable
 * citation must produce none rather than one empty row.
 *
 * They also pin that the three places naming the provider set agree — the
 * factory's secret table, the settings catalog the UI renders, and the classes
 * themselves — because a provider missing from any one of them is silently
 * unselectable rather than broken.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { settingCatalog } from "@nodetool-ai/config";
import {
  SERP_PROVIDER_SECRETS,
  SERP_PROVIDER_SEARCH_TYPES,
  createSerpProvider,
  serpProviderConfigured,
  type SerpProviderType
} from "../src/tools/serp-providers/index.js";
import { citationsFromAnswer } from "../src/tools/serp-providers/openai-provider.js";
import {
  GeminiSearchProvider,
  citationsFromGrounding
} from "../src/tools/serp-providers/gemini-provider.js";

const anySecret = { getSecret: async (key: string) => `test-${key}` };

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The provider set, across the three tables that name it
// ---------------------------------------------------------------------------

describe("the SERP provider set", () => {
  it("offers openai and gemini in the settings catalog", () => {
    const entry = settingCatalog().find((s) => s.envVar === "SERP_PROVIDER");
    expect(entry?.enum).toEqual(Object.keys(SERP_PROVIDER_SECRETS));
  });

  it("builds a client for every provider the secret table names", async () => {
    for (const name of Object.keys(
      SERP_PROVIDER_SECRETS
    ) as SerpProviderType[]) {
      const client = await createSerpProvider(name, anySecret);
      expect(typeof client.search, name).toBe("function");
    }
  });

  it.each([
    ["openai", "OPENAI_API_KEY"],
    ["gemini", "GEMINI_API_KEY"]
  ] as const)("reads %s from the key it declares", async (name, key) => {
    expect(SERP_PROVIDER_SECRETS[name]).toEqual([key]);
    expect(SERP_PROVIDER_SEARCH_TYPES[name]).toEqual(["web"]);
    expect(await serpProviderConfigured(name, { getSecret: async () => null }))
      .toBe(false);
    expect(
      await serpProviderConfigured(name, {
        getSecret: async (k: string) => (k === key ? "set" : null)
      })
    ).toBe(true);
  });

  it("refuses to build one without its key", async () => {
    const none = { getSecret: async () => null };
    await expect(createSerpProvider("openai", none)).rejects.toThrow(
      /OPENAI_API_KEY is required/
    );
    await expect(createSerpProvider("gemini", none)).rejects.toThrow(
      /GEMINI_API_KEY is required/
    );
  });

  it("names every supported provider when asked for an unknown one", async () => {
    await expect(createSerpProvider("bing", anySecret)).rejects.toThrow(
      /Supported: .*openai, gemini/
    );
  });
});

// ---------------------------------------------------------------------------
// OpenAI: url_citation annotations → results
// ---------------------------------------------------------------------------

describe("citationsFromAnswer", () => {
  const text = "Rates held steady this quarter. Housing starts fell.";

  it("reads a citation's span as its snippet", () => {
    expect(
      citationsFromAnswer(text, [
        {
          type: "url_citation",
          url_citation: {
            url: "https://fed.example/statement",
            title: "Rate statement",
            start_index: 0,
            end_index: 31
          }
        }
      ])
    ).toEqual([
      {
        title: "Rate statement",
        url: "https://fed.example/statement",
        snippet: "Rates held steady this quarter.",
        position: 1
      }
    ]);
  });

  it("collapses repeat citations of one page, keeping the first", () => {
    const results = citationsFromAnswer(text, [
      {
        type: "url_citation",
        url_citation: { url: "https://a.example", start_index: 0, end_index: 5 }
      },
      {
        type: "url_citation",
        url_citation: { url: "https://b.example", start_index: 6, end_index: 12 }
      },
      {
        type: "url_citation",
        url_citation: { url: "https://a.example", start_index: 32, end_index: 45 }
      }
    ]);
    expect(results.map((r) => [r.url, r.position, r.snippet])).toEqual([
      ["https://a.example", 1, "Rates"],
      ["https://b.example", 2, "held s"]
    ]);
  });

  it("keeps a citation whose span is missing or inverted, with no snippet", () => {
    expect(
      citationsFromAnswer(text, [
        { type: "url_citation", url_citation: { url: "https://a.example" } },
        {
          type: "url_citation",
          url_citation: {
            url: "https://b.example",
            start_index: 20,
            end_index: 4
          }
        }
      ]).map((r) => r.snippet)
    ).toEqual(["", ""]);
  });

  it("ignores annotations that are not url citations or carry no url", () => {
    expect(
      citationsFromAnswer(text, [
        { type: "file_citation", url_citation: { url: "https://a.example" } },
        { type: "url_citation", url_citation: { url: "" } },
        { type: "url_citation" }
      ])
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gemini: groundingMetadata → results
// ---------------------------------------------------------------------------

describe("citationsFromGrounding", () => {
  it("joins the supported spans of each chunk into its snippet", () => {
    expect(
      citationsFromGrounding({
        groundingChunks: [
          { web: { uri: "https://a.example", title: "A" } },
          { web: { uri: "https://b.example", title: "B" } }
        ],
        groundingSupports: [
          { segment: { text: "First span." }, groundingChunkIndices: [0] },
          { segment: { text: "Second span." }, groundingChunkIndices: [0, 1] }
        ]
      })
    ).toEqual([
      {
        title: "A",
        url: "https://a.example",
        snippet: "First span. Second span.",
        position: 1
      },
      {
        title: "B",
        url: "https://b.example",
        snippet: "Second span.",
        position: 2
      }
    ]);
  });

  it("names a titleless chunk rather than dropping it", () => {
    expect(
      citationsFromGrounding({
        groundingChunks: [{ web: { uri: "https://a.example" } }]
      })
    ).toEqual([
      {
        title: "Unknown Source",
        url: "https://a.example",
        snippet: "",
        position: 1
      }
    ]);
  });

  it("skips a chunk with no web uri and keeps positions contiguous", () => {
    expect(
      citationsFromGrounding({
        groundingChunks: [
          { web: { uri: "https://a.example" } },
          { retrievedContext: { title: "not the web" } },
          { web: { uri: "https://c.example" } }
        ] as unknown[],
        // The support points at chunk 2, which is the third entry — indices
        // are into the original array, not into the results.
        groundingSupports: [
          { segment: { text: "Third." }, groundingChunkIndices: [2] }
        ]
      })
    ).toEqual([
      {
        title: "Unknown Source",
        url: "https://a.example",
        snippet: "",
        position: 1
      },
      {
        title: "Unknown Source",
        url: "https://c.example",
        snippet: "Third.",
        position: 2
      }
    ]);
  });

  it("reports no citations when there is no grounding metadata", () => {
    expect(citationsFromGrounding(undefined)).toEqual([]);
    expect(citationsFromGrounding({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GeminiSearchProvider end to end over a stubbed fetch
// ---------------------------------------------------------------------------

describe("GeminiSearchProvider.search", () => {
  function stubFetch(body: unknown, ok = true, status = 200) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok,
      status,
      statusText: ok ? "OK" : "Forbidden",
      json: async () => body
    } as Response);
  }

  it("returns the grounded pages as ranked results", async () => {
    const fetchSpy = stubFetch({
      candidates: [
        {
          content: { parts: [{ text: "An answer." }] },
          groundingMetadata: {
            groundingChunks: [{ web: { uri: "https://a.example", title: "A" } }]
          }
        }
      ]
    });

    const results = await new GeminiSearchProvider("k").search("rates");

    expect(results).toEqual([
      {
        title: "A",
        url: "https://a.example",
        snippet: "",
        position: 1
      }
    ]);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      "/models/gemini-3.5-flash:generateContent"
    );
  });

  it("truncates to numResults rather than narrowing the request", async () => {
    stubFetch({
      candidates: [
        {
          content: { parts: [] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://a.example" } },
              { web: { uri: "https://b.example" } },
              { web: { uri: "https://c.example" } }
            ]
          }
        }
      ]
    });

    const results = await new GeminiSearchProvider("k").search("rates", {
      numResults: 2
    });
    expect(results.map((r) => r.url)).toEqual([
      "https://a.example",
      "https://b.example"
    ]);
  });

  it("throws on a failed request instead of returning nothing", async () => {
    stubFetch({}, false, 403);
    await expect(new GeminiSearchProvider("k").search("rates")).rejects.toThrow(
      /Gemini API error: 403/
    );
  });

  it("names the service when the transport fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));
    await expect(new GeminiSearchProvider("k").search("rates")).rejects.toThrow(
      /Gemini grounded search request failed: fetch failed/
    );
  });
});
