/**
 * The Gemini grounded-search backend behind the routed `web_search` capability.
 *
 * This is not a tool. `capabilities/web.ts` picks the first configured backend
 * and calls the function below; the model never sees a `google_grounded_search`
 * name, because choosing a search provider is the host's job, not the model's.
 *
 * The call itself lives in `serp-providers/gemini-provider.ts`, which is also
 * what `SERP_PROVIDER=gemini` builds. This file is the context-aware half:
 * resolve the key, return `{error}` rather than throwing.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { GeminiSearchProvider } from "./serp-providers/gemini-provider.js";
import { isFunction, isString } from "../utils/type-guards.js";

async function getGeminiApiKey(context?: ProcessingContext): Promise<string> {
  // Prefer the context's secretResolver (encrypted DB) over env vars so the
  // chat-cli + agent picks up keys configured via `nodetool secrets store`.
  const fromCtx =
    isFunction(context?.getSecret)
      ? await context.getSecret("GEMINI_API_KEY")
      : null;
  const key = fromCtx ?? process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

/**
 * Whether the Gemini grounded-search backend is usable: its API key is present
 * in the secret store or the environment. Configuration is decided here,
 * before any call — never by sniffing an error message afterwards.
 */
export async function geminiSearchConfigured(
  context: ProcessingContext
): Promise<boolean> {
  const fromCtx =
    isFunction(context?.getSecret)
      ? await context.getSecret("GEMINI_API_KEY")
      : null;
  return Boolean(fromCtx ?? process.env["GEMINI_API_KEY"]);
}

/** Search the web with Gemini's grounded-search tool. */
export async function googleGroundedSearch(
  context: ProcessingContext,
  params: { query?: unknown }
): Promise<{
  query?: string;
  results?: string[];
  sources?: Array<{ title: string; url: string; snippet: string }>;
  status?: string;
  error?: string;
}> {
  const query = params.query;
  if (!isString(query) || !query) {
    return { error: "Search query is required" };
  }

  try {
    const apiKey = await getGeminiApiKey(context);
    const answer = await new GeminiSearchProvider(apiKey).answer(query);

    return {
      query,
      results: answer.texts,
      sources: answer.citations.map((c) => ({
        title: c.title,
        url: c.url,
        snippet: c.snippet
      })),
      status: "success"
    };
  } catch (e) {
    // The provider and the key resolver already name what failed; re-prefixing
    // would turn "No response received from Gemini API" into a sentence with
    // two verbs and no more information.
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
