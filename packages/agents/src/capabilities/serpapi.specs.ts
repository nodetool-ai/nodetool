/**
 * The `serpapi` module's specs — data only, no implementation.
 *
 * Split out for the reason every module splits: the registry's eager spec table
 * imports this file and never `serpapi.ts`, so the client and the catalog
 * parser stay out of the entry graph until something calls them.
 *
 * The descriptions carry the discovery order, because that is the whole design:
 * SerpAPI is one endpoint with ~120 engine contracts behind it, so the model is
 * told to list, read the schema, then search — not to guess parameter names for
 * an engine it has never seen. A guessed parameter is not an error on SerpAPI's
 * side; it is a billed search that answers the wrong question.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";

import type { CapabilitySpec } from "./types.js";

const ENGINE_FIELD = {
  type: "string" as const,
  description:
    'SerpAPI engine id, e.g. "google", "google_scholar", "youtube", ' +
    '"amazon", "google_maps". Find one with list_serpapi_engines rather than ' +
    "guessing — an id SerpAPI does not ship fails the call."
};

export const LIST_SERPAPI_ENGINES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        'Filter engines by id or name, e.g. "scholar", "maps", "shopping". ' +
        "Omit to list every engine this SerpAPI account can call."
    },
    limit: {
      type: "integer",
      description: "How many engines to return.",
      default: 50,
      maximum: 200
    }
  }
};

export const listSerpApiEnginesSpec: CapabilitySpec = {
  name: "list_serpapi_engines",
  description:
    "List the search engines SerpAPI exposes — Google and its verticals " +
    "(news, images, scholar, maps, jobs, flights, hotels, trends, lens, " +
    "shopping), Bing, Baidu, DuckDuckGo, Yandex, Naver, YouTube, Amazon, " +
    "eBay, Walmart, Home Depot, Yelp, TripAdvisor, the app stores, and more. " +
    "The list is read from SerpAPI itself, so it is whatever SerpAPI ships " +
    "today, not a hard-coded set. Each entry names the engine id and its " +
    "required parameters. Start here, then read one engine's full contract " +
    "with get_serpapi_engine_schema before calling serpapi_search.",
  inputSchema: LIST_SERPAPI_ENGINES_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const query = params.query;
    return typeof query === "string" && query.length > 0
      ? `Listing SerpAPI engines matching '${query}'`
      : "Listing SerpAPI engines";
  }
};

export const getSerpApiEngineSchemaSpec: CapabilitySpec = {
  name: "get_serpapi_engine_schema",
  description:
    "Read one engine's full parameter contract — every parameter, its " +
    "meaning, whether it is required, its type, and its allowed values — " +
    "read from SerpAPI's own machine-readable engine table. Call this before " +
    "searching any engine whose parameters you do not already know: a wrong " +
    "parameter name is not rejected by SerpAPI, it is ignored, and the search " +
    "is billed for results that answer a different question.",
  inputSchema: {
    type: "object",
    properties: {
      engine: ENGINE_FIELD,
      include_hidden: {
        type: "boolean",
        description:
          "Include parameters SerpAPI does not show in its playground. They " +
          "are still accepted by the API.",
        default: false
      }
    },
    required: ["engine"]
  },
  category: "read",
  userMessage: (params) =>
    `Reading the SerpAPI schema for ${String(params.engine ?? "an engine")}`
};

export const SERPAPI_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    engine: ENGINE_FIELD,
    params: {
      type: "object",
      description:
        "The engine's own parameters, spelled as its schema spells them — " +
        '`{"q": "…"}` for most, but `google_scholar_author` wants ' +
        "`author_id`, `google_maps` wants `ll`, and so on. Checked against " +
        "the engine's contract before the call, so an unknown or missing " +
        "parameter comes back as a message instead of a billed search.",
      additionalProperties: true
    },
    fields: {
      type: "array",
      items: { type: "string" },
      description:
        'Return only these top-level result keys, e.g. ["organic_results"]. ' +
        "Everything else is named in `omitted` rather than sent. Omit to get " +
        "every key the engine returned."
    },
    max_items: {
      type: "integer",
      description:
        "Cap the entries returned per result array. The count cut is " +
        "reported per key.",
      default: 10,
      maximum: 100
    }
  },
  required: ["engine", "params"]
};

export const serpApiSearchSpec: CapabilitySpec = {
  name: "serpapi_search",
  description:
    "Run one search on any SerpAPI engine and get its structured results. " +
    "This is the general surface: anything SerpAPI can answer — a Google " +
    "results page, a scholar citation, a maps listing, a product page, a " +
    "video, a job posting, a flight — is this call with a different `engine` " +
    "and parameters. Use web_search for a plain web query; use this when the " +
    "answer needs a specific engine, a vertical, or fields a plain search " +
    "does not return. Each call spends one search from the account's quota " +
    "(see get_serpapi_account).",
  inputSchema: SERPAPI_SEARCH_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const engine = String(params.engine ?? "serpapi");
    const bag = params.params;
    const query =
      typeof bag === "object" && bag !== null && "q" in bag
        ? String((bag as Record<string, unknown>).q)
        : undefined;
    const message =
      query === undefined
        ? `Searching ${engine}`
        : `Searching ${engine} for '${query}'`;
    return message.length > 80 ? `Searching ${engine}` : message;
  }
};

export const getSerpApiAccountSpec: CapabilitySpec = {
  name: "get_serpapi_account",
  description:
    "Read the SerpAPI account's plan and how many searches are left this " +
    "month. Use it before a batch of searches, so a plan that is nearly " +
    "spent is a decision rather than a surprise mid-run.",
  inputSchema: { type: "object", properties: {} },
  category: "read",
  userMessage: () => "Reading the SerpAPI account"
};

export const getSerpApiLocationsSpec: CapabilitySpec = {
  name: "get_serpapi_locations",
  description:
    "Resolve a place name to the canonical values SerpAPI's `location` " +
    "parameter accepts. A guessed location string does not fail — it returns " +
    "results for somewhere else — so look it up before setting `location` on " +
    "any engine whose schema has one.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: 'Place name to resolve, e.g. "Austin" or "Bavaria".'
      },
      limit: {
        type: "integer",
        description: "How many matches to return.",
        default: 10,
        maximum: 50
      }
    },
    required: ["query"]
  },
  category: "read",
  userMessage: (params) =>
    `Resolving SerpAPI locations for '${String(params.query ?? "")}'`
};

export const serpApiSpecs: readonly CapabilitySpec[] = [
  listSerpApiEnginesSpec,
  getSerpApiEngineSchemaSpec,
  serpApiSearchSpec,
  getSerpApiAccountSpec,
  getSerpApiLocationsSpec
];
