/**
 * SERP tool factory for creating search tools based on configured provider.
 *
 * Reads the SERP_PROVIDER setting and instantiates the appropriate tool
 * with the resolved provider.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { SerpProvider } from "./serp-providers/index.js";
import { createSerpProvider } from "./serp-providers/index.js";
import type { Tool } from "./base-tool.js";
import {
  toolFromCapability,
  ungatedCapabilityRun
} from "../capabilities/index.js";
import { webSearch, webSearchImpl } from "../capabilities/web.js";

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
 *
 * This is the one `web_search` a belt cannot assemble from the registry: the
 * resolved provider is bound into the implementation, not into the run, so the
 * tool is built from the capability's spec over an implementation this factory
 * closes over.
 */
export async function createSearchTool(
  context: ProcessingContext
): Promise<Tool> {
  const provider = await resolveSerpProvider(context);
  return toolFromCapability(
    webSearch.spec,
    webSearchImpl(provider),
    ungatedCapabilityRun
  );
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
  // Bind getSecret to its ProcessingContext receiver. Passing the bare method
  // reference detaches `this`, so context._secretResolver/userId are undefined
  // and the secret store is never consulted — SERP keys stored there are lost.
  return createSerpProvider(providerType, {
    getSecret: (key: string) => context.getSecret(key)
  });
}
