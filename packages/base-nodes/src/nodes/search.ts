import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SERPAPI_BASE = "https://serpapi.com/search.json";

function getSerpApiKey(secrets: Record<string, string>): string {
  const key = secrets.SERPAPI_API_KEY || process.env.SERPAPI_API_KEY || "";
  if (!key) throw new Error("SERPAPI_API_KEY is required");
  return key;
}

async function serpRequest(
  apiKey: string,
  params: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const url = new URL(SERPAPI_BASE);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SerpAPI HTTP error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const meta = data.search_metadata as Record<string, unknown> | undefined;
  if (meta?.status === "Error" || typeof data.error === "string") {
    throw new Error(
      (data.error as string) ??
        `SerpAPI returned an error: ${JSON.stringify(data)}`
    );
  }
  return data;
}

/**
 * Format search results into human-readable text, matching the Python
 * `format_results` helper in `_base.py`.
 *
 * @param results - Array of result dicts from SerpAPI
 * @param fields  - Array of [key, label] tuples. If label is null the value
 *                  is printed raw; otherwise it is prefixed with "Label: ".
 */
function formatResults(
  results: Array<Record<string, unknown>>,
  fields: Array<[string, string | null]>
): string {
  const lines: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const pos = (r.position as number) ?? i + 1;
    const title = String(r.title ?? "Untitled");
    lines.push(`[${pos}] ${title}`);
    for (const [key, label] of fields) {
      const val = r[key];
      if (val) {
        if (label) {
          lines.push(`    ${label}: ${val}`);
        } else {
          lines.push(`    ${val}`);
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 1. GoogleSearch
// ---------------------------------------------------------------------------
export class GoogleSearchNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleSearch";
  static readonly title = "Google Search";
  static readonly description =
    "Search Google to retrieve organic search results from the web.\n    google, search, serp, web, query";
  static readonly metadataOutputTypes = {
    results: "list[organic_result]",
    text: "str"
  };
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Keyword",
    description: "Search query or keyword to search for"
  })
  declare keyword: any;

  @prop({
    type: "int",
    default: 10,
    title: "Num Results",
    description: "Maximum number of results to return"
  })
  declare num_results: any;

  async process(): Promise<Record<string, unknown>> {
    const keyword = String(this.keyword ?? "");
    if (!keyword) throw new Error("Keyword is required");
    const numResults = Number(this.num_results ?? 10);
    const apiKey = getSerpApiKey(this._secrets);

    const data = await serpRequest(apiKey, {
      engine: "google_light",
      q: keyword,
      num: numResults,
      gl: "us",
      hl: "en"
    });

    const results =
      (data.organic_results as Array<Record<string, unknown>>) ?? [];
    const text = formatResults(results, [
      ["link", null],
      ["date", "Date"],
      ["snippet", null]
    ]);
    return { results, text };
  }
}

// ---------------------------------------------------------------------------
// 2. GoogleNews
// ---------------------------------------------------------------------------
export class GoogleNewsNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleNews";
  static readonly title = "Google News";
  static readonly description =
    "Search Google News to retrieve current news articles and headlines.\n    google, news, serp, articles, journalism";
  static readonly metadataOutputTypes = {
    results: "list[news_result]",
    text: "str"
  };
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Keyword",
    description: "Search query or keyword for news articles"
  })
  declare keyword: any;

  @prop({
    type: "int",
    default: 10,
    title: "Num Results",
    description: "Maximum number of news results to return"
  })
  declare num_results: any;

  async process(): Promise<Record<string, unknown>> {
    const keyword = String(this.keyword ?? "");
    if (!keyword) throw new Error("Keyword is required");
    const numResults = Number(this.num_results ?? 10);
    const apiKey = getSerpApiKey(this._secrets);

    const data = await serpRequest(apiKey, {
      engine: "google_news",
      q: keyword,
      num: numResults,
      gl: "us",
      hl: "en"
    });

    const results =
      (data.news_results as Array<Record<string, unknown>>) ?? [];
    const text = formatResults(results, [
      ["link", null],
      ["date", "Date"]
    ]);
    return { results, text };
  }
}

