import {
  runNativeWebSearch as runProviderWebSearch,
  type NativeWebSearchResult,
  type NativeWebSource,
  type ProcessingContext
} from "@nodetool-ai/runtime";

/** A page an answer cites. */
export type WebSource = NativeWebSource;

/** What a web search node emits. */
export type WebSearchOutputs = NativeWebSearchResult;

/**
 * Answer a query with a provider's own web search. The search itself lives in
 * the runtime (`runNativeWebSearch`), shared with the agents' search backends.
 */
export async function runNativeWebSearch(
  context: ProcessingContext | undefined,
  providerId: string,
  model: string,
  query: string
): Promise<WebSearchOutputs> {
  if (!query.trim()) throw new Error("Search query cannot be empty");
  if (!model) throw new Error("Select a model");
  if (!context) throw new Error("Web search needs a processing context");
  const provider = await context.getProvider(providerId);
  return runProviderWebSearch(provider, {
    model,
    query,
    signal: context.signal
  });
}
