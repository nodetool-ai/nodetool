/**
 * SerpAPI provider implementation.
 *
 * Port of src/nodetool/agents/serp_providers/serp_api_provider.py
 *
 * Wraps the SerpAPI HTTP API and normalises results into the common
 * SearchResult shape.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SerpApiParams {
  engine: string;
  q?: string;
  api_key: string;
  num?: number;
  gl?: string;
  hl?: string;
  [key: string]: string | number | undefined;
}

async function serpApiFetch(params: SerpApiParams): Promise<unknown> {
  const url = new URL("https://serpapi.com/search");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpAPI request failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SerpApiProvider implements SerpProvider {
  private readonly apiKey: string;
  private readonly gl: string;
  private readonly hl: string;

  constructor(apiKey: string, gl = "us", hl = "en") {
    this.apiKey = apiKey;
    this.gl = gl;
    this.hl = hl;
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const numResults = options?.numResults ?? 10;
    const engine = options?.engine ?? "google";

    const data = (await serpApiFetch({
      engine,
      q: query,
      api_key: this.apiKey,
      num: numResults,
      gl: this.gl,
      hl: options?.language ?? this.hl
    })) as Record<string, unknown>;

    const organicResults = (data.organic_results ?? []) as Array<
      Record<string, unknown>
    >;

    return organicResults.map((r, i) => ({
      title: String(r.title ?? ""),
      url: String(r.link ?? ""),
      snippet: String(r.snippet ?? ""),
      position: (r.position as number) ?? i + 1
    }));
  }

  async searchRaw(query: string, options?: SearchOptions): Promise<unknown> {
    const numResults = options?.numResults ?? 10;
    const engine = options?.engine ?? "google";

    return serpApiFetch({
      engine,
      q: query,
      api_key: this.apiKey,
      num: numResults,
      gl: this.gl,
      hl: options?.language ?? this.hl
    });
  }
}
