import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

// Constants
const DEFAULT_PAGE_FUNCTION =
  "async function pageFunction(context) { return context.request.loadedUrl; }";
const MIN_RESULTS_PER_PAGE = 10;
const MAX_RESULTS_PER_PAGE = 100;

const APIFY_API_BASE = "https://api.apify.com/v2";

function getApifyApiKey(inputs: Record<string, unknown>): string {
  const key =
    (inputs._secrets as Record<string, string>)?.APIFY_API_KEY ||
    process.env.APIFY_API_KEY;
  if (!key) throw new Error("APIFY_API_KEY not configured");
  return key;
}

interface ApifyRun {
  data?: {
    id?: string;
    defaultDatasetId?: string;
    status?: string;
  };
}

async function runActor(
  apiKey: string,
  actorId: string,
  input: Record<string, unknown>,
  waitSecs: number
): Promise<Record<string, unknown>[]> {
  const encodedActorId = actorId.replace("/", "~");
  const url = `${APIFY_API_BASE}/acts/${encodedActorId}/runs?waitForFinish=${waitSecs}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify API error (${response.status}): ${text}`);
  }

  const run = (await response.json()) as ApifyRun;
  const datasetId = run.data?.defaultDatasetId;
  if (!datasetId) return [];

  const datasetUrl = `${APIFY_API_BASE}/datasets/${datasetId}/items?format=json`;
  const datasetResponse = await fetch(datasetUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!datasetResponse.ok) return [];
  return (await datasetResponse.json()) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// 1. ApifyWebScraper
// ---------------------------------------------------------------------------
export class ApifyWebScraperNode extends BaseNode {
  static readonly nodeType = "apify.scraping.ApifyWebScraper";
            static readonly title = "Apify Web Scraper";
            static readonly description = "Scrape websites using Apify's Web Scraper actor.\n    Extracts data from web pages using CSS selectors or custom JavaScript.\n    apify, scraping, web, data, extraction, crawler";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: null, title: "Start Urls", description: "List of URLs to scrape", required: true })
  declare start_urls: any;

  @prop({ type: "str", default: "a[href]", title: "Link Selector", description: "CSS selector for links to follow" })
  declare link_selector: any;

  @prop({ type: "str", default: "", title: "Page Function", description: "JavaScript function to execute on each page" })
  declare page_function: any;

  @prop({ type: "int", default: 10, title: "Max Pages", description: "Maximum number of pages to scrape" })
  declare max_pages: any;

  @prop({ type: "int", default: 300, title: "Wait For Finish", description: "Maximum time to wait for scraping to complete (seconds)" })
  declare wait_for_finish: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApifyApiKey(inputs);
    const startUrls = (inputs.start_urls as string[]) ?? [];
    if (startUrls.length === 0) throw new Error("start_urls is required");

    const pageFunction =
      String(inputs.page_function ?? "") || DEFAULT_PAGE_FUNCTION;

    const runInput = {
      startUrls: startUrls.map((url) => ({ url })),
      linkSelector: String(inputs.link_selector ?? "a[href]"),
      pageFunction,
      maxPagesPerCrawl: Number(inputs.max_pages ?? 10),
    };

    const items = await runActor(
      apiKey,
      "apify/web-scraper",
      runInput,
      Number(inputs.wait_for_finish ?? 300)
    );
    return { output: items };
  }
}

