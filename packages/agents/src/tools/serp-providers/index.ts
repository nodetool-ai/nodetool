/**
 * SERP provider abstraction layer.
 *
 * Port of src/nodetool/agents/serp_providers/serp_providers.py
 *
 * Provides a common interface for search engine results page (SERP) providers
 * so that tool implementations can be provider-agnostic.
 */

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

/**
 * The secrets each provider needs, for the "is this usable?" check and for the
 * error message when it is not.
 *
 * Declared next to the factory that reads them so the two cannot drift: a
 * provider added to the switch below without an entry here would be invisible
 * to routing, which fails as a silently-skipped backend rather than an error.
 */
export const SERP_PROVIDER_SECRETS: Readonly<
  Record<SerpProviderType, readonly string[]>
> = {
  serpapi: ["SERPAPI_API_KEY"],
  dataforseo: ["DATA_FOR_SEO_LOGIN", "DATA_FOR_SEO_PASSWORD"],
  brave: ["BRAVE_API_KEY"],
  apify: ["APIFY_API_TOKEN", "APIFY_API_KEY"]
};

/**
 * Whether every secret `type` needs is present.
 *
 * Apify is the one provider with two acceptable names: `APIFY_API_TOKEN` is
 * what Apify's own docs call it and what the rest of NodeTool's Apify layer
 * reads, while `APIFY_API_KEY` is what this install shipped first. Either
 * satisfies it, so upgrading does not silently turn search off.
 */
export async function serpProviderConfigured(
  type: SerpProviderType,
  resolver?: SecretResolver
): Promise<boolean> {
  const names = SERP_PROVIDER_SECRETS[type];
  if (type === "apify") {
    for (const name of names) {
      if (await getSecret(name, resolver)) return true;
    }
    return false;
  }
  for (const name of names) {
    if (!(await getSecret(name, resolver))) return false;
  }
  return true;
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
      const key =
        (await getSecret("APIFY_API_TOKEN", resolver)) ??
        (await getSecret("APIFY_API_KEY", resolver));
      if (!key) {
        throw new Error(
          "APIFY_API_TOKEN is required for the Apify provider. Set it as an environment variable or via settings."
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

export { SerpApiProvider } from "./serpapi-provider.js";
export { DataForSeoProvider } from "./dataforseo-provider.js";
export { BraveProvider } from "./brave-provider.js";
export { ApifyProvider } from "./apify-provider.js";
