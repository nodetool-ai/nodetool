/**
 * SERP provider abstraction layer.
 *
 * Port of src/nodetool/agents/serp_providers/serp_providers.py
 *
 * Provides a common interface for search engine results page (SERP) providers
 * so that tool implementations can be provider-agnostic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface SearchOptions {
  numResults?: number;
  location?: string;
  language?: string;
  engine?: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Abstract SERP provider interface.
 *
 * Implementations wrap a specific search API (SerpAPI, DataForSEO, etc.)
 * and normalise results into a common shape.
 */
export interface SerpProvider {
  /** Perform a web search and return normalised results. */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /** Perform a web search and return the raw API response. */
  searchRaw(query: string, options?: SearchOptions): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { SerpApiProvider } from "./serpapi-provider.js";
export { DataForSeoProvider } from "./dataforseo-provider.js";