// ---------------------------------------------------------------------------
// 2. ApifyGoogleSearchScraper
// ---------------------------------------------------------------------------
export class ApifyGoogleSearchScraperNode extends BaseNode {
  static readonly nodeType = "apify.scraping.ApifyGoogleSearchScraper";
            static readonly title = "Apify Google Search Scraper";
            static readonly description = "Scrape Google Search results using Apify's Google Search Scraper.\n    Extract organic results, ads, related searches, and more.\n    apify, google, search, serp, scraping, seo";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: null, title: "Queries", description: "List of search queries to execute", required: true })
  declare queries: any;

  @prop({ type: "str", default: "us", title: "Country Code", description: "Country code for Google search (e.g., 'us', 'uk', 'de')" })
  declare country_code: any;

  @prop({ type: "str", default: "en", title: "Language Code", description: "Language code for results (e.g., 'en', 'es', 'fr')" })
  declare language_code: any;

  @prop({ type: "int", default: 1, title: "Max Pages", description: "Maximum number of result pages per query" })
  declare max_pages: any;

  @prop({ type: "int", default: 100, title: "Results Per Page", description: "Number of results per page (10-100)" })
  declare results_per_page: any;

  @prop({ type: "int", default: 300, title: "Wait For Finish", description: "Maximum time to wait for scraping to complete (seconds)" })
  declare wait_for_finish: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApifyApiKey(inputs);
    const queries = (inputs.queries as string[]) ?? [];
    if (queries.length === 0) throw new Error("queries is required");

    const resultsPerPage = Math.min(
      Math.max(MIN_RESULTS_PER_PAGE, Number(inputs.results_per_page ?? 100)),
      MAX_RESULTS_PER_PAGE
    );

    const runInput = {
      queries: queries.join("\n"),
      countryCode: String(inputs.country_code ?? "us"),
      languageCode: String(inputs.language_code ?? "en"),
      maxPagesPerQuery: Number(inputs.max_pages ?? 1),
      resultsPerPage,
    };

    const items = await runActor(
      apiKey,
      "apify/google-search-scraper",
      runInput,
      Number(inputs.wait_for_finish ?? 300)
    );
    return { output: items };
  }
}

// ---------------------------------------------------------------------------
// 3. ApifyInstagramScraper
// ---------------------------------------------------------------------------
export class ApifyInstagramScraperNode extends BaseNode {
  static readonly nodeType = "apify.scraping.ApifyInstagramScraper";
            static readonly title = "Apify Instagram Scraper";
            static readonly description = "Scrape Instagram profiles, posts, comments, and hashtags.\n    Extract user data, post details, engagement metrics, and more.\n    apify, instagram, social, media, scraping, posts, profiles";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: null, title: "Usernames", description: "List of Instagram usernames to scrape", required: true })
  declare usernames: any;

  @prop({ type: "list[str]", default: null, title: "Hashtags", description: "List of hashtags to scrape", required: true })
  declare hashtags: any;

  @prop({ type: "int", default: 50, title: "Results Limit", description: "Maximum number of posts to scrape per profile/hashtag" })
  declare results_limit: any;

  @prop({ type: "bool", default: false, title: "Scrape Comments", description: "Whether to scrape comments on posts" })
  declare scrape_comments: any;

  @prop({ type: "bool", default: false, title: "Scrape Likes", description: "Whether to scrape likes on posts" })
  declare scrape_likes: any;

  @prop({ type: "int", default: 600, title: "Wait For Finish", description: "Maximum time to wait for scraping to complete (seconds)" })
  declare wait_for_finish: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApifyApiKey(inputs);
    const usernames = (inputs.usernames as string[]) ?? [];
    const hashtags = (inputs.hashtags as string[]) ?? [];
    if (usernames.length === 0 && hashtags.length === 0) {
      throw new Error("Either usernames or hashtags is required");
    }

    const runInput: Record<string, unknown> = {
      resultsLimit: Number(inputs.results_limit ?? 50),
      scrapeComments: Boolean(inputs.scrape_comments ?? false),
      scrapeLikes: Boolean(inputs.scrape_likes ?? false),
    };

    if (usernames.length > 0) runInput.usernames = usernames;
    if (hashtags.length > 0) runInput.hashtags = hashtags;

    const items = await runActor(
      apiKey,
      "apify/instagram-scraper",
      runInput,
      Number(inputs.wait_for_finish ?? 600)
    );
    return { output: items };
  }
}