// ---------------------------------------------------------------------------
// 3. GoogleImages
// ---------------------------------------------------------------------------
export class GoogleImagesNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleImages";
  static readonly title = "Google Images";
  static readonly description =
    "Search Google Images to find visual content or perform reverse image search.\n    google, images, serp, visual, reverse, search";
  static readonly metadataOutputTypes = {
    results: "list[image]"
  };
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Keyword",
    description: "Search query or keyword for images"
  })
  declare keyword: any;

  @prop({
    type: "str",
    default: "",
    title: "Image Url",
    description: "URL of image for reverse image search"
  })
  declare image_url: any;

  @prop({
    type: "int",
    default: 20,
    title: "Num Results",
    description: "Maximum number of image results to return"
  })
  declare num_results: any;

  async process(): Promise<Record<string, unknown>> {
    const keyword = String(this.keyword ?? "");
    const imageUrl = String(this.image_url ?? "");
    if (!keyword && !imageUrl)
      throw new Error("One of 'keyword' or 'image_url' is required.");
    const numResults = Number(this.num_results ?? 20);
    const apiKey = getSerpApiKey(this._secrets);

    const params: Record<string, string | number> = {
      num: numResults,
      gl: "us",
      hl: "en"
    };

    if (imageUrl) {
      params.engine = "google_reverse_image";
      params.image_url = imageUrl;
    } else {
      params.engine = "google_images";
      params.q = keyword;
    }

    const data = await serpRequest(apiKey, params);

    const images =
      (data.images_results as Array<Record<string, unknown>>) ?? [];
    const results = images.map((img) => ({
      uri: String(img.original ?? "")
    }));
    return { results };
  }
}

// ---------------------------------------------------------------------------
// 4. GoogleFinance
// ---------------------------------------------------------------------------
export class GoogleFinanceNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleFinance";
  static readonly title = "Google Finance";
  static readonly description =
    "Retrieve financial market data and stock information from Google Finance.\n    google, finance, stocks, market, serp, trading";
  static readonly metadataOutputTypes = {
    results: "dict[str, any]"
  };
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "Stock symbol or company name to search for"
  })
  declare query: any;

  @prop({
    type: "str",
    default: "",
    title: "Window",
    description:
      "Time window for financial data (e.g., '1d', '5d', '1m', '3m', '6m', '1y', '5y')"
  })
  declare window: any;

  async process(): Promise<Record<string, unknown>> {
    const query = String(this.query ?? "");
    if (!query)
      throw new Error("Query is required for Google Finance search.");
    const window = String(this.window ?? "");
    const apiKey = getSerpApiKey(this._secrets);

    const params: Record<string, string | number> = {
      engine: "google_finance",
      q: query,
      gl: "us",
      hl: "en"
    };
    if (window) params.window = window;

    const data = await serpRequest(apiKey, params);
    return { results: data };
  }
}

// ---------------------------------------------------------------------------
// 5. GoogleJobs
// ---------------------------------------------------------------------------
export class GoogleJobsNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleJobs";
  static readonly title = "Google Jobs";
  static readonly description =
    "Search Google Jobs for employment opportunities and job listings.\n    google, jobs, employment, careers, serp, hiring";
  static readonly metadataOutputTypes = {
    results: "list[job_result]",
    text: "str"
  };
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "Job title, skills, or company name to search for"
  })
  declare query: any;

  @prop({
    type: "str",
    default: "",
    title: "Location",
    description: "Geographic location for job search"
  })
  declare location: any;

  @prop({
    type: "int",
    default: 10,
    title: "Num Results",
    description: "Maximum number of job results to return"
  })
  declare num_results: any;

  async process(): Promise<Record<string, unknown>> {
    const query = String(this.query ?? "");
    if (!query) throw new Error("Query is required for Google Jobs search.");
    const location = String(this.location ?? "");
    const apiKey = getSerpApiKey(this._secrets);

    const params: Record<string, string | number> = {
      engine: "google_jobs",
      q: query,
      gl: "us",
      hl: "en"
    };
    if (location) params.location = location;

    const data = await serpRequest(apiKey, params);
    const results =
      (data.jobs_results as Array<Record<string, unknown>>) ?? [];
    const text = formatResults(results, [
      ["company_name", "Company"],
      ["location", "Location"],
      ["via", "Via"],
      ["extensions", "Details"]
    ]);
    return { results, text };
  }
}

