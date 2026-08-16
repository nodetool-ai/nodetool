/**
 * `@nodetool-ai/sandbox-html` — cheerio and turndown, on the host.
 *
 * cheerio imports 25 Node builtins and turndown wants a DOM, so neither can be
 * a guest module. The match cap lives here: a selector matching a million
 * elements must not hand the guest a million strings, and the guest cannot
 * raise the ceiling.
 */

import { optionsOf, requireText, unwrapLibrary } from "./limits.js";

/** Matches `select` returns when the caller names no limit. */
export const DEFAULT_SELECT_HTML_LIMIT = 100;
/** Ceiling for `select`'s `limit` option. */
export const MAX_SELECT_HTML_LIMIT = 1000;

interface CheerioElement {
  text: () => string;
  attr: (name: string) => string | undefined;
  remove: () => void;
}

interface CheerioSelection extends CheerioElement {
  length: number;
  eq: (index: number) => CheerioElement;
  first: () => CheerioElement;
  each: (fn: (index: number, el: unknown) => void) => CheerioSelection;
}

type CheerioAPI = ((
  selector: string | unknown,
  context?: unknown
) => CheerioSelection) & {
  root: () => CheerioElement;
};

interface CheerioLike {
  load: (html: string) => CheerioAPI;
}

interface TurndownLike {
  new (opts?: Record<string, unknown>): { turndown: (html: string) => string };
}

async function loadCheerio(where: string): Promise<CheerioLike> {
  const mod: unknown = await import("cheerio");
  return unwrapLibrary<CheerioLike>(
    mod,
    where,
    "cheerio",
    (v) => typeof (v as CheerioLike | undefined)?.load === "function"
  );
}

async function loadTurndown(where: string): Promise<TurndownLike> {
  const mod: unknown = await import("turndown");
  return unwrapLibrary<TurndownLike>(
    mod,
    where,
    "turndown",
    (v) => typeof v === "function"
  );
}

/**
 * CSS selection over HTML: trimmed text per match, or the named attribute when
 * `attr` is set. `limit` is clamped to {@link MAX_SELECT_HTML_LIMIT}.
 */
export async function select(
  html: unknown,
  selector: unknown,
  options?: unknown
): Promise<string[]> {
  const where = "html.select";
  const source = requireText(where, html, "html");
  if (typeof selector !== "string" || !selector.trim()) {
    throw new Error(`${where}: selector must be a non-empty string`);
  }
  const opts = optionsOf(options);
  const attr =
    opts.attr === undefined || opts.attr === null
      ? undefined
      : String(opts.attr);
  const rawLimit = Number(opts.limit ?? DEFAULT_SELECT_HTML_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 0), MAX_SELECT_HTML_LIMIT)
    : DEFAULT_SELECT_HTML_LIMIT;
  const cheerio = await loadCheerio(where);
  const $ = cheerio.load(source);
  let matches: CheerioSelection;
  try {
    matches = $(selector);
  } catch (e) {
    throw new Error(
      `${where}: invalid selector "${selector}" (${
        e instanceof Error ? e.message : String(e)
      })`
    );
  }
  const out: string[] = [];
  for (let i = 0; i < matches.length && out.length < limit; i++) {
    const el = matches.eq(i);
    if (attr) {
      const value = el.attr(attr);
      if (value !== undefined && value !== null) out.push(String(value));
    } else {
      out.push(el.text().trim());
    }
  }
  return out;
}

/** A whole HTML page as clean markdown. */
export async function toMarkdown(
  html: unknown,
  options?: unknown
): Promise<string> {
  const where = "html.toMarkdown";
  const source = requireText(where, html, "html");
  const opts = optionsOf(options);
  const Turndown = await loadTurndown(where);
  const overrides =
    typeof opts.turndown === "object" && opts.turndown !== null
      ? (opts.turndown as Record<string, unknown>)
      : {};
  const service = new Turndown({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    ...overrides
  });
  return service.turndown(source);
}

/** Largest number of extracted items any extractor returns. */
export const MAX_EXTRACT_HTML_ITEMS = 1000;

function resolveUrl(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl || undefined).href;
  } catch {
    return src;
  }
}

