/**
 * Web search tools using the SerpAPI service.
 *
 * Port of src/nodetool/agents/tools/serp_tools.py (GoogleSearchTool,
 * GoogleNewsTool, GoogleImagesTool).
 *
 * Internally delegates to the SerpApiProvider abstraction when available.
 */

import { WEB_SEARCH_TOOL_NAME, type ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import type { SerpProvider } from "./serp-providers/index.js";
import { SerpApiProvider } from "./serp-providers/serpapi-provider.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function getSerpApiKey(context: ProcessingContext): Promise<string> {
  // Try context secret resolver first, then fall back to env var.
  const fromCtx = await context.getSecret("SERPAPI_API_KEY");
  if (fromCtx) return fromCtx;

  const fromEnv = process.env.SERPAPI_API_KEY;
  if (fromEnv) return fromEnv;

  throw new Error(
    "SERPAPI_API_KEY is not configured. Set it as an environment variable or via the secret resolver."
  );
}

interface SerpApiParams {
  engine: string;
  q?: string;
  api_key: string;
  num?: number;
  [key: string]: string | number | undefined;
}

async function serpApiFetch(params: SerpApiParams): Promise<unknown> {
  const url = new URL("https://serpapi.com/search");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpAPI request failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Resolve a SerpProvider.  If an explicit provider is supplied, use it;
 * otherwise create a SerpApiProvider from the context's API key.
 */
async function resolveProvider(
  context: ProcessingContext,
  provider?: SerpProvider
): Promise<SerpProvider> {
  if (provider) return provider;
  const apiKey = await getSerpApiKey(context);
  return new SerpApiProvider(apiKey);
}

/* ------------------------------------------------------------------ */
/*  WebSearchTool                                                     */
/* ------------------------------------------------------------------ */

function formatSearchResults(
  results: Array<{
    title?: string | null;
    link?: string | null;
    snippet?: string | null;
  }>
): string {
  if (results.length === 0) return "No results.";
  return results
    .map((r, i) => {
      const title = r.title ?? "(untitled)";
      const link = r.link ?? "";
      const snippet = r.snippet ?? "";
      return `${i + 1}. ${title}\n   ${link}${snippet ? `\n   ${snippet}` : ""}`;
    })
    .join("\n\n");
}

function domainOf(link: string | null | undefined): string {
  if (!link) return "";
  try {
    return new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Web search, modeled on Claude Code's `WebSearch` tool: a `query` plus
 * optional `allowed_domains` / `blocked_domains` filters. Backed by SerpAPI on
 * providers without a built-in web search. Providers that DO have one
 * (`supportsNativeWebSearch`) render a tool of this name as their own
 * server-side search instead of calling this implementation.
 */
export class WebSearchTool extends Tool {
  readonly name = WEB_SEARCH_TOOL_NAME;
  readonly description =
    "Search the web and use the results to inform responses. Returns up-to-date " +
    "information for current events and recent data beyond the model's training " +
    "cutoff. Each result includes the title, URL, and snippet. Optionally scope " +
    "results with allowed_domains (only these domains) or blocked_domains " +
    "(never these domains).";
  readonly jsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to use.",
        minLength: 2
      },
      allowed_domains: {
        type: "array",
        items: { type: "string" },
        description: "Only include results from these domains."
      },
      blocked_domains: {
        type: "array",
        items: { type: "string" },
        description: "Never include results from these domains."
      }
    },
    required: ["query"]
  };

  private _provider?: SerpProvider;

  constructor(provider?: SerpProvider) {
    super();
    this._provider = provider;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    // Accept the canonical `query` field, tolerate older `keyword`/`num_results`.
    const query =
      (params.query as string | undefined) ??
      (params.keyword as string | undefined);
    if (!query) return "Error: query is required";

    const numResults = (params.num_results as number) ?? 10;
    const allowed = (params.allowed_domains as string[] | undefined) ?? [];
    const blocked = (params.blocked_domains as string[] | undefined) ?? [];
    // `allowed_domains` is pushed into the query itself so the engine narrows
    // server-side; `blocked_domains` is applied to the returned results.
    const allowedClause = allowed.length
      ? " " + allowed.map((d) => `site:${d}`).join(" OR ")
      : "";
    const effectiveQuery = `${query}${allowedClause}`;

    const norm = (list: string[]) =>
      list.map((d) => d.replace(/^www\./, "").toLowerCase());
    const blockedSet = new Set(norm(blocked));
    const allowedSet = new Set(norm(allowed));
    // Match on a real label boundary, not a bare suffix: `host.endsWith("bank.com")`
    // also matches "fakebank.com", so a bare endsWith would leak look-alike
    // domains past an allowlist (and over-block on a blocklist).
    const hostMatches = (host: string, d: string) =>
      host === d || host.endsWith("." + d);
    const keep = (link: string | null | undefined) => {
      const host = domainOf(link);
      if (blockedSet.size && [...blockedSet].some((d) => hostMatches(host, d)))
        return false;
      if (allowedSet.size && ![...allowedSet].some((d) => hostMatches(host, d)))
        return false;
      return true;
    };

    let raw: Array<{
      title: string | null;
      link: string | null;
      snippet: string | null;
    }>;
    if (this._provider) {
      const results = await this._provider.search(effectiveQuery, {
        numResults
      });
      raw = results.map((r) => ({
        title: r.title ?? null,
        link: r.url ?? null,
        snippet: r.snippet ?? null
      }));
    } else {
      const apiKey = await getSerpApiKey(context);
      const data = (await serpApiFetch({
        engine: "google",
        q: effectiveQuery,
        api_key: apiKey,
        num: numResults
      })) as Record<string, unknown>;
      const organicResults = (data.organic_results ?? []) as Array<
        Record<string, unknown>
      >;
      raw = organicResults.map((r) => ({
        title: (r.title as string) ?? null,
        link: (r.link as string) ?? null,
        snippet: (r.snippet as string) ?? null
      }));
    }

    return formatSearchResults(raw.filter((r) => keep(r.link)));
  }

  userMessage(params: Record<string, unknown>): string {
    const query =
      (params.query as string | undefined) ??
      (params.keyword as string | undefined) ??
      "something";
    const msg = `Searching the web for '${query}'`;
    return msg.length > 80 ? "Searching the web" : msg;
  }
}

