/**
 * Apify provider implementation.
 *
 * Wraps the Apify Google Search Scraper actor and normalises results into the
 * common SearchResult shape.
 *
 * Actor: https://apify.com/apify/google-search-scraper
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APIFY_API_BASE = "https://api.apify.com/v2";
const GOOGLE_SEARCH_ACTOR_ID = "apify/google-search-scraper";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ApifyRunResponse {
  id: string;
  actId: string;
  status: string;
  statusMessage?: string;
  resultStatus?: string;
}

interface ApifyDatasetItem {
  title: string;
  url: string;
  description: string;
  position?: number;
}

async function apifyRequest(
  apiKey: string,
  query: string,
  numResults: number
): Promise<SearchResult[] | { error: string }> {
  // Start an actor run
  const runUrl = `${APIFY_API_BASE}/acts/${GOOGLE_SEARCH_ACTOR_ID}/runs`;
  const runInput = {
    queries: [query],
    maxPagesPerQuery: Math.ceil(numResults / 10), // Each page has ~10 results
    languageCode: "en",
    countryCode: "US"
  };

  try {
    // Start the actor run
    const runRes = await fetch(runUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(runInput)
    });

    if (!runRes.ok) {
      return {
        error: `Apify actor start failed (${runRes.status}): ${runRes.statusText}`
      };
    }

    const runData = (await runRes.json()) as ApifyRunResponse;
    const runId = runData.id;

    // Poll until run completes (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const statusRes = await fetch(`${runUrl}/${runId}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      const statusData = (await statusRes.json()) as ApifyRunResponse;

      if (statusData.status === "SUCCEEDED") {
        break;
      } else if (
        statusData.status === "FAILED" ||
        statusData.status === "ABORTED"
      ) {
        return {
          error: `Apify actor failed: ${statusData.statusMessage || statusData.status}`
        };
      }

      // Wait a bit before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Fetch results from the dataset
    const datasetUrl = `${APIFY_API_BASE}/runs/${runId}/dataset/items`;
    const datasetRes = await fetch(datasetUrl, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    if (!datasetRes.ok) {
      return {
        error: `Failed to fetch Apify results (${datasetRes.status}): ${datasetRes.statusText}`
      };
    }

    const items = (await datasetRes.json()) as ApifyDatasetItem[];

    // Limit to requested number of results
    return items.slice(0, numResults).map((item, i) => ({
      title: String(item.title ?? ""),
      url: String(item.url ?? ""),
      snippet: String(item.description ?? ""),
      position: (item.position as number) ?? i + 1
    }));
  } catch (e: unknown) {
    return { error: `Apify request failed: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ApifyProvider implements SerpProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const numResults = options?.numResults ?? 10;

    const result = await apifyRequest(this.apiKey, query, numResults);

    if ("error" in result) {
      throw new Error(result.error);
    }

    return result;
  }

  async searchRaw(
    query: string,
    options?: SearchOptions
  ): Promise<unknown> {
    const numResults = options?.numResults ?? 10;
    return apifyRequest(this.apiKey, query, numResults);
  }
}
