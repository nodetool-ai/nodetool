/**
 * The three agent-facing search tools: `web_search`, `google_news`,
 * `google_images`.
 *
 * Each routes host-side across the configured search backends in preference
 * order (`web_search`: SerpAPI → OpenAI → Gemini grounded → DataForSEO;
 * news/images: SerpAPI → DataForSEO). "Configured" is decided from real
 * configuration — the backend's required secrets, checked before any call —
 * never by sniffing error messages. A real error from a configured backend
 * fails the call; there is no fallthrough past a backend that has its keys.
 * The optional `backend` param pins one backend; pinning an unconfigured one
 * is an error naming the missing key.
 */

import { WEB_SEARCH_TOOL_NAME, type ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import type { SerpProvider } from "./serp-providers/index.js";
import { SerpApiProvider } from "./serp-providers/serpapi-provider.js";
import { OpenAIWebSearchTool, openAiSearchConfigured } from "./openai-tools.js";
import {
  GoogleGroundedSearchTool,
  geminiSearchConfigured
} from "./google-tools.js";
import {
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool,
  dataForSeoConfigured
} from "./dataseo-tools.js";

async function getSerpApiKey(context: ProcessingContext): Promise<string> {
  const fromCtx = await context.getSecret("SERPAPI_API_KEY");
  if (fromCtx) return fromCtx;

  const fromEnv = process.env.SERPAPI_API_KEY;
  if (fromEnv) return fromEnv;

  throw new Error(
    "SERPAPI_API_KEY is not configured. Set it as an environment variable or via the secret resolver."
  );
}

/** Whether the SerpAPI backend is usable: its key is in the store or env. */
export async function serpApiConfigured(
  context: ProcessingContext
): Promise<boolean> {
  const fromCtx =
    typeof context?.getSecret === "function"
      ? await context.getSecret("SERPAPI_API_KEY")
      : null;
  return Boolean(fromCtx ?? process.env.SERPAPI_API_KEY);
}

/** One interchangeable backing service behind a search tool. */
interface SearchBackend {
  /** The value the tool's `backend` param takes to pin this backend. */
  name: string;
  /** The secret(s) that make it usable, for error messages. */
  requires: string;
  isConfigured(context: ProcessingContext): Promise<boolean>;
  run(context: ProcessingContext): Promise<unknown>;
}

/**
 * Run the first configured backend, or the pinned one. Unconfigured backends
 * are skipped up front; once a backend runs, its failure is the call's
 * failure — a real error never falls through to the next backend.
 */
async function runFirstConfiguredBackend(
  toolName: string,
  context: ProcessingContext,
  backends: SearchBackend[],
  pinnedRaw: unknown
): Promise<unknown> {
  // `default` always means the tool's own first backend.
  const pinned =
    pinnedRaw === undefined || pinnedRaw === null || pinnedRaw === ""
      ? undefined
      : String(pinnedRaw) === "default"
        ? backends[0].name
        : String(pinnedRaw);
  if (pinned !== undefined) {
    const backend = backends.find((b) => b.name === pinned);
    if (!backend) {
      throw new Error(
        `${toolName}: unknown backend "${pinned}" — one of ` +
          backends.map((b) => b.name).join(", ") +
          "."
      );
    }
    if (!(await backend.isConfigured(context))) {
      throw new Error(
        `${toolName}: backend "${backend.name}" is not configured — set ` +
          `${backend.requires}.`
      );
    }
    return backend.run(context);
  }

  const unconfigured: string[] = [];
  for (const backend of backends) {
    if (await backend.isConfigured(context)) return backend.run(context);
    unconfigured.push(`${backend.name} needs ${backend.requires}`);
  }
  throw new Error(
    `${toolName}: no search backend is configured — ` +
      unconfigured.join("; ") +
      "."
  );
}

/**
 * The delegated tools report failures as `{error}` objects; on this routed
 * path the backend was verified configured first, so an `{error}` is a real
 * failure and must fail the call, not fall through.
 */
function unwrapBackendResult(result: unknown): Record<string, unknown> {
  if (result !== null && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.error === "string") throw new Error(record.error);
    return record;
  }
  throw new Error(`Unexpected search backend result: ${String(result)}`);
}

const DATAFORSEO_REQUIRES = "DATA_FOR_SEO_LOGIN and DATA_FOR_SEO_PASSWORD";

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

async function resolveProvider(
  context: ProcessingContext,
  provider?: SerpProvider
): Promise<SerpProvider> {
  if (provider) return provider;
  const apiKey = await getSerpApiKey(context);
  return new SerpApiProvider(apiKey);
}

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
 * optional `allowed_domains` / `blocked_domains` filters. Routes host-side
 * across the configured backends — SerpAPI, then OpenAI web search, then
 * Gemini grounded search, then DataForSEO. Providers that have a built-in
 * web search (`supportsNativeWebSearch`) render a tool of this name as their
 * own server-side search instead of calling this implementation.
 */