/** A whole HTML page as plain text — tags stripped, whitespace collapsed. */
export async function toText(html: unknown): Promise<string> {
  const where = "html.toText";
  const source = requireText(where, html, "html");
  const cheerio = await loadCheerio(where);
  const $ = cheerio.load(source);
  $("script, style").remove();
  return $.root()
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ExtractedLink {
  href: string;
  text: string;
  type: "internal" | "external";
}

/** Every `<a href>` in the page, classified internal vs external. */
export async function extractLinks(
  html: unknown,
  baseUrl?: unknown
): Promise<ExtractedLink[]> {
  const where = "html.extractLinks";
  const source = requireText(where, html, "html");
  const base = baseUrl === undefined || baseUrl === null ? "" : String(baseUrl);
  const cheerio = await loadCheerio(where);
  const $ = cheerio.load(source);
  const isInternal = (href: string): boolean => {
    if (!href || href.startsWith("#")) return true;
    if (/^(mailto|tel|javascript):/i.test(href)) return false;
    if (base) {
      try {
        return new URL(href, base).origin === new URL(base).origin;
      } catch {
        // Unparseable href/base — fall through to the scheme heuristic.
      }
    }
    return !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href);
  };
  const results: ExtractedLink[] = [];
  $("a[href]").each((_i, el) => {
    if (results.length >= MAX_EXTRACT_HTML_ITEMS) return;
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    results.push({
      href,
      text: $el.text().trim(),
      type: isInternal(href) ? "internal" : "external"
    });
  });
  return results;
}

async function extractSrcAttrs(
  where: string,
  html: unknown,
  baseUrl: unknown,
  selector: string
): Promise<string[]> {
  const source = requireText(where, html, "html");
  const base = baseUrl === undefined || baseUrl === null ? "" : String(baseUrl);
  const cheerio = await loadCheerio(where);
  const $ = cheerio.load(source);
  const results: string[] = [];
  $(selector).each((_i, el) => {
    if (results.length >= MAX_EXTRACT_HTML_ITEMS) return;
    const src = $(el).attr("src");
    if (src) results.push(resolveUrl(src, base));
  });
  return results;
}

/** Every `<img src>` in the page, with relative URLs resolved against `baseUrl`. */
export async function extractImages(
  html: unknown,
  baseUrl?: unknown
): Promise<string[]> {
  return extractSrcAttrs("html.extractImages", html, baseUrl, "img[src]");
}

/** Every `<audio src>` / `<audio><source src>` in the page. */
export async function extractAudio(
  html: unknown,
  baseUrl?: unknown
): Promise<string[]> {
  return extractSrcAttrs(
    "html.extractAudio",
    html,
    baseUrl,
    "audio[src], audio source[src]"
  );
}

/** Every `<video src>` / `<video><source src>` / `<iframe src>` in the page. */
export async function extractVideos(
  html: unknown,
  baseUrl?: unknown
): Promise<string[]> {
  return extractSrcAttrs(
    "html.extractVideos",
    html,
    baseUrl,
    "video[src], video source[src], iframe[src]"
  );
}

interface ExtractedMetadata {
  title: string | null;
  description: string | null;
  keywords: string | null;
}

/** `<title>` and the description/keywords `<meta>` tags. */
export async function extractMetadata(
  html: unknown
): Promise<ExtractedMetadata> {
  const where = "html.extractMetadata";
  const source = requireText(where, html, "html");
  const cheerio = await loadCheerio(where);
  const $ = cheerio.load(source);
  const title = $("title").first().text() || null;
  const description =
    $('meta[name="description"]').first().attr("content") ?? null;
  const keywords = $('meta[name="keywords"]').first().attr("content") ?? null;
  return { title, description, keywords };
}

/**
 * The page's main readable content: strips script/style/nav/aside/footer/
 * header, then picks the first of article, main, `[id*=content]`,
 * `[class*=content]`, or body.
 */
export async function extractReadableText(html: unknown): Promise<string> {
  const where = "html.extractReadableText";
  const source = requireText(where, html, "html");
  const cheerio = await loadCheerio(where);
  const $ = cheerio.load(source);
  $("script, style, nav, aside, footer, header").remove();
  const main =
    $("article").first().text() ||
    $("main").first().text() ||
    $('[id*="content"]').first().text() ||
    $('[class*="content"]').first().text() ||
    $("body").first().text() ||
    "";
  const cleaned = main.replace(/\s+/g, " ").trim();
  return cleaned || "No main content found";
}
