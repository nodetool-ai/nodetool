/**
 * Codex web search as a SERP provider.
 *
 * The ChatGPT Codex backend runs the Responses API's built-in `web_search`
 * tool server-side, on the user's ChatGPT sign-in instead of an API key.
 * `CodexProvider.webSearch` in `@nodetool-ai/runtime` makes the call and
 * returns the answer with the pages it cites. The cited pages are the result
 * list, and the prose is what the routed `web_search` capability prints.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";
import type { ModelSearchAnswer } from "./model-search.js";

/** The part of `CodexProvider` a search needs. */
export interface CodexSearchClient {
  webSearch(args: {
    query: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; sources: ReadonlyArray<{ title: string; url: string }> }>;
}

export class CodexSearchProvider implements SerpProvider {
  private readonly client: CodexSearchClient;

  constructor(client: CodexSearchClient) {
    this.client = client;
  }

  /** Build a client on a ChatGPT (Codex) access token. */
  static async fromToken(token: string): Promise<CodexSearchProvider> {
    const { CodexProvider } = await import("@nodetool-ai/runtime");
    return new CodexSearchProvider(
      new CodexProvider({ CODEX_ACCESS_TOKEN: token })
    );
  }

  /** Run one Codex search and read its answer and cited pages. */
  async answer(
    query: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<ModelSearchAnswer> {
    const result = await this.client.webSearch({ query, signal: options.signal });
    return {
      text: result.text,
      citations: result.sources.map((s, i) => ({
        title: s.title,
        url: s.url,
        snippet: "",
        position: i + 1
      })),
      raw: result
    };
  }

  /**
   * The cited pages as a ranked result list. The search tool takes no result
   * count, so `numResults` truncates what came back.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const { citations } = await this.answer(query);
    const n = options?.numResults;
    return n === undefined ? citations : citations.slice(0, n);
  }

  async searchRaw(query: string): Promise<unknown> {
    return (await this.answer(query)).raw;
  }
}