// ---------------------------------------------------------------------------
// 6. GoogleLens
// ---------------------------------------------------------------------------
export class GoogleLensNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleLens";
  static readonly title = "Google Lens";
  static readonly description =
    "Analyze images using Google Lens to find visual matches and related content.\n    google, lens, visual, image, search, serp, identify";
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Image Url",
    description: "URL of the image to analyze with Google Lens"
  })
  declare image_url: any;

  @prop({
    type: "int",
    default: 10,
    title: "Num Results",
    description: "Maximum number of visual search results to return"
  })
  declare num_results: any;

  async process(): Promise<Record<string, unknown>> {
    const imageUrl = String(this.image_url ?? "");
    if (!imageUrl)
      throw new Error("Image URL is required for Google Lens search.");
    const apiKey = getSerpApiKey(this._secrets);

    const data = await serpRequest(apiKey, {
      engine: "google_lens",
      url: imageUrl,
      hl: "en"
    });

    const matches =
      (data.visual_matches as Array<Record<string, unknown>>) ?? [];
    const images = matches.map((m) => ({
      uri: String(m.image ?? m.thumbnail ?? "")
    }));
    return { results: matches, images };
  }
}

// ---------------------------------------------------------------------------
// 7. GoogleMaps
// ---------------------------------------------------------------------------
export class GoogleMapsNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleMaps";
  static readonly title = "Google Maps";
  static readonly description =
    "Search Google Maps for places, businesses, and get location details.\n    google, maps, places, locations, serp, geography";
  static readonly metadataOutputTypes = {
    results: "list[local_result]",
    text: "str"
  };
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "Place name, address, or location query"
  })
  declare query: any;

  @prop({
    type: "int",
    default: 10,
    title: "Num Results",
    description: "Maximum number of map results to return"
  })
  declare num_results: any;

  async process(): Promise<Record<string, unknown>> {
    const query = String(this.query ?? "");
    if (!query) throw new Error("Query is required for map search.");
    const apiKey = getSerpApiKey(this._secrets);

    const data = await serpRequest(apiKey, {
      engine: "google_maps",
      q: query,
      type: "search",
      gl: "us",
      hl: "en"
    });

    const localResults =
      (data.local_results as Array<Record<string, unknown>>) ?? [];
    // Rename "type" -> "place_type" to match Python model
    const results = localResults.map((r) => {
      const { type: placeType, ...rest } = r;
      return { ...rest, place_type: placeType ?? "" };
    });

    // Custom text format matching Python implementation
    const lines: string[] = [];
    for (let i = 0; i < localResults.length; i++) {
      const r = localResults[i];
      const pos = (r.position as number) ?? i + 1;
      lines.push(`[${pos}] ${String(r.title ?? "Untitled")}`);
      if (r.address) lines.push(`    ${r.address}`);
      if (r.rating != null) {
        let ratingStr = `    Rating: ${r.rating}`;
        if (r.reviews != null) ratingStr += ` (${r.reviews} reviews)`;
        lines.push(ratingStr);
      }
      if (r.price) lines.push(`    Price: ${r.price}`);
      if (r.open_state) lines.push(`    ${r.open_state}`);
      lines.push("");
    }
    const text = lines.join("\n");

    return { results, text };
  }
}

