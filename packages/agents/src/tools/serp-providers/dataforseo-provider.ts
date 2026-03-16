/**
 * DataForSEO provider implementation.
 *
 * Wraps the DataForSEO HTTP API and normalises results into the common
 * SearchResult shape.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.dataforseo.com";
const DEFAULT_LOCATION_CODE = 2840; // United States
const DEFAULT_LANGUAGE_CODE = "en";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthHeader(login: string, password: string): string {
  const encoded = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${encoded}`;
}

interface DataForSEOResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    result?: Array<{
      items?: Array<Record<string, unknown>>;
    }>;
  }>;
}

async function dataForSEORequest(
  endpoint: string,
  payload: Record<string, unknown>[],
  auth: string,
): Promise<DataForSEOResponse | { error: string; details?: unknown }> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let details: unknown;
      try {
        details = await res.json();
      } catch {
        details = await res.text();
      }
      return {
        error: `HTTP error occurred: ${res.status} - ${res.statusText}`,
        details,
      };
    }
    return (await res.json()) as DataForSEOResponse;
  } catch (e: unknown) {
    return { error: `DataForSEO request failed: ${(e as Error).message}` };
  }
}

function extractItems(
  result: DataForSEOResponse | { error: string },
): Array<Record<string, unknown>> | { error: string; details?: unknown } {
  if ("error" in result) return result as { error: string; details?: unknown };

  if (result.status_code !== 20000 || result.status_message !== "Ok.") {
    return {
      error: `DataForSEO API Error: ${result.status_code} - ${result.status_message}`,
      details: result,
    };
  }

  const taskResult = result.tasks?.[0]?.result;
  if (taskResult && Array.isArray(taskResult) && taskResult.length > 0) {
    return taskResult[0].items ?? [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class DataForSeoProvider implements SerpProvider {
  private readonly auth: string;

  constructor(login: string, password: string) {
    this.auth = makeAuthHeader(login, password);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const numResults = options?.numResults ?? 10;

    const payload = [
      {
        keyword: query,
        location_code: DEFAULT_LOCATION_CODE,
        language_code: options?.language ?? DEFAULT_LANGUAGE_CODE,
        device: "desktop",
        os: "windows",
        depth: numResults,
      },
    ];

    const result = await dataForSEORequest(
      "/v3/serp/google/organic/live/advanced",
      payload,
      this.auth,
    );
    const items = extractItems(result);
    if (!Array.isArray(items)) {
      throw new Error((items as { error: string }).error);
    }

    return items
      .filter((item) => item.type === "organic")
      .map((item, i) => ({
        title: String(item.title ?? ""),
        url: String(item.url ?? ""),
        snippet: String(item.description ?? ""),
        position: (item.rank_absolute as number) ?? i + 1,
      }));
  }

  async searchRaw(query: string, options?: SearchOptions): Promise<unknown> {
    const numResults = options?.numResults ?? 10;

    const payload = [
      {
        keyword: query,
        location_code: DEFAULT_LOCATION_CODE,
        language_code: options?.language ?? DEFAULT_LANGUAGE_CODE,
        device: "desktop",
        os: "windows",
        depth: numResults,
      },
    ];

    return dataForSEORequest(
      "/v3/serp/google/organic/live/advanced",
      payload,
      this.auth,
    );
  }
}
