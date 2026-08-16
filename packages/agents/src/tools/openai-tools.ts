/**
 * The OpenAI web-search backend behind the routed `web_search` capability.
 *
 * This is not a tool. `capabilities/web.ts` picks the first configured backend
 * and calls the function below; the model never sees an `openai_web_search`
 * name, because choosing a search provider is the host's job, not the model's.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { isFunction, isString } from "../utils/type-guards.js";

async function getOpenAIClient(context?: ProcessingContext) {
  // Dynamic import to avoid hard dependency
  const { OpenAI } = await import("openai");
  // Prefer the context's secretResolver (which checks the encrypted DB
  // before env vars). Fall back to env directly for callers that don't
  // pass a context.
  const fromCtx =
    isFunction(context?.getSecret)
      ? await context.getSecret("OPENAI_API_KEY")
      : null;
  const apiKey = fromCtx ?? process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
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
): Promise<{ query?: string; results?: string; status?: string; error?: string }> {
  const query = params.query;
  if (!isString(query) || !query) {
    return { error: "Search query is required" };
  }

  try {
    const client = await getOpenAIClient(context);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-search-preview",
      web_search_options: {},
      messages: [{ role: "user", content: query }]
    });

    return {
      query,
      results: completion.choices[0]?.message?.content ?? "",
      status: "success"
    };
  } catch (e) {
    return { error: `Web search failed: ${String(e)}` };
  }
}
