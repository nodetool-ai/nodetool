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

interface CheerioSelection {
  length: number;
  eq: (index: number) => {
    text: () => string;
    attr: (name: string) => string | undefined;
  };
}

interface CheerioLike {
  load: (html: string) => (selector: string) => CheerioSelection;
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
    opts.attr === undefined || opts.attr === null ? undefined : String(opts.attr);
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
  const service = new Turndown({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    ...(typeof opts.turndown === "object" && opts.turndown !== null
      ? (opts.turndown as Record<string, unknown>)
      : {})
  });
  return service.turndown(source);
}
