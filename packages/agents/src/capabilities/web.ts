/**
 * The `web` capability module — everything the agent reaches over the network.
 *
 * Seven capabilities that used to be seven `Tool` subclasses across three
 * files: the three search tools, the two browser tools, and the two HTTP
 * tools. Wire names, descriptions and schemas are unchanged; a belt builds
 * all seven from `web.specs.ts` by name.
 *
 * The provider-specific backends are plain functions, not tools. They have no
 * wire name of their own: the single `web_search` capability chooses one
 * host-side, so a model picks a capability and the host picks the provider
 * behind it.
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
  loadMediaRefBytes,
  safeFetch,
  isSafePublicHttpsUrl,
  type JsonSchema,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { isAuthEnforced } from "@nodetool-ai/config";
import { mimeForPath } from "../sandbox-media-ref.js";
import type {
  SerpProvider,
  SerpProviderType
} from "../tools/serp-providers/index.js";
import {
  SERP_PROVIDER_SEARCH_TYPES,
  createSerpProvider,
  serpProviderConfigured
} from "../tools/serp-providers/index.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import { stripElement, stripTags, stripToFixpoint } from "./html-text.js";
import {
  webSearchSpec,
  imageSearchSpec,
  browserSpec,
  takeScreenshotSpec,
  downloadFileSpec,
  httpRequestSpec,
  WEB_SEARCH_SCHEMA
} from "./web.specs.js";
import {
  isFunction,
  isNumber,
  isObjectLike,
  isString
} from "../utils/type-guards.js";

export { WEB_SEARCH_SCHEMA } from "./web.specs.js";

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

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9"
} satisfies Record<string, string>;

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
    isFunction(context?.getSecret)
      ? await context.getSecret("SERPAPI_API_KEY")
      : null;
  return Boolean(fromCtx ?? process.env.SERPAPI_API_KEY);
}

/** What a caller asked to search over. */
export type SearchType = "web" | "news" | "images";

/** Parse the `search_type` argument, defaulting to `web`. */
function readSearchType(value: unknown): SearchType | undefined {
  if (value === undefined || value === null || value === "") return "web";
  const text = String(value);
  return text === "web" || text === "news" || text === "images"
    ? text
    : undefined;
}

