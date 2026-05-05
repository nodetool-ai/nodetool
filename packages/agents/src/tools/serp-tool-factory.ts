/**
 * SERP tool factory for creating search tools based on configured provider.
 *
 * Reads the SERP_PROVIDER setting and instantiates the appropriate tool
 * with the resolved provider.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { SerpProvider } from "./serp-providers/index.js";
import { createSerpProvider } from "./serp-providers/index.js";
import { GoogleSearchTool } from "./search-tools.js";
import { DataForSEOSearchTool } from "./dataseo-tools.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSerpProviderSetting(
  context: ProcessingContext
): Promise<string> {
  // Try context first, then env var, then default to 'serpapi'
  const fromCtx = await context.getSecret("SERP_PROVIDER");
  if (fromCtx) return fromCtx;

  const fromEnv = process.env.SERP_PROVIDER;
  if (fromEnv) return fromEnv;

  return "serpapi"; // Default to SerpAPI
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a search tool based on the configured SERP_PROVIDER setting.
 * Returns a tool with an injected provider instance.
 */
export async function createSearchTool(
  context: ProcessingContext
): Promise<GoogleSearchTool> {
  const providerType = await getSerpProviderSetting(context);
  const provider = await resolveSerpProvider(context);
  return new GoogleSearchTool(provider);
}

/**
 * Get the current configured SERP provider name.
 */
export async function getConfiguredSerpProvider(
  context: ProcessingContext
): Promise<string> {
  return getSerpProviderSetting(context);
}

/**
 * Resolve a provider instance based on the configured SERP_PROVIDER setting.
 */
export async function resolveSerpProvider(
  context: ProcessingContext
): Promise<SerpProvider> {
  const providerType = await getSerpProviderSetting(context);
  return createSerpProvider(providerType, { getSecret: context.getSecret });
}