// ---------------------------------------------------------------------------
// 4. ApifyAmazonScraper
// ---------------------------------------------------------------------------
export class ApifyAmazonScraperNode extends BaseNode {
  static readonly nodeType = "apify.scraping.ApifyAmazonScraper";
            static readonly title = "Apify Amazon Scraper";
            static readonly description = "Scrape Amazon product data including prices, reviews, and ratings.\n    Extract product details, seller information, and customer reviews.\n    apify, amazon, ecommerce, products, scraping, prices, reviews";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: null, title: "Search Queries", description: "List of search queries to execute on Amazon", required: true })
  declare search_queries: any;

  @prop({ type: "list[str]", default: null, title: "Product Urls", description: "List of Amazon product URLs to scrape", required: true })
  declare product_urls: any;

  @prop({ type: "str", default: "US", title: "Country Code", description: "Amazon country code (US, UK, DE, FR, ES, IT, etc.)" })
  declare country_code: any;

  @prop({ type: "int", default: 20, title: "Max Items", description: "Maximum number of products to scrape per search" })
  declare max_items: any;

  @prop({ type: "bool", default: false, title: "Scrape Reviews", description: "Whether to scrape product reviews" })
  declare scrape_reviews: any;

  @prop({ type: "int", default: 600, title: "Wait For Finish", description: "Maximum time to wait for scraping to complete (seconds)" })
  declare wait_for_finish: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApifyApiKey(inputs);
    const searchQueries = (inputs.search_queries as string[]) ?? [];
    const productUrls = (inputs.product_urls as string[]) ?? [];
    if (searchQueries.length === 0 && productUrls.length === 0) {
      throw new Error("Either search_queries or product_urls is required");
    }

    const runInput: Record<string, unknown> = {
      countryCode: String(inputs.country_code ?? "US"),
      maxItems: Number(inputs.max_items ?? 20),
      scrapeReviews: Boolean(inputs.scrape_reviews ?? false),
    };

    if (searchQueries.length > 0) runInput.searchQueries = searchQueries;
    if (productUrls.length > 0) runInput.productUrls = productUrls;

    const items = await runActor(
      apiKey,
      "apify/amazon-product-scraper",
      runInput,
      Number(inputs.wait_for_finish ?? 600)
    );
    return { output: items };
  }
}

// ---------------------------------------------------------------------------
// 5. ApifyYouTubeScraper
// ---------------------------------------------------------------------------
export class ApifyYouTubeScraperNode extends BaseNode {
  static readonly nodeType = "apify.scraping.ApifyYouTubeScraper";
            static readonly title = "Apify You Tube Scraper";
            static readonly description = "Scrape YouTube videos, channels, and playlists.\n    Extract video metadata, comments, channel info, and statistics.\n    apify, youtube, video, scraping, social, media, channels";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: null, title: "Search Queries", description: "List of search queries to execute on YouTube", required: true })
  declare search_queries: any;

  @prop({ type: "list[str]", default: null, title: "Video Urls", description: "List of YouTube video URLs to scrape", required: true })
  declare video_urls: any;

  @prop({ type: "list[str]", default: null, title: "Channel Urls", description: "List of YouTube channel URLs to scrape", required: true })
  declare channel_urls: any;

  @prop({ type: "int", default: 50, title: "Max Results", description: "Maximum number of videos to scrape" })
  declare max_results: any;

  @prop({ type: "bool", default: false, title: "Scrape Comments", description: "Whether to scrape video comments" })
  declare scrape_comments: any;

  @prop({ type: "int", default: 600, title: "Wait For Finish", description: "Maximum time to wait for scraping to complete (seconds)" })
  declare wait_for_finish: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApifyApiKey(inputs);
    const searchQueries = (inputs.search_queries as string[]) ?? [];
    const videoUrls = (inputs.video_urls as string[]) ?? [];
    const channelUrls = (inputs.channel_urls as string[]) ?? [];
    if (
      searchQueries.length === 0 &&
      videoUrls.length === 0 &&
      channelUrls.length === 0
    ) {
      throw new Error(
        "At least one of search_queries, video_urls, or channel_urls is required"
      );
    }

    const startUrls: { url: string }[] = [];
    for (const query of searchQueries) {
      startUrls.push({
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      });
    }
    for (const url of videoUrls) {
      startUrls.push({ url });
    }
    for (const url of channelUrls) {
      startUrls.push({ url });
    }

    const runInput = {
      startUrls,
      maxResults: Number(inputs.max_results ?? 50),
      scrapeComments: Boolean(inputs.scrape_comments ?? false),
    };

    const items = await runActor(
      apiKey,
      "apify/youtube-scraper",
      runInput,
      Number(inputs.wait_for_finish ?? 600)
    );
    return { output: items };
  }
}

