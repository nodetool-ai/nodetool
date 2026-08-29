/**
 * Brave Search provider implementation.
 *
 * Wraps the Brave Search API and normalises results into the common
 * SearchResult shape.
 *
 * API docs: https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
 */

import type {
  SerpProvider,
  SearchResult,
  SearchOptions,
  ImageSearchResult
} from "./index.js";

const API_BASE = "https://api.search.brave.com/res/v1";

interface BraveResponse {
  web?: {
    results?: Array<{
      title: string;
      url: string;
      description: string;
    }>;
  };
}

/**
 * Brave's image endpoint. `url` is the page carrying the image,
 * `properties.url` the image file, `thumbnail.src` Brave's own preview — the
 * three things `search_type: "images"` reports.
 */
interface BraveImageResponse {
  results?: Array<{
    title?: string;
    url?: string;
    thumbnail?: { src?: string };
    properties?: { url?: string };
  }>;
}

/** A failed Brave call, with whatever the API said about it. */
interface BraveError {
  error: string;
  details?: unknown;
}

async function braveRequest<T>(
  apiKey: string,
  path: "web" | "images",
  query: string,
  numResults: number
): Promise<T | BraveError> {
  const url = new URL(`${API_BASE}/${path}/search`);
  url.searchParams.set("q", query);
  // Brave's image endpoint caps `count` at 100 and rejects anything larger
  // outright, so an over-large num_results clamps rather than failing the
  // search. The web endpoint keeps the count it was always sent.
  url.searchParams.set(
    "count",
    String(path === "images" ? Math.min(Math.max(numResults, 1), 100) : numResults)
  );

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey
      }
    });

    if (!res.ok) {
      let details: unknown;
      try {
        details = await res.json();
      } catch {
        details = await res.text();
      }
      return {
        error: `Brave Search request failed (${res.status}): ${res.statusText}`,
        details
      };
    }

    return (await res.json()) as T;
  } catch (e: unknown) {
    return { error: `Brave Search request failed: ${(e as Error).message}` };
  }
}

export class BraveProvider implements SerpProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const numResults = options?.numResults ?? 10;

    const result = await braveRequest<BraveResponse>(
      this.apiKey,
      "web",
      query,
      numResults
    );

    if ("error" in result) {
      throw new Error(result.error);
    }

    const webResults = result.web?.results ?? [];

    return webResults.map((r, i) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: String(r.description ?? ""),
      position: i + 1
    }));
  }

  async searchRaw(
    query: string,
    options?: SearchOptions
  ): Promise<BraveResponse | { error: string }> {
    const numResults = options?.numResults ?? 10;
    return braveRequest<BraveResponse>(this.apiKey, "web", query, numResults);
  }

  /**
   * Brave's image search. The subscription needs the Image Search plan; a
   * token without it comes back 401/403, which surfaces as the request error
   * rather than as an empty result list.
   */
  async searchImages(
    query: string,
    options?: SearchOptions
  ): Promise<ImageSearchResult[]> {
    const numResults = options?.numResults ?? 20;

    const result = await braveRequest<BraveImageResponse>(
      this.apiKey,
      "images",
      query,
      numResults
    );

    if ("error" in result) {
      throw new Error(result.error);
    }

    return (result.results ?? []).slice(0, numResults).map((r, i) => ({
      title: r.title ?? null,
      link: r.url ?? null,
      original: r.properties?.url ?? null,
      thumbnail: r.thumbnail?.src ?? null,
      position: i + 1
    }));
  }
}