/* ------------------------------------------------------------------ */
/*  GoogleNewsTool                                                    */
/* ------------------------------------------------------------------ */

export class GoogleNewsTool extends Tool {
  readonly name = "google_news";
  readonly description =
    "Search Google News to retrieve live news articles via SerpAPI.";
  readonly jsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "The keyword to search for in Google News."
      },
      num_results: {
        type: "integer",
        description: "Number of news results to retrieve.",
        default: 10
      }
    },
    required: ["keyword"]
  };

  private _provider?: SerpProvider;

  constructor(provider?: SerpProvider) {
    super();
    this._provider = provider;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const keyword = params.keyword as string | undefined;
    if (!keyword) return { error: "keyword is required" };

    const apiKey = await getSerpApiKey(context);
    const numResults = (params.num_results as number) ?? 10;

    const data = (await serpApiFetch({
      engine: "google_news",
      q: keyword,
      api_key: apiKey,
      num: numResults
    })) as Record<string, unknown>;

    const newsResults = (data.news_results ?? []) as Array<
      Record<string, unknown>
    >;

    const results = newsResults.map((r) => ({
      title: r.title ?? null,
      link: r.link ?? null,
      snippet: r.snippet ?? null,
      date: r.date ?? null,
      source: (r.source as Record<string, unknown>)?.name ?? null
    }));

    return { success: true, results };
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = (params.keyword as string) ?? "something";
    const msg = `Searching Google News for '${keyword}'...`;
    return msg.length > 80 ? "Searching Google News..." : msg;
  }
}

/* ------------------------------------------------------------------ */
/*  GoogleImagesTool                                                  */
/* ------------------------------------------------------------------ */

export class GoogleImagesTool extends Tool {
  readonly name = "google_images";
  readonly description =
    "Search Google Images to retrieve image results via SerpAPI.";
  readonly jsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "Keyword for image search."
      },
      num_results: {
        type: "integer",
        description: "Number of image results to retrieve.",
        default: 20
      }
    },
    required: ["keyword"]
  };

  private _provider?: SerpProvider;

  constructor(provider?: SerpProvider) {
    super();
    this._provider = provider;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const keyword = params.keyword as string | undefined;
    if (!keyword) return { error: "keyword is required" };

    const apiKey = await getSerpApiKey(context);
    const numResults = (params.num_results as number) ?? 20;

    const data = (await serpApiFetch({
      engine: "google_images",
      q: keyword,
      api_key: apiKey,
      num: numResults
    })) as Record<string, unknown>;

    const imagesResults = (data.images_results ?? []) as Array<
      Record<string, unknown>
    >;

    const results = imagesResults.map((r) => ({
      title: r.title ?? null,
      link: r.link ?? null,
      original: r.original ?? null,
      thumbnail: r.thumbnail ?? null
    }));

    return { success: true, results };
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = (params.keyword as string) ?? "something";
    const msg = `Searching Google Images for '${keyword}'...`;
    return msg.length > 80 ? "Searching Google Images..." : msg;
  }
}