// ---------------------------------------------------------------------------
// 8. GoogleShopping
// ---------------------------------------------------------------------------
export class GoogleShoppingNode extends BaseNode {
  static readonly nodeType = "search.google.GoogleShopping";
  static readonly title = "Google Shopping";
  static readonly description =
    "Search Google Shopping for products with filters and pricing information.\n    google, shopping, products, ecommerce, serp, prices";
  static readonly metadataOutputTypes = {
    results: "list[shopping_result]",
    text: "str"
  };
  static readonly requiredSettings = ["SERPAPI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "Product name or description to search for"
  })
  declare query: any;

  @prop({
    type: "str",
    default: "us",
    title: "Country",
    description: "Country code for shopping search (e.g., 'us', 'uk', 'ca')"
  })
  declare country: any;

  @prop({
    type: "int",
    default: 0,
    title: "Min Price",
    description: "Minimum price filter for products"
  })
  declare min_price: any;

  @prop({
    type: "int",
    default: 0,
    title: "Max Price",
    description: "Maximum price filter for products"
  })
  declare max_price: any;

  @prop({
    type: "str",
    default: "",
    title: "Condition",
    description: "Product condition filter (e.g., 'new', 'used', 'refurbished')"
  })
  declare condition: any;

  @prop({
    type: "str",
    default: "",
    title: "Sort By",
    description:
      "Sort order for results (e.g., 'price_low_to_high', 'price_high_to_low', 'review_score')"
  })
  declare sort_by: any;

  @prop({
    type: "int",
    default: 10,
    title: "Num Results",
    description: "Maximum number of shopping results to return"
  })
  declare num_results: any;

  async process(): Promise<Record<string, unknown>> {
    const query = String(this.query ?? "");
    if (!query)
      throw new Error("Query is required for Google Shopping search.");
    const country = String(this.country ?? "us") || "us";
    const minPrice = Number(this.min_price ?? 0);
    const maxPrice = Number(this.max_price ?? 0);
    const condition = String(this.condition ?? "");
    const sortBy = String(this.sort_by ?? "");
    const apiKey = getSerpApiKey(this._secrets);

    const params: Record<string, string | number> = {
      engine: "google_shopping",
      q: query,
      gl: country,
      hl: "en"
    };

    // Build tbs filter string
    const tbsParts: string[] = [];
    if (minPrice > 0) {
      if (!tbsParts.includes("mr:1")) tbsParts.push("mr:1");
      if (!tbsParts.includes("price:1")) tbsParts.push("price:1");
      tbsParts.push(`ppr_min:${minPrice}`);
    }
    if (maxPrice > 0) {
      if (!tbsParts.includes("mr:1")) tbsParts.push("mr:1");
      if (!tbsParts.includes("price:1")) tbsParts.push("price:1");
      tbsParts.push(`ppr_max:${maxPrice}`);
    }
    if (condition) {
      const c = condition.toLowerCase();
      if (c === "new") tbsParts.push("p_cond:new");
      else if (c === "used" || c === "refurbished")
        tbsParts.push("p_cond:used");
    }
    if (sortBy) {
      tbsParts.push(`sort:${sortBy}`);
    }
    if (tbsParts.length > 0) {
      params.tbs = tbsParts.join(",");
    }

    const data = await serpRequest(apiKey, params);
    const results =
      (data.shopping_results as Array<Record<string, unknown>>) ?? [];

    // Custom text format matching Python implementation
    const lines: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const pos = (r.position as number) ?? i + 1;
      lines.push(`[${pos}] ${String(r.title ?? "Untitled")}`);
      if (r.price) {
        let priceStr = `    Price: ${r.price}`;
        if (r.old_price) priceStr += ` (was ${r.old_price})`;
        lines.push(priceStr);
      }
      if (r.source) lines.push(`    Source: ${r.source}`);
      if (r.link) lines.push(`    ${r.link}`);
      if (r.rating != null) lines.push(`    Rating: ${r.rating}`);
      lines.push("");
    }
    const text = lines.join("\n");

    return { results, text };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const SEARCH_NODES: readonly NodeClass[] = [
  GoogleSearchNode,
  GoogleNewsNode,
  GoogleImagesNode,
  GoogleFinanceNode,
  GoogleJobsNode,
  GoogleLensNode,
  GoogleMapsNode,
  GoogleShoppingNode
];
