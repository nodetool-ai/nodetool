/**
 * Antigravity web search as a SERP provider: the `agy` CLI's `search_web`
 * tool, reached through `AntigravityProvider.webSearch`. These tests pin the
 * mapping from that call to results and to the routed `web_search` answer,
 * with the CLI replaced by a client double.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SERP_PROVIDER_SECRETS,
  SERP_PROVIDER_SEARCH_TYPES,
  createSerpProvider
} from "../src/tools/serp-providers/index.js";
import {
  AntigravitySearchProvider,
  antigravitySearchAvailable,
  resetAntigravitySearchAvailability,
  type AntigravitySearchClient
} from "../src/tools/serp-providers/antigravity-provider.js";

function client(
  overrides: Partial<AntigravitySearchClient> = {}
): AntigravitySearchClient {
  return {
    webSearch: async () => ({
      answer: "Rates held steady.",
      results: [
        { title: "Statement", url: "https://fed.example/s", snippet: "Held." },
        { title: "Minutes", url: "https://fed.example/m", snippet: "" }
      ],
      raw: { status: "SUCCESS" }
    }),
    unavailableReason: async () => null,
    ...overrides
  };
}

afterEach(() => {
  resetAntigravitySearchAvailability();
  vi.restoreAllMocks();
});

describe("AntigravitySearchProvider", () => {
  it("needs no secret and answers web searches only", () => {
    expect(SERP_PROVIDER_SECRETS.antigravity).toEqual([]);
    expect(SERP_PROVIDER_SEARCH_TYPES.antigravity).toEqual(["web"]);
  });

  it("builds without any secret", async () => {
    const provider = await createSerpProvider("antigravity", {
      getSecret: async () => null
    });
    expect(provider).toBeInstanceOf(AntigravitySearchProvider);
  });

  it("ranks the pages the answer relied on", async () => {
    const provider = new AntigravitySearchProvider(client());
    expect(await provider.search("rates")).toEqual([
      { title: "Statement", url: "https://fed.example/s", snippet: "Held.", position: 1 },
      { title: "Minutes", url: "https://fed.example/m", snippet: "", position: 2 }
    ]);
    expect(await provider.search("rates", { numResults: 1 })).toHaveLength(1);
  });

  it("returns the prose and passes the abort signal to the CLI", async () => {
    const webSearch = vi.fn(client().webSearch);
    const provider = new AntigravitySearchProvider(client({ webSearch }));
    const signal = new AbortController().signal;
    const answer = await provider.answer("rates", { signal });
    expect(answer.text).toBe("Rates held steady.");
    expect(webSearch).toHaveBeenCalledWith("rates", { signal });
    expect(await provider.searchRaw("rates")).toEqual({ status: "SUCCESS" });
  });

  it("surfaces the CLI's failure instead of an empty result", async () => {
    const provider = new AntigravitySearchProvider(
      client({
        webSearch: async () => {
          throw new Error("Antigravity sign-in required");
        }
      })
    );
    await expect(provider.search("rates")).rejects.toThrow(/sign-in required/);
  });
});

describe("antigravitySearchAvailable", () => {
  it("is available only when the CLI starts", async () => {
    expect(await antigravitySearchAvailable(client())).toBe(true);
    expect(
      await antigravitySearchAvailable(
        client({ unavailableReason: async () => "agy not found" })
      )
    ).toBe(false);
  });
});
