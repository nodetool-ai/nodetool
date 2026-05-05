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
// Provider factory
// ---------------------------------------------------------------------------

export type SerpProviderType =
  | "serpapi"
  | "dataforseo"
  | "brave"
  | "apify";

interface SecretResolver {
  getSecret?: (key: string) => Promise<string | null>;
}

async function getSecret(
  key: string,
  resolver?: SecretResolver
): Promise<string | null> {
  return (resolver?.getSecret?.(key) ?? null) || process.env[key] || null;
}

export async function createSerpProvider(
  providerType: string,
  resolver?: SecretResolver
): Promise<SerpProvider> {
  const type = providerType.toLowerCase();

  switch (type) {
    case "serpapi": {
      const key = await getSecret("SERPAPI_API_KEY", resolver);
      if (!key) {
        throw new Error(
          "SERPAPI_API_KEY is required for SerpAPI provider. Set it as an environment variable or via settings."
        );
      }
      return new (await import("./serpapi-provider.js")).SerpApiProvider(key);
    }

    case "dataforseo": {
      const login = await getSecret("DATA_FOR_SEO_LOGIN", resolver);
      const password = await getSecret("DATA_FOR_SEO_PASSWORD", resolver);
      if (!login || !password) {
        throw new Error(
          "DATA_FOR_SEO_LOGIN and DATA_FOR_SEO_PASSWORD are required for DataForSEO provider."
        );
      }
      return new (await import("./dataforseo-provider.js")).DataForSeoProvider(
        login,
        password
      );
    }

    case "brave": {
      const key = await getSecret("BRAVE_API_KEY", resolver);
      if (!key) {
        throw new Error(
          "BRAVE_API_KEY is required for Brave provider. Set it as an environment variable or via settings."
        );
      }
      return new (await import("./brave-provider.js")).BraveProvider(key);
    }

    case "apify": {
      const key = await getSecret("APIFY_API_KEY", resolver);
      if (!key) {
        throw new Error(
          "APIFY_API_KEY is required for Apify provider. Set it as an environment variable or via settings."
        );
      }
      return new (await import("./apify-provider.js")).ApifyProvider(key);
    }

    default:
      throw new Error(
        `Unknown SERP provider: ${providerType}. Supported: serpapi, dataforseo, brave, apify`
      );
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { SerpApiProvider } from "./serpapi-provider.js";
export { DataForSeoProvider } from "./dataforseo-provider.js";
export { BraveProvider } from "./brave-provider.js";
export { ApifyProvider } from "./apify-provider.js";
