/**
 * Image search across the SERP providers.
 *
 * Two things are checked here. That `SERP_PROVIDER_SEARCH_TYPES` — which
 * routing reads *before* a client exists — says what the client classes
 * actually implement, in both directions, so an image backend cannot be added
 * and left unreachable, nor advertised and then fail at call time. And that
 * Brave's image endpoint is read into the same `{title, link, original,
 * thumbnail}` shape SerpAPI and DataForSEO already return.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SERP_PROVIDER_SEARCH_TYPES,
  createSerpProvider,
  type SerpProviderType
} from "../src/tools/serp-providers/index.js";

const ALL_PROVIDERS = Object.keys(
  SERP_PROVIDER_SEARCH_TYPES
) as SerpProviderType[];

/** Every secret any provider asks for, so the factory always builds. */
const anySecret = { getSecret: async () => "test-key" };

/** Stub global.fetch with one JSON body. */
function stubFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SERP_PROVIDER_SEARCH_TYPES", () => {
  it("matches which clients implement searchImages", async () => {
    for (const name of ALL_PROVIDERS) {
      const client = await createSerpProvider(name, anySecret);
      expect(
        { name, images: typeof client.searchImages === "function" },
        `${name}: the table and the class disagree`
      ).toEqual({
        name,
        images: SERP_PROVIDER_SEARCH_TYPES[name].includes("images")
      });
    }
  });

  it("lists web for every provider", () => {
    for (const name of ALL_PROVIDERS) {
      expect(SERP_PROVIDER_SEARCH_TYPES[name]).toContain("web");
    }
  });
});

describe("BraveProvider.searchImages", () => {
  it("normalises Brave image results", async () => {
    const fetchSpy = stubFetch({
      results: [
        {
          title: "A red fox",
          url: "https://wildlife.example/fox",
          thumbnail: { src: "https://cdn.example/fox-thumb.jpg" },
          properties: { url: "https://cdn.example/fox.jpg" }
        },
        {
          title: "Fox in snow",
          url: "https://photos.example/snow-fox",
          thumbnail: { src: "https://cdn.example/snow-thumb.jpg" },
          properties: { url: "https://cdn.example/snow.jpg" }
        }
      ]
    });

    const client = await createSerpProvider("brave", anySecret);
    const results = await client.searchImages!("red fox", { numResults: 5 });

    expect(results).toEqual([
      {
        title: "A red fox",
        link: "https://wildlife.example/fox",
        original: "https://cdn.example/fox.jpg",
        thumbnail: "https://cdn.example/fox-thumb.jpg",
        position: 1
      },
      {
        title: "Fox in snow",
        link: "https://photos.example/snow-fox",
        original: "https://cdn.example/snow.jpg",
        thumbnail: "https://cdn.example/snow-thumb.jpg",
        position: 2
      }
    ]);

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/res/v1/images/search");
    expect(url).toContain("count=5");
  });

  it("clamps count to the 100 Brave's image endpoint accepts", async () => {
    const fetchSpy = stubFetch({ results: [] });
    const client = await createSerpProvider("brave", anySecret);
    await client.searchImages!("otters", { numResults: 500 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("count=100");
  });

  it("reports a failed request instead of an empty result list", async () => {
    stubFetch({ message: "Subscription does not include image search" }, 403);
    const client = await createSerpProvider("brave", anySecret);
    await expect(client.searchImages!("otters")).rejects.toThrow(
      /Brave Search request failed \(403\)/
    );
  });

  it("survives a result carrying no image url", async () => {
    stubFetch({ results: [{ title: "Bare" }] });
    const client = await createSerpProvider("brave", anySecret);
    expect(await client.searchImages!("bare")).toEqual([
      {
        title: "Bare",
        link: null,
        original: null,
        thumbnail: null,
        position: 1
      }
    ]);
  });
});
