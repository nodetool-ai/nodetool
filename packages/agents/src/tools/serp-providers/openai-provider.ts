/**
 * OpenAI web search as a SERP provider.
 *
 * OpenAI's search-enabled chat model answers in prose and attaches a
 * `url_citation` annotation per page it read. The citations are the ranked
 * result list — a title, a URL, and the span of the answer that page
 * supported — so the same call serves both shapes: `search` returns the
 * citations normalised to `SearchResult`, and `answer` returns the prose the
 * routed `web_search` capability prints.
 *
 * This is the one implementation of the call. `tools/openai-tools.ts` resolves
 * the key from a `ProcessingContext` and delegates here.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";

/** The chat model that carries the web-search tool. */
export const OPENAI_SEARCH_MODEL = "gpt-4o-search-preview";

/** How much of the cited span is kept as a snippet. */
const MAX_SNIPPET_CHARS = 400;

/** One OpenAI answer, with the pages it cited. */
export interface OpenAiSearchAnswer {
  /** The model's prose answer. */
  text: string;
  /** The cited pages, deduplicated by URL, in the order they appear. */
  citations: SearchResult[];
  /** The completion as OpenAI returned it. */
  raw: unknown;
}

interface UrlCitation {
  url?: unknown;
  title?: unknown;
  start_index?: unknown;
  end_index?: unknown;
}

interface Annotation {
  type?: unknown;
  url_citation?: UrlCitation;
}

function readIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * The slice of the answer a citation covers, as the result's snippet.
 *
 * A citation with no usable span is not dropped: the page is still a result,
 * it just has nothing to quote.
 */
function snippetFor(text: string, citation: UrlCitation): string {
  const start = readIndex(citation.start_index);
  const end = readIndex(citation.end_index);
  if (start === null || end === null || end <= start) return "";
  return text.slice(start, end).trim().slice(0, MAX_SNIPPET_CHARS);
}

/**
 * Read the `url_citation` annotations off an assistant message into ranked
 * results. Duplicates are collapsed on URL — the model cites one page several
 * times across an answer — keeping the first mention's snippet and position.
 */
export function citationsFromAnswer(
  text: string,
  annotations: readonly Annotation[]
): SearchResult[] {
  const byUrl = new Map<string, SearchResult>();
  for (const annotation of annotations) {
    if (annotation?.type !== "url_citation") continue;
    const citation = annotation.url_citation;
    const url = citation?.url;
    if (typeof url !== "string" || !url) continue;
    if (byUrl.has(url)) continue;
    byUrl.set(url, {
      title: typeof citation?.title === "string" ? citation.title : "",
      url,
      snippet: snippetFor(text, citation ?? {}),
      position: byUrl.size + 1
    });
  }
  return [...byUrl.values()];
}

export class OpenAiSearchProvider implements SerpProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = OPENAI_SEARCH_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /** Ask the search model, and read both the prose and the citations. */
  async answer(query: string): Promise<OpenAiSearchAnswer> {
    // Dynamic import so `openai` stays an optional dependency of this path.
    const { OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: this.apiKey });
    let completion;
    try {
      completion = await client.chat.completions.create({
        model: this.model,
        web_search_options: {},
        messages: [{ role: "user", content: query }]
      });
    } catch (e) {
      // Name the call, so a transport or auth failure the SDK reports tersely
      // still says which service it came from.
      throw new Error(
        `OpenAI web search request failed: ${(e as Error).message}`
      );
    }

    const message = completion.choices[0]?.message;
    const text = message?.content ?? "";
    const annotations = (message as { annotations?: unknown } | undefined)
      ?.annotations;
    return {
      text,
      citations: citationsFromAnswer(
        text,
        Array.isArray(annotations) ? (annotations as Annotation[]) : []
      ),
      raw: completion
    };
  }

  /**
   * The cited pages as a ranked result list.
   *
   * OpenAI's search tool takes no result count, so `numResults` truncates what
   * came back rather than narrowing the request.
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
