/**
 * Gemini grounded search as a SERP provider.
 *
 * Gemini answers in prose and attaches `groundingMetadata`: one
 * `groundingChunk` per page it read, plus `groundingSupports` tying spans of
 * the answer back to the chunks that support them. The chunks are the ranked
 * result list and the supports are the snippets, so the same call serves both
 * shapes: `search` returns the chunks normalised to `SearchResult`, and
 * `answer` returns the prose the routed `web_search` capability prints.
 *
 * This is the one implementation of the call. `tools/google-tools.ts` resolves
 * the key from a `ProcessingContext` and delegates here.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** The model the grounded-search call runs on. */
export const GEMINI_SEARCH_MODEL = "gemini-3.5-flash";

/** What a chunk with no title of its own is called. */
export const UNKNOWN_SOURCE_TITLE = "Unknown Source";

/** How much supporting text is kept as a snippet. */
const MAX_SNIPPET_CHARS = 400;

/** One Gemini answer, with the pages it grounded on. */
export interface GeminiSearchAnswer {
  /** The text parts of the answer, in order. */
  texts: string[];
  /** The grounding chunks as ranked results. */
  citations: SearchResult[];
  /** The response as Gemini returned it. */
  raw: unknown;
}

interface GroundingSupport {
  segment?: { text?: unknown };
  groundingChunkIndices?: unknown;
}

interface GroundingChunk {
  web?: { uri?: unknown; title?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The answer spans each chunk supports, joined into one snippet.
 *
 * A chunk nothing supports keeps an empty snippet rather than being dropped —
 * Gemini cites pages it read without always tying a span to them.
 */
function snippetsByChunk(
  supports: readonly GroundingSupport[]
): Map<number, string> {
  const byChunk = new Map<number, string[]>();
  for (const support of supports) {
    const text = support?.segment?.text;
    if (typeof text !== "string" || !text.trim()) continue;
    const indices = support.groundingChunkIndices;
    if (!Array.isArray(indices)) continue;
    for (const index of indices) {
      if (typeof index !== "number" || !Number.isInteger(index)) continue;
      const existing = byChunk.get(index);
      if (existing) existing.push(text.trim());
      else byChunk.set(index, [text.trim()]);
    }
  }
  return new Map(
    [...byChunk].map(([index, parts]) => [
      index,
      parts.join(" ").slice(0, MAX_SNIPPET_CHARS)
    ])
  );
}

/** Read `groundingMetadata` into ranked results. */
export function citationsFromGrounding(
  metadata: Record<string, unknown> | undefined
): SearchResult[] {
  const chunks = metadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const supports = Array.isArray(metadata?.groundingSupports)
    ? (metadata.groundingSupports as GroundingSupport[])
    : [];
  const snippets = snippetsByChunk(supports);

  const results: SearchResult[] = [];
  chunks.forEach((chunk: GroundingChunk, index: number) => {
    const uri = chunk?.web?.uri;
    if (typeof uri !== "string" || !uri) return;
    const title = chunk.web?.title;
    results.push({
      title: typeof title === "string" && title ? title : UNKNOWN_SOURCE_TITLE,
      url: uri,
      snippet: snippets.get(index) ?? "",
      position: results.length + 1
    });
  });
  return results;
}

export class GeminiSearchProvider implements SerpProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = GEMINI_SEARCH_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /** Ask Gemini with its search tool on, and read the prose and grounding. */
  async answer(query: string): Promise<GeminiSearchAnswer> {
    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: query }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { responseModalities: ["TEXT"] }
        })
      });
    } catch (e) {
      // A transport failure says only "fetch failed"; name the call so the
      // message the caller surfaces says which service went down.
      throw new Error(
        `Gemini grounded search request failed: ${(e as Error).message}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const candidates = data.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error("No response received from Gemini API");
    }

    const candidate = candidates[0] as Record<string, unknown>;
    const content = candidate.content;
    const parts = isRecord(content) ? content.parts : undefined;
    const texts: string[] = [];
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (isRecord(part) && typeof part.text === "string") {
          texts.push(part.text);
        }
      }
    }

    const metadata = candidate.groundingMetadata;
    return {
      texts,
      citations: citationsFromGrounding(
        isRecord(metadata) ? metadata : undefined
      ),
      raw: data
    };
  }

  /**
   * The grounded pages as a ranked result list.
   *
   * Gemini's search tool takes no result count, so `numResults` truncates what
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
