/**
 * SerpAPI provider implementation.
 *
 * The narrow half of the SerpAPI surface: one query, one engine, normalised to
 * the `SearchResult` shape every SERP provider answers with, so `web_search`
 * does not care which backend this install configured.
 *
 * The general half is the `serpapi` capability module — every engine, its
 * parameters discovered from SerpAPI's own table. Both go through
 * {@link SerpApiClient}, so there is one place that holds the key and one place
 * that scrubs it out of an error.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";
import { SerpApiClient } from "../../serpapi/client.js";
import { isRecord, isString } from "../../utils/type-guards.js";

export class SerpApiProvider implements SerpProvider {
  private readonly client: SerpApiClient;
  private readonly gl: string;
  private readonly hl: string;

  constructor(apiKey: string, gl = "us", hl = "en") {
    this.client = new SerpApiClient(apiKey);
    this.gl = gl;
    this.hl = hl;
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const data = await this.searchRaw(query, options);
    const organic = isRecord(data) ? data.organic_results : undefined;
    if (!Array.isArray(organic)) return [];

    return organic.filter(isRecord).map((result, index) => ({
      title: isString(result.title) ? result.title : "",
      url: isString(result.link) ? result.link : "",
      snippet: isString(result.snippet) ? result.snippet : "",
      position:
        typeof result.position === "number" ? result.position : index + 1
    }));
  }

  async searchRaw(
    query: string,
    options?: SearchOptions
  ): Promise<Record<string, unknown>> {
    const params: Record<string, string | number> = {
      q: query,
      num: options?.numResults ?? 10,
      gl: this.gl,
      hl: options?.language ?? this.hl
    };
    if (options?.location !== undefined) params.location = options.location;
    return this.client.search(options?.engine ?? "google", params);
  }
}
