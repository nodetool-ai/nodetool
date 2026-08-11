/**
 * The `web` capability module — everything the agent reaches over the network.
 *
 * Seven capabilities that used to be seven `Tool` subclasses across three
 * files: the three search tools (`../tools/search-tools.ts`), the two browser
 * tools (`../tools/browser-tools.ts`), and the two HTTP tools
 * (`../tools/http-tools.ts`). Wire names, descriptions and schemas are
 * unchanged; the classes survive as thin subclasses over these
 * implementations.
 *
 * The provider-specific backends — `openai_web_search`,
 * `google_grounded_search`, `dataforseo_*` — stay `Tool` classes: they are off
 * the agent belt and reachable only through `getBuiltinTools`. `web_search`
 * still routes to them, host-side, the way it always did.
 *
 * `htmlToText` and `requestSignal` live here rather than in the tool files
 * they came from, because those files now import *from* this module; the old
 * homes re-export them so every caller keeps its import path.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces".
 */

import {
  WEB_SEARCH_TOOL_NAME,
  safeFetch,
  type JsonSchema,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import type { SerpProvider } from "../tools/serp-providers/index.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import { stripElement, stripTags, stripToFixpoint } from "./html-text.js";

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/**
 * A per-request timeout that also honors the run's cancellation. A tool that
 * watches only its own timer keeps a 60-second request alive after the user
 * pressed Stop; a tool that watches only the run signal never times out.
 */
export function requestSignal(
  context: Pick<ProcessingContext, "signal"> | undefined,
  timeoutMs: number
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  const runSignal = context?.signal;
  return runSignal ? AbortSignal.any([timeout, runSignal]) : timeout;
}

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9"
};

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

