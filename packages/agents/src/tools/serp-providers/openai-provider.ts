/**
 * OpenAI web search as a SERP provider.
 *
 * The call goes through the Responses API with the hosted `web_search` tool.
 * The model answers in prose and attaches a `url_citation` annotation per page
 * it relied on, and the `web_search_call` item lists every page it consulted.
 * The citations come first in the ranked result list — a title, a URL, and the
 * span of the answer that page supported — followed by consulted pages that
 * were not cited. So the same call serves both shapes: `search` returns the
 * pages normalised to `SearchResult`, and `answer` returns the prose the
 * routed `web_search` capability prints.
 *
 * This is the one implementation of the call. `tools/openai-tools.ts` resolves
 * the key from a `ProcessingContext` and delegates here.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";
import { searchByAnswer } from "./model-search.js";

/**
 * The reasoning model that runs the `web_search` tool, at its default effort.
 * It rejects reasoning effort `none`, so the request leaves effort unset.
 */
export const OPENAI_SEARCH_MODEL = "gpt-6.2-sol";

/** How much of the cited span is kept as a snippet. */
const MAX_SNIPPET_CHARS = 400;

/** One OpenAI answer, with the pages it cited. */
export interface OpenAiSearchAnswer {
  /** The model's prose answer. */
  text: string;
  /**
   * The pages, deduplicated by URL: cited pages in the order they appear,
   * then consulted pages the answer did not cite.
   */
  citations: SearchResult[];
  /** The response as OpenAI returned it. */
  raw: unknown;
}

/** A `url_citation` annotation on an `output_text` part. Fields are flat. */
export interface UrlCitation {
  type?: unknown;
  url?: unknown;
  title?: unknown;
  start_index?: unknown;
  end_index?: unknown;
}

function readIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
 * Read `url_citation` annotations into ranked results. Duplicates are
 * collapsed on URL — the model cites one page several times across an answer —
 * keeping the first mention's snippet and position.
 */
export function citationsFromAnswer(
  text: string,
  annotations: readonly UrlCitation[]
): SearchResult[] {
  const byUrl = new Map<string, SearchResult>();
  for (const annotation of annotations) {
    if (annotation?.type !== "url_citation") continue;
    const url = annotation.url;
    if (typeof url !== "string" || !url) continue;
    if (byUrl.has(url)) continue;
    byUrl.set(url, {
      title: typeof annotation.title === "string" ? annotation.title : "",
      url,
      snippet: snippetFor(text, annotation),
      position: byUrl.size + 1
    });
  }
  return [...byUrl.values()];
}

/**
 * Read a Responses API result into the answer text and its ranked pages.
 *
 * The text is every `output_text` part of every `message` item, joined.
 * Annotation indices count from the start of their own part, so each is
 * shifted by the part's offset in the joined text. Pages listed in
 * `web_search_call.action.sources` that no annotation cited are appended
 * after the citations, with no title or snippet.
 */
export function readSearchResponse(response: unknown): {
  text: string;
  citations: SearchResult[];
} {
  const output =
    isRecord(response) && Array.isArray(response.output) ? response.output : [];
  let text = "";
  const annotations: UrlCitation[] = [];
  const consulted: string[] = [];

  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (!isRecord(part) || part.type !== "output_text") continue;
        if (typeof part.text !== "string") continue;
        const offset = text.length;
        text += part.text;
        if (!Array.isArray(part.annotations)) continue;
        for (const a of part.annotations) {
          if (!isRecord(a)) continue;
          const start = readIndex(a.start_index);
          const end = readIndex(a.end_index);
          annotations.push({
            ...a,
            start_index: start === null ? undefined : start + offset,
            end_index: end === null ? undefined : end + offset
          });
        }
      }
    } else if (item.type === "web_search_call" && isRecord(item.action)) {
      const sources = item.action.sources;
      if (!Array.isArray(sources)) continue;
      for (const source of sources) {
        if (isRecord(source) && typeof source.url === "string" && source.url) {
          consulted.push(source.url);
        }
      }
    }
  }

  const citations = citationsFromAnswer(text, annotations);
  const seen = new Set(citations.map((c) => c.url));
  for (const url of consulted) {
    if (seen.has(url)) continue;
    seen.add(url);
    citations.push({
      title: "",
      url,
      snippet: "",
      position: citations.length + 1
    });
  }
  return { text, citations };
}

export class OpenAiSearchProvider implements SerpProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = OPENAI_SEARCH_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /** Ask the model with web search on, and read the prose and the pages. */
  async answer(query: string): Promise<OpenAiSearchAnswer> {
    // Dynamic import so `openai` stays an optional dependency of this path.
    const { OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: this.apiKey });
    let response;
    try {
      response = await client.responses.create({
        model: this.model,
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        input: query
      });
    } catch (e) {
      // Name the call, so a transport or auth failure the SDK reports tersely
      // still says which service it came from.
      throw new Error(
        `OpenAI web search request failed: ${(e as Error).message}`
      );
    }

    return { ...readSearchResponse(response), raw: response };
  }

  /**
   * The pages as a ranked result list.
   *
   * OpenAI's search tool takes no result count, so `numResults` truncates what
   * came back rather than narrowing the request.
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    return searchByAnswer(this, query, options?.numResults);
  }

  async searchRaw(query: string): Promise<unknown> {
    return (await this.answer(query)).raw;
  }
}
