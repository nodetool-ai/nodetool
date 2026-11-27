/**
 * Antigravity web search as a SERP provider.
 *
 * The Antigravity CLI (`agy`) has a built-in `search_web` tool that runs a
 * Google Search on the machine's signed-in Antigravity account. There is no API
 * key: the search is one headless `agy` turn, run by
 * `AntigravityProvider.webSearch` in `@nodetool-ai/runtime`, which returns a
 * prose answer plus the pages it relied on. The pages are the ranked result
 * list, and the prose is what the routed `web_search` capability prints.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";
import type { ModelSearchAnswer } from "./model-search.js";

/** The part of `AntigravityProvider` a search needs. */
export interface AntigravitySearchClient {
  webSearch(
    query: string,
    options?: { signal?: AbortSignal }
  ): Promise<{
    answer: string;
    results: ReadonlyArray<{ title: string; url: string; snippet: string }>;
    raw: unknown;
  }>;
  unavailableReason(): Promise<string | null>;
}

/** One Antigravity answer, with the pages behind it. */
export type AntigravitySearchAnswer = ModelSearchAnswer;

async function defaultClient(): Promise<AntigravitySearchClient> {
  const { AntigravityProvider } = await import("@nodetool-ai/runtime");
  return new AntigravityProvider();
}

/** How long a CLI availability check is reused, in milliseconds. */
const AVAILABILITY_TTL_MS = 60_000;

let availability: { at: number; value: Promise<boolean> } | null = null;

/**
 * Whether the Antigravity CLI is installed and starts. Routing asks this on
 * every search that reaches the backend, so the answer is reused for a minute
 * instead of spawning `agy --version` each time.
 */
export async function antigravitySearchAvailable(
  client?: AntigravitySearchClient
): Promise<boolean> {
  if (client) return (await client.unavailableReason()) === null;
  const now = Date.now();
  if (!availability || now - availability.at > AVAILABILITY_TTL_MS) {
    availability = {
      at: now,
      value: defaultClient()
        .then((c) => c.unavailableReason())
        .then((reason) => reason === null)
        .catch(() => false)
    };
  }
  return availability.value;
}

/** Forget the cached availability check, for tests. */
export function resetAntigravitySearchAvailability(): void {
  availability = null;
}

export class AntigravitySearchProvider implements SerpProvider {
  private readonly client: AntigravitySearchClient | undefined;

  constructor(client?: AntigravitySearchClient) {
    this.client = client;
  }

  /** Run one `agy` search and read its answer and pages. */
  async answer(
    query: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<AntigravitySearchAnswer> {
    const client = this.client ?? (await defaultClient());
    const search = await client.webSearch(query, options);
    return {
      text: search.answer,
      citations: search.results.map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        position: i + 1
      })),
      raw: search.raw
    };
  }

  /**
   * The pages the answer relied on as a ranked result list. The search tool
   * takes no result count, so `numResults` truncates what came back.
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const { citations } = await this.answer(query);
    const numResults = options?.numResults;
    return numResults === undefined
      ? citations
      : citations.slice(0, numResults);
  }

  async searchRaw(query: string): Promise<unknown> {
    return (await this.answer(query)).raw;
  }
}