/** One interchangeable backing service behind a search capability. */
interface SearchBackend {
  /** The value the `backend` param takes to pin this backend. */
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

// ---------------------------------------------------------------------------
// web_search
// ---------------------------------------------------------------------------

const WEB_SEARCH_SCHEMA: JsonSchema = {
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

/**
 * Web search, modeled on Claude Code's `WebSearch` tool: a `query` plus
 * optional `allowed_domains` / `blocked_domains` filters. Routes host-side
 * across the configured backends — SerpAPI, then OpenAI web search, then
 * Gemini grounded search, then DataForSEO. Providers that have a built-in
 * web search (`supportsNativeWebSearch`) render a tool of this name as their
 * own server-side search instead of calling this implementation.
 *
 * The optional `provider` is the SERP client `createSearchTool` injects; with
 * none, the SerpAPI backend calls the HTTP endpoint directly.
 */
export function webSearchImpl(provider?: SerpProvider): CapabilityImpl {
  return async (run: CapabilityRun, params: Record<string, unknown>) => {
    const context = run.context;
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
          provider !== undefined || serpApiConfigured(ctx),
        run: async (ctx) => {
          let raw: Array<{
            title: string | null;
            link: string | null;
            snippet: string | null;
          }>;
          if (provider) {
            const results = await provider.search(effectiveQuery, {
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
        isConfigured: async (ctx) => {
          const { openAiSearchConfigured } =
            await import("../tools/openai-tools.js");
          return openAiSearchConfigured(ctx);
        },
        run: async (ctx) => {
          const { OpenAIWebSearchTool } =
            await import("../tools/openai-tools.js");
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
        isConfigured: async (ctx) => {
          const { geminiSearchConfigured } =
            await import("../tools/google-tools.js");
          return geminiSearchConfigured(ctx);
        },
        run: async (ctx) => {
          const { GoogleGroundedSearchTool } =
            await import("../tools/google-tools.js");
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
        isConfigured: async (ctx) => {
          const { dataForSeoConfigured } =
            await import("../tools/dataseo-tools.js");
          return dataForSeoConfigured(ctx);
        },
        run: async (ctx) => {
          const { DataForSEOSearchTool } =
            await import("../tools/dataseo-tools.js");
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
      WEB_SEARCH_TOOL_NAME,
      context,
      backends,
      params.backend
    );
  };
}

const webSearch: CapabilityExport = {
  spec: {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the web and use the results to inform responses. Returns up-to-date " +
      "information for current events and recent data beyond the model's training " +
      "cutoff. Each result includes the title, URL, and snippet. Optionally scope " +
      "results with allowed_domains (only these domains) or blocked_domains " +
      "(never these domains). Runs on the first configured backend; `backend` " +
      "pins one.",
    inputSchema: WEB_SEARCH_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const query =
        (params.query as string | undefined) ??
        (params.keyword as string | undefined) ??
        "something";
      const msg = `Searching the web for '${query}'`;
      return msg.length > 80 ? "Searching the web" : msg;
    }
  },
  impl: webSearchImpl()
};

// ---------------------------------------------------------------------------
// google_news
// ---------------------------------------------------------------------------

const googleNews: CapabilityExport = {
  spec: {
    name: "google_news",
    description:
      "Search Google News to retrieve live news articles. Runs on the first " +
      "configured backend (SerpAPI, then DataForSEO); `backend` pins one.",
    inputSchema: {
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
    },
    category: "read",
    userMessage: (params) => {
      const keyword = (params.keyword as string) ?? "something";
      const msg = `Searching Google News for '${keyword}'...`;
      return msg.length > 80 ? "Searching Google News..." : msg;
    }
  },
  impl: async (run, params) => {
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
        isConfigured: async (ctx) => {
          const { dataForSeoConfigured } =
            await import("../tools/dataseo-tools.js");
          return dataForSeoConfigured(ctx);
        },
        run: async (ctx) => {
          const { DataForSEONewsTool } =
            await import("../tools/dataseo-tools.js");
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
      "google_news",
      run.context,
      backends,
      params.backend
    );
  }
};

// ---------------------------------------------------------------------------
// google_images
// ---------------------------------------------------------------------------

const googleImages: CapabilityExport = {
  spec: {
    name: "google_images",
    description:
      "Search Google Images to retrieve image results. Runs on the first " +
      "configured backend (SerpAPI, then DataForSEO); `backend` pins one.",
    inputSchema: {
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
    },
    category: "read",
    userMessage: (params) => {
      const keyword = (params.keyword as string) ?? "something";
      const msg = `Searching Google Images for '${keyword}'...`;
      return msg.length > 80 ? "Searching Google Images..." : msg;
    }
  },
  impl: async (run, params) => {
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
        isConfigured: async (ctx) => {
          const { dataForSeoConfigured } =
            await import("../tools/dataseo-tools.js");
          return dataForSeoConfigured(ctx);
        },
        run: async (ctx) => {
          const { DataForSEOImagesTool } =
            await import("../tools/dataseo-tools.js");
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
      "google_images",
      run.context,
      backends,
      params.backend
    );
  }
};

// ---------------------------------------------------------------------------
// browser
// ---------------------------------------------------------------------------

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " "
};

const ENTITY_RE = new RegExp(Object.keys(ENTITY_MAP).join("|"), "gi");

// Numeric character references: &#123; or &#x1a;
const NUMERIC_ENTITY_RE = /&#(?:x([0-9a-fA-F]+)|(\d+));/g;

/**
 * Convert raw HTML to readable plain text.
 *
 * - Strips `<script>` and `<style>` blocks
 * - Removes remaining HTML tags
 * - Decodes common HTML entities and numeric character references
 * - Collapses whitespace
 * - Truncates to `maxLength` characters
 */
export function htmlToText(html: string, maxLength = 50_000): string {
  let text = html;

  text = stripToFixpoint(text, (t) => stripElement(t, "script"));
  text = stripToFixpoint(text, (t) => stripElement(t, "style"));

  // Turn block boundaries into newlines before stripping tags.
  text = text.replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n");

  text = stripToFixpoint(text, stripTags);

  text = text.replace(
    ENTITY_RE,
    (match) => ENTITY_MAP[match.toLowerCase()] ?? match
  );

  text = text.replace(NUMERIC_ENTITY_RE, (match, hex, dec) => {
    const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    if (
      !Number.isFinite(code) ||
      code < 0 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      return match;
    }
    return String.fromCodePoint(code);
  });

  // Collapse runs of non-newline whitespace, preserving line breaks.
  text = text.replace(/[^\S\n]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return text;
}

// Search-engine hosts whose result pages are blocked from direct browsing.
const SEARCH_ENGINE_HOSTS = [
  "google.",
  "bing.",
  "search.yahoo",
  "duckduckgo",
  "yandex",
  "baidu",
  "ask.",
  "jina.ai"
];

function isSearchEngine(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return SEARCH_ENGINE_HOSTS.some((h) => lower.includes(h));
}

const browser: CapabilityExport = {
  spec: {
    name: "browser",
    description:
      "Fetches a web page and returns its readable text content (HTML " +
      "stripped). Returns plain text. Errors include a short reason. Search " +
      "engine result pages are blocked — use `google_search` instead.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to fetch."
        }
      },
      required: ["url"]
    },
    category: "external",
    userMessage: (params) => {
      const url = (params.url as string) ?? "a specific URL";
      const msg = `Fetching ${url}`;
      return msg.length > 160 ? "Fetching a URL" : msg;
    }
  },
  impl: async (run, params) => {
    const context = run.context;
    const url = params.url as string | undefined;
    if (!url) {
      return "Error: url is required";
    }

    try {
      const hostname = new URL(url).hostname;
      if (isSearchEngine(hostname)) {
        return "Error: Direct browsing of search engine result pages is disabled. Use google_search instead.";
      }
    } catch {
      return `Error: Invalid URL: ${url}`;
    }

    try {
      // The URL comes from the model and is therefore attacker-influenceable
      // via prompt injection. safeFetch gates it and every redirect hop against
      // SSRF, exactly as the HTTP tools do — a plain fetch here reached the
      // host's metadata service and internal APIs.
      const response = await safeFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        },
        signal: requestSignal(context, 30_000)
      });

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText} fetching ${url}`;
      }

      const html = await response.text();
      return htmlToText(html);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return `Error: ${message}`;
    }
  }
};

// ---------------------------------------------------------------------------
// take_screenshot
// ---------------------------------------------------------------------------

const takeScreenshot: CapabilityExport = {
  spec: {
    name: "take_screenshot",
    description:
      "Take a screenshot of a web page. Requires a remote browser service (BROWSER_URL).",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to before taking screenshot"
        },
        output_file: {
          type: "string",
          description: "Workspace relative path to save the screenshot",
          default: "screenshot.png"
        }
      },
      required: ["url", "output_file"]
    },
    category: "read",
    userMessage: (params) => {
      const url = (params.url as string) ?? "a page";
      const output = (params.output_file as string) ?? "screenshot.png";
      const msg = `Taking screenshot of ${url} and saving to ${output}.`;
      return msg.length > 160
        ? `Taking screenshot of a page and saving to ${output}.`
        : msg;
    }
  },
  impl: async (run, params) => {
    const context = run.context;
    const url = params.url as string | undefined;
    if (!url) {
      return { error: "URL is required for taking a screenshot" };
    }

    const browserUrl = process.env.BROWSER_URL;
    if (!browserUrl) {
      return {
        error:
          "Screenshots require a remote browser service. Set the BROWSER_URL environment variable to the browser service endpoint.",
        url
      };
    }

    try {
      const outputFile = (params.output_file as string) ?? "screenshot.png";
      // BROWSER_URL is operator-configured, not model-controlled, so it stays a
      // plain fetch (it is usually an internal service safeFetch would block) —
      // but it still has to observe the run's cancellation.
      const response = await fetch(browserUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, output_file: outputFile }),
        signal: requestSignal(context, 30_000)
      });

      if (!response.ok) {
        return {
          error: `Browser service returned HTTP ${response.status}: ${response.statusText}`,
          url
        };
      }

      const result = (await response.json()) as Record<string, unknown>;
      return { success: true, ...result };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: `Error taking screenshot: ${message}` };
    }
  }
};

// ---------------------------------------------------------------------------
// download_file
// ---------------------------------------------------------------------------

const downloadFile: CapabilityExport = {
  spec: {
    name: "download_file",
    description:
      "Download a text or binary file from a URL and save it to the workspace. " +
      "For images / audio / video / pdf, the result includes a `display_markdown` " +
      "field with a ready-to-paste markdown snippet that embeds the asset via a " +
      "UI-fetchable URL (`asset_url`). When narrating the result to the user, " +
      "include `display_markdown` verbatim — never construct your own markdown " +
      "from `output_file`, which is a workspace storage key, not a URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the file to download"
        },
        output_file: {
          type: "string",
          description: "Workspace relative path where to save the file"
        }
      },
      required: ["url", "output_file"]
    },
    category: "write",
    userMessage: (params) => {
      const url = String(params["url"] ?? "a URL");
      const output = String(params["output_file"] ?? "a file");
      let msg = `Downloading from ${url} to ${output}...`;
      if (msg.length > 80) {
        msg = `Downloading file to ${output}...`;
      }
      if (msg.length > 80) {
        msg = "Downloading a file...";
      }
      return msg;
    }
  },
  impl: async (run, params) => {
    const context = run.context;
    try {
      const url = params["url"];
      const outputFile = params["output_file"];

      if (typeof url !== "string" || !url) {
        return { error: "URL is required" };
      }
      if (typeof outputFile !== "string" || !outputFile) {
        return { error: "Output file is required" };
      }

      const customHeaders =
        params["headers"] && typeof params["headers"] === "object"
          ? (params["headers"] as Record<string, string>)
          : {};
      const mergedHeaders = { ...DEFAULT_HEADERS, ...customHeaders };

      const timeoutMs =
        typeof params["timeout"] === "number"
          ? params["timeout"] * 1000
          : 60_000;

      // safeFetch gates the URL (and every redirect hop) against SSRF: no
      // http:// downgrade, no loopback/link-local/RFC1918 targets. The URL is
      // model/attacker-influenceable via prompt injection, so it must not be
      // able to reach the host's metadata service or internal APIs.
      const response = await safeFetch(url, {
        headers: mergedHeaders,
        signal: requestSignal(context, timeoutMs)
      });

      if (!response.ok) {
        return {
          url,
          output_file: outputFile,
          success: false,
          error: `HTTP request failed with status ${response.status}`,
          status_code: response.status
        };
      }

      const contentType = response.headers.get("Content-Type") ?? "unknown";
      const contentLength = response.headers.get("Content-Length");
      const parsedLength = contentLength ? parseInt(contentLength, 10) : NaN;
      const fileSizeBytes = Number.isFinite(parsedLength) ? parsedLength : null;

      const bytes = new Uint8Array(await response.arrayBuffer());
      const { persistBinaryOutput } = await import("../tools/binary-output.js");
      const persisted = await persistBinaryOutput(context, bytes, {
        outputFile,
        contentType,
        uiPrefix: "downloads"
      });

      return {
        url,
        success: true,
        content_type: contentType,
        file_size_bytes: fileSizeBytes,
        ...persisted
      };
    } catch (e) {
      return { error: `Error in download process: ${String(e)}` };
    }
  }
};

// ---------------------------------------------------------------------------
// http_request
// ---------------------------------------------------------------------------

const httpRequest: CapabilityExport = {
  spec: {
    name: "http_request",
    description: "Make an HTTP request and return the response body as text",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to send the request to"
        },
        method: {
          type: "string",
          description:
            "HTTP method (GET, POST, PUT, DELETE, PATCH). Defaults to GET."
        },
        headers: {
          type: "object",
          description: "Optional HTTP headers"
        },
        body: {
          type: "string",
          description: "Optional request body (for POST/PUT/PATCH)"
        }
      },
      required: ["url"]
    },
    category: "external",
    userMessage: (params) => {
      const method = String(params["method"] ?? "GET").toUpperCase();
      const url = String(params["url"] ?? "a URL");
      let msg = `${method} ${url}`;
      if (msg.length > 80) {
        msg = `${method} request...`;
      }
      return msg;
    }
  },
  impl: async (run, params) => {
    const context = run.context;
    try {
      const url = params["url"];
      if (typeof url !== "string" || !url) {
        return { error: "URL is required" };
      }

      const method = (
        typeof params["method"] === "string" ? params["method"] : "GET"
      ).toUpperCase();

      const customHeaders =
        params["headers"] && typeof params["headers"] === "object"
          ? (params["headers"] as Record<string, string>)
          : {};
      const mergedHeaders = { ...DEFAULT_HEADERS, ...customHeaders };

      const body =
        typeof params["body"] === "string" ? params["body"] : undefined;

      const timeoutMs =
        typeof params["timeout"] === "number"
          ? params["timeout"] * 1000
          : 60_000;

      // safeFetch gates the URL (and redirects) against SSRF — the URL is
      // model/attacker-influenceable via prompt injection, so it must not be
      // able to reach loopback/link-local/internal hosts or downgrade to http.
      const response = await safeFetch(url, {
        method,
        headers: mergedHeaders,
        body: ["POST", "PUT", "PATCH"].includes(method) ? body : undefined,
        signal: requestSignal(context, timeoutMs)
      });

      const contentType = response.headers.get("Content-Type") ?? "unknown";
      const text = await response.text();

      return {
        url,
        status_code: response.status,
        success: response.ok,
        content_type: contentType,
        body: text
      };
    } catch (e) {
      return { error: `Error in HTTP request: ${String(e)}` };
    }
  }
};

/** Every web capability, in the order the tool files declared them. */
export const WEB_CAPABILITIES: readonly CapabilityExport[] = [
  webSearch,
  googleNews,
  googleImages,
  browser,
  takeScreenshot,
  httpRequest,
  downloadFile
];

export const module: CapabilityModule = {
  module: "web",
  exports: WEB_CAPABILITIES
};

export {
  webSearch,
  googleNews,
  googleImages,
  browser,
  takeScreenshot,
  httpRequest,
  downloadFile
};
