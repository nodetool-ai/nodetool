/**
 * The shape the model-backed search providers answer in: Antigravity, Codex
 * and Claude Code each run a model with a search tool and return its prose
 * plus the pages behind it. The routed `web_search` capability prints the
 * prose and appends the pages, so one backend definition serves all three.
 */

import type { SearchResult } from "./index.js";

/** One model-backed answer, with the pages it relied on. */
export interface ModelSearchAnswer {
  text: string;
  citations: SearchResult[];
  raw: unknown;
}

/** A SERP provider that can also answer in prose. */
export interface ModelSearchProvider {
  answer(
    query: string,
    options?: { signal?: AbortSignal }
  ): Promise<ModelSearchAnswer>;
}

/** Whether `provider` answers in prose as well as returning results. */
export function isModelSearchProvider(
  provider: unknown
): provider is ModelSearchProvider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    typeof (provider as { answer?: unknown }).answer === "function"
  );
}

const MARKDOWN_LINK = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL = /(?<![(\w])https?:\/\/[^\s)<>\]"']+/g;

/**
 * The pages an answer links to, in order, for a model that cites in its prose
 * rather than in structured citations. Markdown links keep their text as the
 * title. Trailing punctuation is not part of a bare URL.
 */
export function linksInAnswer(text: string): SearchResult[] {
  const found: Array<{ title: string; url: string; at: number }> = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const url = match[2];
    if (seen.has(url)) continue;
    seen.add(url);
    found.push({ title: match[1].trim(), url, at: match.index ?? 0 });
  }
  for (const match of text.matchAll(BARE_URL)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    found.push({ title: url, url, at: match.index ?? 0 });
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map((f, i) => ({ title: f.title, url: f.url, snippet: "", position: i + 1 }));
}
