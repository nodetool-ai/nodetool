/**
 * DataForSEO search tools.
 *
 * Port of:
 *  - src/nodetool/agents/serp_providers/data_for_seo_provider.py
 *  - DataForSEO-specific tools from src/nodetool/agents/tools/serp_tools.py
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";
import type { SerpProvider } from "./serp-providers/index.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const API_BASE = "https://api.dataforseo.com";
const DEFAULT_LOCATION_CODE = 2840; // United States
const DEFAULT_LANGUAGE_CODE = "en";

async function getDataForSEOCredentials(
  context: ProcessingContext,
): Promise<{ login: string; password: string }> {
  const login =
    (await context.getSecret("DATA_FOR_SEO_LOGIN")) ??
    process.env.DATA_FOR_SEO_LOGIN;
  const password =
    (await context.getSecret("DATA_FOR_SEO_PASSWORD")) ??
    process.env.DATA_FOR_SEO_PASSWORD;

  if (!login || !password) {
    throw new Error(
      "DataForSEO credentials (DATA_FOR_SEO_LOGIN, DATA_FOR_SEO_PASSWORD) not found.",
    );
  }
  return { login, password };
}

function makeAuthHeader(login: string, password: string): string {
  const encoded = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${encoded}`;
}

/** Strip base64-encoded images from result objects to keep payloads small. */
function removeBase64Images(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(removeBase64Images);
  }
  if (data !== null && typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === "string" && v.startsWith("data:image/")) continue;
      out[k] = removeBase64Images(v);
    }
    return out;
  }
  return data;
}

interface DataForSEOResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    result?: Array<{
      items?: Array<Record<string, unknown>>;
    }>;
  }>;
}

async function dataForSEORequest(
  endpoint: string,
  payload: Record<string, unknown>[],
  auth: string,
): Promise<DataForSEOResponse | { error: string; details?: unknown }> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let details: unknown;
      try {
        details = await res.json();
      } catch {
        details = await res.text();
      }
      return {
        error: `HTTP error occurred: ${res.status} - ${res.statusText}`,
        details,
      };
    }
    return (await res.json()) as DataForSEOResponse;
  } catch (e: unknown) {
    return { error: `DataForSEO request failed: ${(e as Error).message}` };
  }
}

function extractItems(
  result: DataForSEOResponse | { error: string },
): Array<Record<string, unknown>> | { error: string; details?: unknown } {
  if ("error" in result) return result as { error: string; details?: unknown };

  if (result.status_code !== 20000 || result.status_message !== "Ok.") {
    return {
      error: `DataForSEO API Error: ${result.status_code} - ${result.status_message}`,
      details: result,
    };
  }

  const taskResult = result.tasks?.[0]?.result;
  if (taskResult && Array.isArray(taskResult) && taskResult.length > 0) {
    return taskResult[0].items ?? [];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  DataForSEOSearchTool                                              */
/* ------------------------------------------------------------------ */

export class DataForSEOSearchTool extends Tool {
  readonly name = "dataforseo_search";
  readonly description =
    "Search Google via DataForSEO to retrieve organic search results.";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "The keyword to search for.",
      },
      num_results: {
        type: "integer",
        description: "Number of results to retrieve.",
        default: 10,
      },
    },
    required: ["keyword"],
  };

  private _provider?: SerpProvider;

  constructor(provider?: SerpProvider) {
    super();
    this._provider = provider;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const keyword = params.keyword as string | undefined;
    if (!keyword) return { error: "keyword is required" };
    const numResults = (params.num_results as number) ?? 10;

    let creds: { login: string; password: string };
    try {
      creds = await getDataForSEOCredentials(context);
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
    const auth = makeAuthHeader(creds.login, creds.password);

    const payload = [
      {
        keyword,
        location_code: DEFAULT_LOCATION_CODE,
        language_code: DEFAULT_LANGUAGE_CODE,
        device: "desktop",
        os: "windows",
        depth: numResults,
      },
    ];

    const result = await dataForSEORequest(
      "/v3/serp/google/organic/live/advanced",
      payload,
      auth,
    );
    const items = extractItems(result);
    if (!Array.isArray(items)) return items;

    const organicResults = items
      .filter((item) => item.type === "organic")
      .map((item) => ({
        title: item.title ?? null,
        url: item.url ?? null,
        snippet: item.description ?? null,
        position: item.rank_absolute ?? null,
        type: "organic",
      }));

    return { success: true, results: removeBase64Images(organicResults) };
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = (params.keyword as string) ?? "something";
    const msg = `Searching Google (DataForSEO) for '${keyword}'...`;
    return msg.length > 80 ? "Searching Google (DataForSEO)..." : msg;
  }
}

/* ------------------------------------------------------------------ */
/*  DataForSEONewsTool                                                */
/* ------------------------------------------------------------------ */

