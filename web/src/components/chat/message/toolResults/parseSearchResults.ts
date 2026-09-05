import {
  isObjectLike,
  isRecord,
  isString
} from "../../../../utils/typePredicates";
/**
 * Normalizes the many shapes a search-style tool can return into a single
 * `SearchResultItem[]` the UI can render. Tools in this repo return results in
 * three different forms:
 *
 *  - `web_search` with search_type news/images: `{ results: [{ title, link, snippet, ... }] }`
 *    — image results additionally carry `original` (the image file) and
 *      `thumbnail` (a preview), which become `imageUrl`
 *  - SERP-style providers: a bare array of result objects
 *  - `google_search`: a numbered plain-text block (`"1. Title\n   url\n   snippet"`)
 *
 * Returns `null` when the content cannot be understood as search results, so
 * callers can fall back to a generic renderer.
 */

export interface SearchResultItem {
  title: string;
  url?: string;
  snippet?: string;
  source?: string;
  date?: string;
  /**
   * A picture of the result, for image searches. The preview when the backend
   * offers one, else the image itself — every image backend returns at least
   * one of the two, so a result that has neither is not an image result.
   */
  imageUrl?: string;
}

function domainFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (isString(value) && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeSource(
  obj: Record<string, unknown>,
  url: string | undefined
): string | undefined {
  const raw = obj.source;
  if (isString(raw) && raw.trim().length > 0) return raw.trim();
  if (raw && isObjectLike(raw) && "name" in raw) {
    const name = raw.name;
    if (isString(name) && name.trim().length > 0) return name.trim();
  }
  return url ? domainFromUrl(url) : undefined;
}

function itemFromObject(obj: Record<string, unknown>): SearchResultItem | null {
  const url = pickString(obj, "url", "link", "original");
  const title = pickString(obj, "title", "name", "heading");
  const snippet = pickString(obj, "snippet", "description", "summary", "content");
  if (!title && !url) return null;
  return {
    title: title ?? url ?? "(untitled)",
    url,
    snippet,
    source: normalizeSource(obj, url),
    date: pickString(obj, "date", "published", "published_at"),
    imageUrl: pickString(obj, "thumbnail", "original", "image_url")
  };
}

function normalizeArray(arr: unknown[]): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  for (const entry of arr) {
    if (isRecord(entry)) {
      const item = itemFromObject(entry);
      if (item) items.push(item);
    }
  }
  return items;
}

/**
 * Parses the numbered plain-text block produced by `google_search`:
 *
 *   1. Some Title
 *      https://example.com/page
 *      A snippet describing the result.
 */
function parseNumberedText(text: string): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  let current: SearchResultItem | null = null;
  const snippetLines: string[] = [];

  const flush = () => {
    if (current) {
      const snippet = snippetLines.join(" ").trim();
      if (snippet) current.snippet = snippet;
      if (current.url && !current.source) current.source = domainFromUrl(current.url);
      items.push(current);
    }
    current = null;
    snippetLines.length = 0;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flush();
      current = { title: numbered[1].trim() || "(untitled)" };
      continue;
    }
    if (!current || line.length === 0) continue;
    if (/^https?:\/\//i.test(line) && !current.url) {
      current.url = line;
    } else {
      snippetLines.push(line);
    }
  }
  flush();
  return items;
}

export function normalizeSearchResults(content: unknown): SearchResultItem[] | null {
  if (content == null) return null;

  if (isString(content)) {
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return normalizeSearchResults(JSON.parse(trimmed));
      } catch {
        // Not JSON — fall through to text parsing.
      }
    }
    const parsed = parseNumberedText(trimmed);
    // A bare numbered list is ambiguous: real search output (google_search)
    // always pairs each entry with a URL line, whereas plain numbered prose
    // ("1. Preheat oven\n2. Mix flour") never does. Only treat it as search
    // results when at least one entry carries a URL, so ordinary numbered text
    // isn't rendered as search-result cards.
    const hasUrl = parsed.some((item) => item.url);
    return parsed.length > 0 && hasUrl ? parsed : null;
  }

  if (Array.isArray(content)) {
    const items = normalizeArray(content);
    return items.length > 0 ? items : null;
  }

  if (isRecord(content)) {
    const arr =
      (Array.isArray(content.results) && content.results) ||
      (Array.isArray(content.organic_results) && content.organic_results) ||
      (Array.isArray(content.items) && content.items) ||
      null;
    if (arr) {
      const items = normalizeArray(arr);
      return items.length > 0 ? items : null;
    }
  }

  return null;
}
