/**
 * Web search tools using the SerpAPI service.
 *
 * Port of src/nodetool/agents/tools/serp_tools.py (GoogleSearchTool,
 * GoogleNewsTool, GoogleImagesTool).
 *
 * Internally delegates to the SerpApiProvider abstraction when available.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
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
/*  GoogleSearchTool                                                  */
/* ------------------------------------------------------------------ */

export class GoogleSearchTool extends Tool {
  readonly name = "google_search";
  readonly description =
    "Search Google to retrieve organic search results via SerpAPI.";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "The keyword to search for."
      },
      num_results: {
        type: "integer",
        description: "Number of results to retrieve.",
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

    const numResults = (params.num_results as number) ?? 10;

    if (this._provider) {
      const results = await this._provider.search(keyword, { numResults });
      return {
        success: true,
        results: results.map((r) => ({
          title: r.title ?? null,
          link: r.url ?? null,
          snippet: r.snippet ?? null
        }))
      };
    }

    // Legacy direct API call path
    const apiKey = await getSerpApiKey(context);

    const data = (await serpApiFetch({
      engine: "google",
      q: keyword,
      api_key: apiKey,
      num: numResults
    })) as Record<string, unknown>;

    const organicResults = (data.organic_results ?? []) as Array<
      Record<string, unknown>
    >;

    const results = organicResults.map((r) => ({
      title: r.title ?? null,
      link: r.link ?? null,
      snippet: r.snippet ?? null
    }));

    return { success: true, results };
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = (params.keyword as string) ?? "something";
    const msg = `Searching Google for '${keyword}'...`;
    return msg.length > 80 ? "Searching Google..." : msg;
  }
}

/* ------------------------------------------------------------------ */
/*  GoogleNewsTool                                                    */
/* ------------------------------------------------------------------ */

export class GoogleNewsTool extends Tool {
  readonly name = "google_news";
  readonly description =
    "Search Google News to retrieve live news articles via SerpAPI.";
  readonly inputSchema: Record<string, unknown> = {
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
  readonly inputSchema: Record<string, unknown> = {
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