export class DataForSEONewsTool extends Tool {
  readonly name = "dataforseo_news";
  readonly description =
    "Search Google News via DataForSEO to retrieve live news articles.";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "The keyword to search for in Google News.",
      },
      num_results: {
        type: "integer",
        description: "Number of news results to retrieve.",
        default: 10,
      },
    },
    required: ["keyword"],
  };

  private _provider?: SerpProvider;

  constructor(provider?: SerpProvider) {
    super();
    this._provider = provider;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const keyword = params.keyword as string | undefined;
    if (!keyword) return { error: "keyword is required" };
    const numResults = (params.num_results as number) ?? 10;

    let creds: { login: string; password: string };
    try {
      creds = await getDataForSEOCredentials(context);
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
    const auth = makeAuthHeader(creds.login, creds.password);

    const payload = [
      {
        keyword,
        location_code: DEFAULT_LOCATION_CODE,
        language_code: DEFAULT_LANGUAGE_CODE,
        sort_by: "relevance",
        depth: numResults,
      },
    ];

    const result = await dataForSEORequest(
      "/v3/serp/google/news/live/advanced",
      payload,
      auth,
    );
    const items = extractItems(result);
    if (!Array.isArray(items)) return items;

    const newsResults = items
      .filter(
        (item) => item.type === "news_search" || item.type === "top_stories",
      )
      .map((item) => {
        const timestamp = item.timestamp as string | undefined;
        const publishedAt = timestamp ? timestamp.split(" ")[0] : null;
        return {
          title: item.title ?? null,
          url: item.url ?? null,
          source: item.source ?? null,
          published_at: publishedAt,
          snippet: item.description ?? null,
          type: "news",
        };
      });

    return { success: true, results: removeBase64Images(newsResults) };
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = (params.keyword as string) ?? "something";
    const msg = `Searching Google News (DataForSEO) for '${keyword}'...`;
    return msg.length > 80 ? "Searching Google News (DataForSEO)..." : msg;
  }
}

/* ------------------------------------------------------------------ */
/*  DataForSEOImagesTool                                              */
/* ------------------------------------------------------------------ */

export class DataForSEOImagesTool extends Tool {
  readonly name = "dataforseo_images";
  readonly description =
    "Search Google Images via DataForSEO to retrieve image results.";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description:
          "Keyword for image search. (Optional if image_url is provided)",
      },
      image_url: {
        type: "string",
        description:
          "URL of an image for reverse search. (Optional if keyword is provided)",
      },
      num_results: {
        type: "integer",
        description: "Number of image results to retrieve.",
        default: 20,
      },
    },
  };

  private _provider?: SerpProvider;

  constructor(provider?: SerpProvider) {
    super();
    this._provider = provider;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const keyword = params.keyword as string | undefined;
    const imageUrl = params.image_url as string | undefined;
    const numResults = (params.num_results as number) ?? 20;

    if (!keyword && !imageUrl) {
      return {
        error: "One of 'keyword' or 'image_url' is required for image search.",
      };
    }

    let creds: { login: string; password: string };
    try {
      creds = await getDataForSEOCredentials(context);
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
    const auth = makeAuthHeader(creds.login, creds.password);

    const payloadDict: Record<string, unknown> = {
      location_code: DEFAULT_LOCATION_CODE,
      language_code: DEFAULT_LANGUAGE_CODE,
      depth: numResults,
    };
    if (keyword) payloadDict.keyword = keyword;
    if (imageUrl) payloadDict.image_url = imageUrl;

    const result = await dataForSEORequest(
      "/v3/serp/google/images/live/advanced",
      [payloadDict],
      auth,
    );
    const items = extractItems(result);
    if (!Array.isArray(items)) return items;

    const imageResults: Array<Record<string, unknown>> = [];
    for (const item of items) {
      if (item.type === "images_search") {
        imageResults.push({
          title: item.title ?? null,
          image_url: item.image_url ?? null,
          source_url: item.source_url ?? null,
          alt_text: item.alt ?? null,
          type: "image",
        });
      } else if (
        item.type === "carousel" &&
        Array.isArray(item.items)
      ) {
        for (const ci of item.items as Array<Record<string, unknown>>) {
          if (ci.type === "carousel_element" && ci.image_url) {
            imageResults.push({
              title: ci.title ?? null,
              image_url: ci.image_url ?? null,
              source_url: ci.url ?? null,
              alt_text: ci.title ?? null,
              type: "image_carousel_element",
            });
          }
        }
      }
    }

    return { success: true, results: removeBase64Images(imageResults) };
  }

  userMessage(params: Record<string, unknown>): string {
    const keyword = params.keyword as string | undefined;
    if (keyword) {
      const msg = `Searching Google Images (DataForSEO) for '${keyword}'...`;
      return msg.length > 80 ? "Searching Google Images (DataForSEO)..." : msg;
    }
    return "Searching Google Images (DataForSEO)...";
  }
}