/** One interchangeable backing service behind a search capability. */
interface SearchBackend {
  /** The value the `backend` param takes to pin this backend. */
  name: string;
  /** The secret(s) that make it usable, for error messages. */
  requires: string;
  /** The search types it can answer. Others skip it while routing. */
  supports: ReadonlySet<SearchType>;
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
  pinnedRaw: unknown,
  searchType: SearchType = "web"
): Promise<unknown> {
  // A backend that cannot answer this kind of search is not a candidate. Doing
  // this first means the "nothing is configured" message lists only backends
  // that could have served the call, instead of telling someone searching for
  // images to go and set a key that would not have helped.
  const capable = backends.filter((b) => b.supports.has(searchType));

  // `default` always means the tool's own first backend.
  const pinned =
    pinnedRaw === undefined || pinnedRaw === null || pinnedRaw === ""
      ? undefined
      : String(pinnedRaw) === "default"
        ? capable[0]?.name
        : String(pinnedRaw);
  if (pinned !== undefined) {
    const backend = capable.find((b) => b.name === pinned);
    if (!backend) {
      const known = backends.find((b) => b.name === pinned);
      if (known) {
        throw new Error(
          `${toolName}: backend "${pinned}" does not support ` +
            `search_type "${searchType}" — use one of ` +
            capable.map((b) => b.name).join(", ") +
            "."
        );
      }
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
  for (const backend of capable) {
    if (await backend.isConfigured(context)) return backend.run(context);
    unconfigured.push(`${backend.name} needs ${backend.requires}`);
  }
  throw new Error(
    `${toolName}: no search backend is configured for search_type ` +
      `"${searchType}" — ` +
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
  if (isObjectLike(result)) {
    const record = result as Record<string, unknown>;
    if (isString(record.error)) throw new Error(record.error);
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

/**
 * Web, news, and image search over every configured backend.
 *
 * This is the whole search surface. It used to be three capabilities —
 * `web_search`, `google_news`, `google_images` — which was three wire names,
 * three schemas and three routing tables for one question with a parameter on
 * it, and it left two of the four SERP providers (Brave, Apify) reachable from
 * no tool at all. `search_type` replaced the split, and the backend list is now
 * the full set, so anything the SERP factory can build is reachable from an
 * agent and from sandbox code.
 *
 * Result shapes are preserved across that merge on purpose: `web` returns the
 * formatted string it always did, `news` and `images` return the
 * `{success, results}` records they always did. The consumers — the chat UI's
 * result parser most of all — read shapes, not tool names.
 *
 * Not every backend serves every type. A backend that cannot is skipped while
 * routing and named as the reason when it was pinned, rather than quietly
 * answering an image search with web results.
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

    const searchType = readSearchType(params.search_type);
    if (searchType === undefined) {
      return `Error: unknown search_type "${String(params.search_type)}" — one of web, news, images.`;
    }

    const numResults =
      (params.num_results as number | undefined) ??
      (searchType === "images" ? 20 : 10);
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

    /** Filter a news/image record list on the same domain rules. */
    const keepRecords = (records: Array<Record<string, unknown>>) =>
      records.filter((r) => keep((r.link as string | null) ?? null));

    /**
     * Append a model-backed backend's citations to its prose answer.
     *
     * OpenAI and Gemini answer a search with an argument rather than a result
     * list, and the pages behind it are the only way a reader can check one.
     * Both are read into the same `{title, url}` shape by their provider, so
     * one formatter serves them and the domain filters still apply.
     */
    const withSources = (text: string, raw: unknown): string => {
      const sources = (
        Array.isArray(raw) ? (raw as Array<{ title: string; url: string }>) : []
      ).filter((s) => keep(s.url));
      if (sources.length === 0) return text;
      const lines = sources
        .map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}`)
        .join("\n\n");
      return `${text}\n\nSources:\n\n${lines}`;
    };

    /** A SERP-factory backend: build the client, search, format. */
    const serpFactoryBackend = (
      name: SerpProviderType,
      requires: string
    ): SearchBackend => ({
      name,
      requires,
      supports: new Set<SearchType>(SERP_PROVIDER_SEARCH_TYPES[name]),
      isConfigured: (ctx) => serpProviderConfigured(name, ctx),
      run: async (ctx) => {
        const client = await createSerpProvider(name, ctx);
        if (searchType === "images") {
          // Routing only offers this backend for images when the table says
          // its client implements searchImages, so a missing method here is a
          // table that drifted from the class — say which, rather than
          // answering an image search with pages.
          if (!client.searchImages) {
            throw new Error(
              `${WEB_SEARCH_TOOL_NAME}: backend "${name}" declares image ` +
                "search but its client implements none."
            );
          }
          const images = await client.searchImages(effectiveQuery, {
            numResults
          });
          return {
            success: true,
            results: keepRecords(
              images.map((r) => ({
                title: r.title,
                link: r.link,
                original: r.original,
                thumbnail: r.thumbnail
              }))
            )
          };
        }
        const results = await client.search(effectiveQuery, { numResults });
        return formatFiltered(
          results.map((r) => ({
            title: r.title ?? null,
            link: r.url ?? null,
            snippet: r.snippet ?? null
          }))
        );
      }
    });

    const backends: SearchBackend[] = [
      {
        name: "serpapi",
        requires: "SERPAPI_API_KEY",
        supports: new Set<SearchType>(["web", "news", "images"]),
        // The injected client is only consulted on the web path below, and it
        // is whatever SERP_PROVIDER names — possibly not SerpAPI at all. On
        // news and images this backend calls serpapi.com directly, so only a
        // real key makes it configured; otherwise a Brave-backed install
        // answered an image search with "SERPAPI_API_KEY is not configured"
        // instead of routing on to Brave.
        isConfigured: async (ctx) =>
          (provider !== undefined && searchType === "web") ||
          serpApiConfigured(ctx),
        run: async (ctx) => {
          if (searchType === "news") {
            const data = (await serpApiFetch({
              engine: "google_news",
              q: effectiveQuery,
              api_key: await getSerpApiKey(ctx),
              num: numResults
            })) as Record<string, unknown>;
            const newsResults = (data.news_results ?? []) as Array<
              Record<string, unknown>
            >;
            return {
              success: true,
              results: keepRecords(
                newsResults.map((r) => ({
                  title: r.title ?? null,
                  link: r.link ?? null,
                  snippet: r.snippet ?? null,
                  date: r.date ?? null,
                  source: (r.source as Record<string, unknown>)?.name ?? null
                }))
              )
            };
          }
          if (searchType === "images") {
            const data = (await serpApiFetch({
              engine: "google_images",
              q: effectiveQuery,
              api_key: await getSerpApiKey(ctx),
              num: numResults
            })) as Record<string, unknown>;
            const imagesResults = (data.images_results ?? []) as Array<
              Record<string, unknown>
            >;
            return {
              success: true,
              results: keepRecords(
                imagesResults.map((r) => ({
                  title: r.title ?? null,
                  link: r.link ?? null,
                  original: r.original ?? null,
                  thumbnail: r.thumbnail ?? null
                }))
              )
            };
          }
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
        name: "dataforseo",
        requires: DATAFORSEO_REQUIRES,
        supports: new Set<SearchType>(["web", "news", "images"]),
        isConfigured: async (ctx) => {
          const { dataForSeoConfigured } =
            await import("../tools/dataseo-tools.js");
          return dataForSeoConfigured(ctx);
        },
        run: async (ctx) => {
          if (searchType === "news") {
            const { dataForSeoNews } = await import("../tools/dataseo-tools.js");
            const result = unwrapBackendResult(
              await dataForSeoNews(ctx, { keyword: effectiveQuery, num_results: numResults })
            );
            const items = (result.results ?? []) as Array<
              Record<string, unknown>
            >;
            return {
              success: true,
              results: keepRecords(
                items.map((r) => ({
                  title: r.title ?? null,
                  link: r.url ?? null,
                  snippet: r.snippet ?? null,
                  date: r.published_at ?? null,
                  source: r.source ?? null
                }))
              )
            };
          }
          if (searchType === "images") {
            const { dataForSeoImages } =
              await import("../tools/dataseo-tools.js");
            const result = unwrapBackendResult(
              await dataForSeoImages(ctx, { keyword: effectiveQuery, num_results: numResults })
            );
            const items = (result.results ?? []) as Array<
              Record<string, unknown>
            >;
            return {
              success: true,
              results: keepRecords(
                items.map((r) => ({
                  title: r.title ?? null,
                  link: r.source_url ?? null,
                  original: r.image_url ?? null,
                  thumbnail: null
                }))
              )
            };
          }
          const { dataForSeoSearch } =
            await import("../tools/dataseo-tools.js");
          const result = unwrapBackendResult(
            await dataForSeoSearch(ctx, {
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
      },
      serpFactoryBackend("brave", "BRAVE_API_KEY"),
      serpFactoryBackend("apify", "APIFY_API_TOKEN"),
      {
        name: "openai",
        requires: "OPENAI_API_KEY",
        supports: new Set<SearchType>(["web"]),
        isConfigured: async (ctx) => {
          const { openAiSearchConfigured } =
            await import("../tools/openai-tools.js");
          return openAiSearchConfigured(ctx);
        },
        run: async (ctx) => {
          const { openAiWebSearch } = await import("../tools/openai-tools.js");
          const result = unwrapBackendResult(
            await openAiWebSearch(ctx, { query: effectiveQuery })
          );
          return withSources(String(result.results ?? ""), result.sources);
        }
      },
      {
        name: "gemini",
        requires: "GEMINI_API_KEY",
        supports: new Set<SearchType>(["web"]),
        isConfigured: async (ctx) => {
          const { geminiSearchConfigured } =
            await import("../tools/google-tools.js");
          return geminiSearchConfigured(ctx);
        },
        run: async (ctx) => {
          const { googleGroundedSearch } =
            await import("../tools/google-tools.js");
          const result = unwrapBackendResult(
            await googleGroundedSearch(ctx, { query: effectiveQuery })
          );
          const text = Array.isArray(result.results)
            ? result.results.join("\n\n")
            : String(result.results ?? "");
          return withSources(text, result.sources);
        }
      }
    ];

    return runFirstConfiguredBackend(
      WEB_SEARCH_TOOL_NAME,
      context,
      backends,
      params.backend,
      searchType
    );
  };
}

const webSearch: CapabilityExport = {
  spec: webSearchSpec,
  impl: webSearchImpl()
};

// ---------------------------------------------------------------------------
// image_search
// ---------------------------------------------------------------------------

/**
 * Image search, split out from `web_search`'s `search_type` into its own
 * function. The routing, backend list, and result shape are unchanged — this
 * is `webSearchImpl` with `search_type` pinned to `"images"` — so a caller
 * gets its own name and schema without a second routing table to keep in
 * step with the first.
 */
export function imageSearchImpl(provider?: SerpProvider): CapabilityImpl {
  const search = webSearchImpl(provider);
  return (run: CapabilityRun, params: Record<string, unknown>) =>
    search(run, { ...params, search_type: "images" });
}

const imageSearch: CapabilityExport = {
  spec: imageSearchSpec,
  impl: imageSearchImpl()
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
  spec: browserSpec,
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
  spec: takeScreenshotSpec,
  impl: async (run, params) => {
    const context = run.context;
    const url = params.url as string | undefined;
    if (!url) {
      return { error: "URL is required for taking a screenshot" };
    }
    const outputFile = (params.output_file as string) ?? "screenshot.png";

    const browserUrl = process.env.BROWSER_URL;
    if (browserUrl) {
      try {
        // BROWSER_URL is operator-configured, not model-controlled, so it stays
        // a plain fetch (it is usually an internal service safeFetch would
        // block) — but it still has to observe the run's cancellation.
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

    let scheme: string;
    try {
      scheme = new URL(url).protocol;
    } catch {
      return { error: `Invalid URL: ${url}`, url };
    }
    if (scheme !== "http:" && scheme !== "https:") {
      return { error: `Only http and https URLs can be screenshotted: ${url}`, url };
    }
    // The URL comes from the model, so on a shared deployment it gets the same
    // SSRF policy safeFetch applies — a real browser would otherwise render the
    // host's metadata service and hand the picture back. A local install
    // trusts loopback already, and screenshotting the app on localhost is the
    // main reason to take one.
    if (isAuthEnforced() && !isSafePublicHttpsUrl(url)) {
      return {
        error: `Refusing to screenshot an unsafe URL (must be https to a public host): ${url}`,
        url
      };
    }

    try {
      const { captureScreenshot } = await import("./local-browser.js");
      const bytes = await captureScreenshot(url, {
        fullPage: params.full_page === true,
        timeoutMs: 30_000
      });
      const { persistBinaryOutput } = await import("../tools/binary-output.js");
      const persisted = await persistBinaryOutput(context, bytes, {
        outputFile,
        contentType: "image/png",
        uiPrefix: "screenshots"
      });
      return { success: true, url, file_size_bytes: bytes.byteLength, ...persisted };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      // chrome-launcher says "No Chrome installations found" — on its own that
      // reads like a NodeTool bug rather than a missing browser.
      const hint = /chrome installation/i.test(message)
        ? " Install Chrome, set CHROME_PATH to a Chromium binary, or set BROWSER_URL to a remote browser service."
        : "";
      return { error: `Error taking screenshot: ${message}${hint}`, url };
    }
  }
};

// ---------------------------------------------------------------------------
// download_file
// ---------------------------------------------------------------------------

/**
 * A ref NodeTool resolves itself, rather than a URL to fetch. `asset://` is a
 * stored identifier — on the cloud backends the bytes sit behind a signed URL
 * only the server can mint — so `safeFetch` can only ever refuse it, and did:
 * a session holding three generated clips was told they were "unsafe URLs" and
 * had no way to put them in the workspace at all.
 */
function isStoredRef(url: string): boolean {
  const value = url.trim();
  return (
    value.startsWith("asset://") ||
    value.startsWith("package://") ||
    value.startsWith("data:") ||
    value.startsWith("/api/storage/")
  );
}

/** Resolve a stored ref host-side and write the bytes into the workspace. */
async function copyStoredRef(
  context: ProcessingContext,
  url: string,
  outputFile: string
): Promise<Record<string, unknown>> {
  const ref = url.trim();
  let bytes: Uint8Array | null = null;
  try {
    bytes = await loadMediaRefBytes({ uri: ref }, context);
  } catch (e) {
    return {
      url: ref,
      output_file: outputFile,
      success: false,
      error: `Could not read ${ref}: ${e instanceof Error ? e.message : String(e)}`
    };
  }
  // Zero bytes is a failed read wearing a buffer — writing it would leave a
  // file that fails later, somewhere with less context than here.
  if (!bytes || bytes.byteLength === 0) {
    return {
      url: ref,
      output_file: outputFile,
      success: false,
      error: `${ref} resolved to no bytes.`
    };
  }
  const declared = /^data:([^;,]+)[;,]/.exec(ref)?.[1];
  const contentType =
    declared ?? mimeForPath(ref) ?? mimeForPath(outputFile) ?? "application/octet-stream";
  const { persistBinaryOutput } = await import("../tools/binary-output.js");
  const persisted = await persistBinaryOutput(context, bytes, {
    outputFile,
    contentType,
    uiPrefix: "downloads"
  });
  return {
    url: ref,
    success: true,
    content_type: contentType,
    file_size_bytes: bytes.byteLength,
    ...persisted
  };
}

const downloadFile: CapabilityExport = {
  spec: downloadFileSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const url = params["url"];
      const outputFile = params["output_file"];

      if (!isString(url) || !url) {
        return { error: "URL is required" };
      }
      if (!isString(outputFile) || !outputFile) {
        return { error: "Output file is required" };
      }

      if (isStoredRef(url)) {
        return await copyStoredRef(context, url, outputFile);
      }

      const customHeaders =
        isObjectLike(params["headers"])
          ? (params["headers"] as Record<string, string>)
          : {};
      const mergedHeaders = { ...DEFAULT_HEADERS, ...customHeaders };

      const timeoutMs =
        isNumber(params["timeout"])
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
  spec: httpRequestSpec,
  impl: async (run, params) => {
    const context = run.context;
    try {
      const url = params["url"];
      if (!isString(url) || !url) {
        return { error: "URL is required" };
      }

      const method = (
        isString(params["method"]) ? params["method"] : "GET"
      ).toUpperCase();

      const customHeaders =
        isObjectLike(params["headers"])
          ? (params["headers"] as Record<string, string>)
          : {};
      const mergedHeaders = { ...DEFAULT_HEADERS, ...customHeaders };

      const body =
        isString(params["body"]) ? params["body"] : undefined;

      const timeoutMs =
        isNumber(params["timeout"])
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
  imageSearch,
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
  imageSearch,
  browser,
  takeScreenshot,
  httpRequest,
  downloadFile
};