export class WebSearchTool extends Tool {
  readonly name = WEB_SEARCH_TOOL_NAME;
  readonly description =
    "Search the web and use the results to inform responses. Returns up-to-date " +
    "information for current events and recent data beyond the model's training " +
    "cutoff. Each result includes the title, URL, and snippet. Optionally scope " +
    "results with allowed_domains (only these domains) or blocked_domains " +
    "(never these domains). Runs on the first configured backend; `backend` " +
    "pins one.";
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
      },
      backend: {
        type: "string",
        enum: ["serpapi", "openai", "gemini", "dataforseo"],
        description:
          "Pin one search backend instead of routing to the first " +
          "configured one."
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

    const formatFiltered = (
      raw: Array<{
        title: string | null;
        link: string | null;
        snippet: string | null;
      }>
    ) => formatSearchResults(raw.filter((r) => keep(r.link)));

    const backends: SearchBackend[] = [
      {
        name: "serpapi",
        requires: "SERPAPI_API_KEY",
        isConfigured: async (ctx) =>
          this._provider !== undefined || serpApiConfigured(ctx),
        run: async (ctx) => {
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
            const apiKey = await getSerpApiKey(ctx);
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
          return formatFiltered(raw);
        }
      },
      {
        name: "openai",
        requires: "OPENAI_API_KEY",
        isConfigured: openAiSearchConfigured,
        run: async (ctx) => {
          const result = unwrapBackendResult(
            await new OpenAIWebSearchTool().process(ctx, {
              query: effectiveQuery
            })
          );
          return String(result.results ?? "");
        }
      },
      {
        name: "gemini",
        requires: "GEMINI_API_KEY",
        isConfigured: geminiSearchConfigured,
        run: async (ctx) => {
          const result = unwrapBackendResult(
            await new GoogleGroundedSearchTool().process(ctx, {
              query: effectiveQuery
            })
          );
          const text = Array.isArray(result.results)
            ? result.results.join("\n\n")
            : String(result.results ?? "");
          const sources = (
            (result.sources ?? []) as Array<{ title: string; url: string }>
          ).filter((s) => keep(s.url));
          if (sources.length === 0) return text;
          const sourceLines = sources
            .map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}`)
            .join("\n\n");
          return `${text}\n\nSources:\n\n${sourceLines}`;
        }
      },
      {
        name: "dataforseo",
        requires: DATAFORSEO_REQUIRES,
        isConfigured: dataForSeoConfigured,
        run: async (ctx) => {
          const result = unwrapBackendResult(
            await new DataForSEOSearchTool().process(ctx, {
              keyword: effectiveQuery,
              num_results: numResults
            })
          );
          const results = (result.results ?? []) as Array<
            Record<string, unknown>
          >;
          return formatFiltered(
            results.map((r) => ({
              title: (r.title as string) ?? null,
              link: (r.url as string) ?? null,
              snippet: (r.snippet as string) ?? null
            }))
          );
        }
      }
    ];

    return runFirstConfiguredBackend(
      this.name,
      context,
      backends,
      params.backend
    );
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

export class GoogleNewsTool extends Tool {
  readonly name = "google_news";
  readonly description =
    "Search Google News to retrieve live news articles. Runs on the first " +
    "configured backend (SerpAPI, then DataForSEO); `backend` pins one.";
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
      },
      backend: {
        type: "string",
        enum: ["serpapi", "dataforseo"],
        description:
          "Pin one search backend instead of routing to the first " +
          "configured one."
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

    const numResults = (params.num_results as number) ?? 10;

    const backends: SearchBackend[] = [
      {
        name: "serpapi",
        requires: "SERPAPI_API_KEY",
        isConfigured: serpApiConfigured,
        run: async (ctx) => {
          const apiKey = await getSerpApiKey(ctx);
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
      },
      {
        name: "dataforseo",
        requires: DATAFORSEO_REQUIRES,
        isConfigured: dataForSeoConfigured,
        run: async (ctx) => {
          const result = unwrapBackendResult(
            await new DataForSEONewsTool().process(ctx, {
              keyword,
              num_results: numResults
            })
          );
          const items = (result.results ?? []) as Array<
            Record<string, unknown>
          >;
          const results = items.map((r) => ({
            title: r.title ?? null,
            link: r.url ?? null,
            snippet: r.snippet ?? null,
            date: r.published_at ?? null,
            source: r.source ?? null
          }));
          return { success: true, results };
        }
      }
    ];

    return runFirstConfiguredBackend(
      this.name,
      context,
      backends,
      params.backend
    );
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = (params.keyword as string) ?? "something";
    const msg = `Searching Google News for '${keyword}'...`;
    return msg.length > 80 ? "Searching Google News..." : msg;
  }
}

export class GoogleImagesTool extends Tool {
  readonly name = "google_images";
  readonly description =
    "Search Google Images to retrieve image results. Runs on the first " +
    "configured backend (SerpAPI, then DataForSEO); `backend` pins one.";
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
      },
      backend: {
        type: "string",
        enum: ["serpapi", "dataforseo"],
        description:
          "Pin one search backend instead of routing to the first " +
          "configured one."
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

    const numResults = (params.num_results as number) ?? 20;

    const backends: SearchBackend[] = [
      {
        name: "serpapi",
        requires: "SERPAPI_API_KEY",
        isConfigured: serpApiConfigured,
        run: async (ctx) => {
          const apiKey = await getSerpApiKey(ctx);
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
      },
      {
        name: "dataforseo",
        requires: DATAFORSEO_REQUIRES,
        isConfigured: dataForSeoConfigured,
        run: async (ctx) => {
          const result = unwrapBackendResult(
            await new DataForSEOImagesTool().process(ctx, {
              keyword,
              num_results: numResults
            })
          );
          const items = (result.results ?? []) as Array<
            Record<string, unknown>
          >;
          const results = items.map((r) => ({
            title: r.title ?? null,
            link: r.source_url ?? null,
            original: r.image_url ?? null,
            thumbnail: null
          }));
          return { success: true, results };
        }
      }
    ];

    return runFirstConfiguredBackend(
      this.name,
      context,
      backends,
      params.backend
    );
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = (params.keyword as string) ?? "something";
    const msg = `Searching Google Images for '${keyword}'...`;
    return msg.length > 80 ? "Searching Google Images..." : msg;
  }
}
