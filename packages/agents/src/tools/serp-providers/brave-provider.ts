/**
 * Brave Search provider implementation.
 *
 * Wraps the Brave Search API and normalises results into the common
 * SearchResult shape.
 *
 * API docs: https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.search.brave.com/res/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BraveResponse {
  web?: {
    results?: Array<{
      title: string;
      url: string;
      description: string;
    }>;
  };
}

async function braveRequest(
  apiKey: string,
  query: string,
  numResults: number
): Promise<BraveResponse | { error: string }> {
  const url = new URL(`${API_BASE}/web/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(numResults));

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
      } as unknown as { error: string };
    }

    return (await res.json()) as BraveResponse;
  } catch (e: unknown) {
    return { error: `Brave Search request failed: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

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

    const result = await braveRequest(this.apiKey, query, numResults);

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
  ): Promise<unknown> {
    const numResults = options?.numResults ?? 10;
    return braveRequest(this.apiKey, query, numResults);
  }
}
