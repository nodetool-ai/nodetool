/**
 * The OpenAI web-search backend behind the routed `web_search` capability.
 *
 * This is not a tool. `capabilities/web.ts` picks the first configured backend
 * and calls the function below; the model never sees an `openai_web_search`
 * name, because choosing a search provider is the host's job, not the model's.
 *
 * The call itself lives in `serp-providers/openai-provider.ts`, which is also
 * what `SERP_PROVIDER=openai` builds. This file is the context-aware half:
 * resolve the key, return `{error}` rather than throwing.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { OpenAiSearchProvider } from "./serp-providers/openai-provider.js";
import { isFunction, isString } from "../utils/type-guards.js";

async function getOpenAIApiKey(context?: ProcessingContext): Promise<string> {
  // Prefer the context's secretResolver (which checks the encrypted DB
  // before env vars). Fall back to env directly for callers that don't
  // pass a context.
  const fromCtx =
    isFunction(context?.getSecret)
      ? await context.getSecret("OPENAI_API_KEY")
      : null;
  const apiKey = fromCtx ?? process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return apiKey;
}

/**
 * Whether the OpenAI web-search backend is usable: its API key is present in
 * the secret store or the environment. Configuration is decided here, before
 * any call — never by sniffing an error message afterwards.
 */
export async function openAiSearchConfigured(
  context: ProcessingContext
): Promise<boolean> {
  const fromCtx =
    isFunction(context?.getSecret)
      ? await context.getSecret("OPENAI_API_KEY")
      : null;
  return Boolean(fromCtx ?? process.env["OPENAI_API_KEY"]);
}

/** Search the web with OpenAI's web-search model. */
export async function openAiWebSearch(
  context: ProcessingContext,
  params: { query?: unknown }
): Promise<{
  query?: string;
  results?: string;
  sources?: Array<{ title: string; url: string; snippet: string }>;
  status?: string;
  error?: string;
}> {
  const query = params.query;
  if (!isString(query) || !query) {
    return { error: "Search query is required" };
  }

  try {
    const apiKey = await getOpenAIApiKey(context);
    const answer = await new OpenAiSearchProvider(apiKey).answer(query);

    return {
      query,
      results: answer.text,
      sources: answer.citations.map((c) => ({
        title: c.title,
        url: c.url,
        snippet: c.snippet
      })),
      status: "success"
    };
  } catch (e) {
    // The provider and the key resolver already name what failed; re-prefixing
    // would say "Web search failed: OpenAI web search request failed: ...".
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
