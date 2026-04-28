/**
 * Search tool — web search over a configurable provider.
 *
 * Provider is selected via NODETOOL_SEARCH_PROVIDER env var. Each provider
 * reads its own API key from env:
 *   - tavily  : TAVILY_API_KEY
 *   - brave   : BRAVE_API_KEY
 *   - serper  : SERPER_API_KEY
 *
 * All providers normalize to the shared SearchResult shape.
 */

import type {
  InfoSearchWebInput,
  InfoSearchWebOutput,
  SearchResult,
  SearchDateRange
} from "@nodetool/sandbox/schemas";

export type SearchProvider = "tavily" | "brave" | "serper" | "mock";

export interface SearchProviderFn {
  (query: string, opts: {
    count: number;
    dateRange: SearchDateRange;
  }): Promise<SearchResult[]>;
}

interface Env {
  provider: SearchProvider;
  tavilyKey?: string;
  braveKey?: string;
  serperKey?: string;
}

function readEnv(): Env {
  const rawProvider = (process.env.NODETOOL_SEARCH_PROVIDER ?? "").toLowerCase();
  const provider: SearchProvider =
    rawProvider === "brave" ||
    rawProvider === "serper" ||
    rawProvider === "tavily" ||
    rawProvider === "mock"
      ? rawProvider
      : "tavily";
  return {
    provider,
    tavilyKey: process.env.TAVILY_API_KEY,
    braveKey: process.env.BRAVE_API_KEY,
    serperKey: process.env.SERPER_API_KEY
  };
}

/** Test hook: injected fetch + provider override. */
export interface SearchOverride {
  fetch?: typeof fetch;
  provider?: SearchProvider;
  providers?: Partial<Record<SearchProvider, SearchProviderFn>>;
}

let override: SearchOverride | null = null;
export function setSearchOverride(o: SearchOverride | null): void {
  override = o;
}

export async function infoSearchWeb(
  input: InfoSearchWebInput
): Promise<InfoSearchWebOutput> {
  const env = readEnv();
  const provider = override?.provider ?? env.provider;
  const count = input.count ?? 10;
  const dateRange = input.date_range ?? "any";
  const f = override?.fetch ?? globalThis.fetch;

  const custom = override?.providers?.[provider];
  let results: SearchResult[];
  if (custom) {
    results = await custom(input.query, { count, dateRange });
  } else {
    switch (provider) {
      case "tavily":
        results = await tavilySearch(f, env.tavilyKey, input.query, count, dateRange);
        break;
      case "brave":
        results = await braveSearch(f, env.braveKey, input.query, count, dateRange);
        break;
      case "serper":
        results = await serperSearch(f, env.serperKey, input.query, count, dateRange);
        break;
      case "mock":
        results = [];
        break;
    }
  }

  return { provider, query: input.query, results };
}

// ---- provider implementations --------------------------------------------

async function tavilySearch(
  f: typeof fetch,
  key: string | undefined,
  query: string,
  count: number,
  dateRange: SearchDateRange
): Promise<SearchResult[]> {
  if (!key) throw new Error("TAVILY_API_KEY not set");
  const body: Record<string, unknown> = {
    api_key: key,
    query,
    max_results: count,
    include_answer: false,
    search_depth: "basic"
  };
  if (dateRange !== "any") {
    body.days = dateRangeToDays(dateRange);
  }
  const res = await f("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`tavily ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      published_date?: string;
    }>;
  };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content ?? "",
    published_at: r.published_date ?? null
  }));
}

async function braveSearch(
  f: typeof fetch,
  key: string | undefined,
  query: string,
  count: number,
  dateRange: SearchDateRange
): Promise<SearchResult[]> {
  if (!key) throw new Error("BRAVE_API_KEY not set");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  if (dateRange !== "any") {
    url.searchParams.set("freshness", braveFreshness(dateRange));
  }
  const res = await f(url.toString(), {
    headers: {
      accept: "application/json",
      "X-Subscription-Token": key
    }
  });
  if (!res.ok) throw new Error(`brave ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    web?: {
      results?: Array<{
        title?: string;
        url?: string;
        description?: string;
        page_age?: string;
      }>;
    };
  };
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
    published_at: r.page_age ?? null
  }));
}

async function serperSearch(
  f: typeof fetch,
  key: string | undefined,
  query: string,
  count: number,
  dateRange: SearchDateRange
): Promise<SearchResult[]> {
  if (!key) throw new Error("SERPER_API_KEY not set");
  const body: Record<string, unknown> = { q: query, num: count };
  if (dateRange !== "any") {
    body.tbs = serperTbs(dateRange);
  }
  const res = await f("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`serper ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    organic?: Array<{
      title?: string;
      link?: string;
      snippet?: string;
      date?: string;
    }>;
  };
  return (data.organic ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: r.snippet ?? "",
    published_at: r.date ?? null
  }));
}

function dateRangeToDays(d: SearchDateRange): number {
  switch (d) {
    case "past_day":
      return 1;
    case "past_week":
      return 7;
    case "past_month":
      return 30;
    case "past_year":
      return 365;
    default:
      return 0;
  }
}

function braveFreshness(d: SearchDateRange): string {
  switch (d) {
    case "past_day":
      return "pd";
    case "past_week":
      return "pw";
    case "past_month":
      return "pm";
    case "past_year":
      return "py";
    default:
      return "";
  }
}

function serperTbs(d: SearchDateRange): string {
  switch (d) {
    case "past_day":
      return "qdr:d";
    case "past_week":
      return "qdr:w";
    case "past_month":
      return "qdr:m";
    case "past_year":
      return "qdr:y";
    default:
      return "";
  }
}
