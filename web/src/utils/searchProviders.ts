/**
 * Search (SERP) provider definitions shared between the Settings panel and the
 * pre-run setup dialog. The backend reads `SERP_PROVIDER` to pick a provider
 * and resolves that provider's credential secrets at run time (see
 * `packages/agents/src/tools/serp-tool-factory.ts`).
 */

export type SerpProviderId = "brave" | "serpapi" | "dataforseo" | "apify";

export interface SearchProviderConfig {
  id: SerpProviderId;
  label: string;
  description: string;
  /** Secret env vars that must all be set for this provider to work. */
  credentialFields: string[];
  getApiKeyUrl: string;
  getApiKeyLabel: string;
  /** True when the provider offers a free tier — surfaced as a suggestion. */
  free?: boolean;
}

/**
 * Brave is listed first and flagged free so it surfaces as the default
 * suggestion when nothing is configured yet.
 */
export const SEARCH_PROVIDER_CONFIGS: Record<SerpProviderId, SearchProviderConfig> = {
  brave: {
    id: "brave",
    label: "Brave Search",
    description: "Privacy-focused search with a free tier — a good default.",
    credentialFields: ["BRAVE_API_KEY"],
    getApiKeyUrl:
      "https://api-dashboard.search.brave.com/app/documentation/web-search/get-started",
    getApiKeyLabel: "Get a free Brave API key",
    free: true
  },
  serpapi: {
    id: "serpapi",
    label: "SerpAPI",
    description:
      "Fast and reliable search API with Google, Bing, and other engines.",
    credentialFields: ["SERPAPI_API_KEY"],
    getApiKeyUrl: "https://serpapi.com/manage-api-key",
    getApiKeyLabel: "Get SerpAPI Key"
  },
  dataforseo: {
    id: "dataforseo",
    label: "DataForSEO",
    description: "Professional SEO and search intelligence platform.",
    credentialFields: ["DATA_FOR_SEO_LOGIN", "DATA_FOR_SEO_PASSWORD"],
    getApiKeyUrl: "https://app.dataforseo.com/register",
    getApiKeyLabel: "Get DataForSEO Credentials"
  },
  apify: {
    id: "apify",
    label: "Apify",
    description: "Reliable Google search scraping via Apify actors.",
    credentialFields: ["APIFY_API_KEY"],
    getApiKeyUrl: "https://console.apify.com/account/integrations",
    getApiKeyLabel: "Get Apify API Key"
  }
};

/** Backend default when `SERP_PROVIDER` is unset (see serp-tool-factory.ts). */
export const DEFAULT_SERP_PROVIDER: SerpProviderId = "serpapi";

/** Provider suggested in the setup dialog — free, no card required. */
export const SUGGESTED_SERP_PROVIDER: SerpProviderId = "brave";

/**
 * Agent tool names that need a configured search provider to run. The browser
 * and sandbox tools fetch pages directly and don't go through a SERP provider,
 * so they're intentionally excluded.
 */
export const SEARCH_PROVIDER_TOOL_NAMES = new Set([
  "google_search",
  "google_news",
  "google_images"
]);

type SettingGetter = (envVar: string) => string | undefined;

/**
 * True when the active `SERP_PROVIDER` has all of its credential fields set.
 * Mirrors the backend's resolution: an unset provider falls back to the
 * default. Credential values arrive as `"****"` from the settings API when a
 * secret is configured, so any non-empty string counts.
 */
export const isSearchProviderConfigured = (getValue: SettingGetter): boolean => {
  const selected = (getValue("SERP_PROVIDER") || DEFAULT_SERP_PROVIDER) as SerpProviderId;
  const config =
    SEARCH_PROVIDER_CONFIGS[selected] ??
    SEARCH_PROVIDER_CONFIGS[DEFAULT_SERP_PROVIDER];
  return config.credentialFields.every((field) => {
    const value = getValue(field);
    return typeof value === "string" && value.trim().length > 0;
  });
};