// ---------------------------------------------------------------------------
// 6. ApifyTwitterScraper
// ---------------------------------------------------------------------------
export class ApifyTwitterScraperNode extends BaseNode {
  static readonly nodeType = "apify.scraping.ApifyTwitterScraper";
            static readonly title = "Apify Twitter Scraper";
            static readonly description = "Scrape Twitter/X posts, profiles, and followers.\n    Extract tweets, user information, and engagement metrics.\n    apify, twitter, x, social, media, scraping, tweets, posts";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: null, title: "Search Terms", description: "List of search terms to find tweets", required: true })
  declare search_terms: any;

  @prop({ type: "list[str]", default: null, title: "Usernames", description: "List of Twitter usernames to scrape", required: true })
  declare usernames: any;

  @prop({ type: "list[str]", default: null, title: "Tweet Urls", description: "List of specific tweet URLs to scrape", required: true })
  declare tweet_urls: any;

  @prop({ type: "int", default: 100, title: "Max Tweets", description: "Maximum number of tweets to scrape" })
  declare max_tweets: any;

  @prop({ type: "int", default: 600, title: "Wait For Finish", description: "Maximum time to wait for scraping to complete (seconds)" })
  declare wait_for_finish: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApifyApiKey(inputs);
    const searchTerms = (inputs.search_terms as string[]) ?? [];
    const usernames = (inputs.usernames as string[]) ?? [];
    const tweetUrls = (inputs.tweet_urls as string[]) ?? [];
    if (
      searchTerms.length === 0 &&
      usernames.length === 0 &&
      tweetUrls.length === 0
    ) {
      throw new Error(
        "At least one of search_terms, usernames, or tweet_urls is required"
      );
    }

    const startUrls: string[] = [];
    for (const term of searchTerms) {
      startUrls.push(
        `https://twitter.com/search?q=${encodeURIComponent(term)}`
      );
    }
    for (const username of usernames) {
      startUrls.push(`https://twitter.com/${username}`);
    }
    startUrls.push(...tweetUrls);

    const runInput = {
      startUrls,
      maxItems: Number(inputs.max_tweets ?? 100),
    };

    const items = await runActor(
      apiKey,
      "apify/twitter-scraper",
      runInput,
      Number(inputs.wait_for_finish ?? 600)
    );
    return { output: items };
  }
}

// ---------------------------------------------------------------------------
// 7. ApifyLinkedInScraper
// ---------------------------------------------------------------------------
export class ApifyLinkedInScraperNode extends BaseNode {
  static readonly nodeType = "apify.scraping.ApifyLinkedInScraper";
            static readonly title = "Apify Linked In Scraper";
            static readonly description = "Scrape LinkedIn profiles, company pages, and job postings.\n    Extract professional information, connections, and company data.\n    apify, linkedin, professional, social, scraping, profiles, jobs";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "list[str]", default: null, title: "Profile Urls", description: "List of LinkedIn profile URLs to scrape", required: true })
  declare profile_urls: any;

  @prop({ type: "list[str]", default: null, title: "Company Urls", description: "List of LinkedIn company page URLs to scrape", required: true })
  declare company_urls: any;

  @prop({ type: "list[str]", default: null, title: "Job Search Urls", description: "List of LinkedIn job search URLs", required: true })
  declare job_search_urls: any;

  @prop({ type: "int", default: 50, title: "Max Results", description: "Maximum number of results to scrape" })
  declare max_results: any;

  @prop({ type: "int", default: 600, title: "Wait For Finish", description: "Maximum time to wait for scraping to complete (seconds)" })
  declare wait_for_finish: any;




  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const apiKey = getApifyApiKey(inputs);
    const profileUrls = (inputs.profile_urls as string[]) ?? [];
    const companyUrls = (inputs.company_urls as string[]) ?? [];
    const jobSearchUrls = (inputs.job_search_urls as string[]) ?? [];
    if (
      profileUrls.length === 0 &&
      companyUrls.length === 0 &&
      jobSearchUrls.length === 0
    ) {
      throw new Error(
        "At least one of profile_urls, company_urls, or job_search_urls is required"
      );
    }

    const allUrls = [...profileUrls, ...companyUrls, ...jobSearchUrls];

    const runInput = {
      startUrls: allUrls.map((url) => ({ url })),
      maxResults: Number(inputs.max_results ?? 50),
    };

    const items = await runActor(
      apiKey,
      "apify/linkedin-profile-scraper",
      runInput,
      Number(inputs.wait_for_finish ?? 600)
    );
    return { output: items };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const APIFY_NODES: readonly NodeClass[] = [
  ApifyWebScraperNode,
  ApifyGoogleSearchScraperNode,
  ApifyInstagramScraperNode,
  ApifyAmazonScraperNode,
  ApifyYouTubeScraperNode,
  ApifyTwitterScraperNode,
  ApifyLinkedInScraperNode,
] as const;
