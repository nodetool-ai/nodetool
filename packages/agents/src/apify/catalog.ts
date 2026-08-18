/**
 * The actors NodeTool ships knowing about.
 *
 * Two jobs, and they are separate. The catalog is the **default allowlist** —
 * what an install runs without anyone approving anything — and it is the
 * lookup behind the ergonomic wrappers (`crawl_website` and friends), which
 * are thin: a wrapper picks an entry here, maps a handful of named arguments
 * onto that actor's input, and calls the same generic run path a model would.
 *
 * Entries are chosen for being first-party (`apify/*`) or the long-standing
 * community actor for a capability with no official equivalent, with a stable
 * documented input schema. An actor is not added because it ranks first in a
 * store search. `costHint` is the shape of the bill, not a price: the price
 * moves, and `get_apify_actor` reads the live figure from the store record.
 */

/** What an actor is for, so a wrapper and a model can both find one. */
export type ActorCapability =
  | "crawl"
  | "extract"
  | "browser"
  | "search"
  | "places"
  | "social"
  | "media"
  | "screenshot"
  | "transcript";

export interface CatalogActor {
  /** Canonical `owner/name` id. */
  readonly id: string;
  readonly capability: ActorCapability;
  /** One line, for a model choosing between entries. */
  readonly summary: string;
  /** Roughly what a run bills on, for the cheapest-thing-that-works choice. */
  readonly costHint: "per-result" | "per-page" | "per-event" | "compute-time";
}

/**
 * The shipped allowlist.
 *
 * Ordered cheapest-and-most-specific first within each capability, which is
 * also the order a model reads them in: `website-content-crawler` before
 * `playwright-scraper` means the default answer to "get me this page" is an
 * HTTP fetch, not a browser.
 */
export const ACTOR_CATALOG: readonly CatalogActor[] = [
  {
    id: "apify/website-content-crawler",
    capability: "crawl",
    summary:
      "Crawl a site and return each page as clean Markdown or text. The " +
      "default choice for reading documentation, articles, or a whole site " +
      "for an LLM.",
    costHint: "per-result"
  },
  {
    id: "apify/cheerio-scraper",
    capability: "extract",
    summary:
      "Fast HTML-only scraping with a page function. No browser, so it " +
      "cannot see content a page renders with JavaScript.",
    costHint: "compute-time"
  },
  {
    id: "apify/web-scraper",
    capability: "extract",
    summary:
      "Browser-rendered scraping with a page function. Use when the data " +
      "appears only after scripts run.",
    costHint: "compute-time"
  },
  {
    id: "apify/playwright-scraper",
    capability: "browser",
    summary:
      "Full Playwright automation for pages needing interaction — logins, " +
      "clicks, infinite scroll. The most expensive option; prefer a crawl or " +
      "an HTML scrape when either would do.",
    costHint: "compute-time"
  },
  {
    id: "apify/google-search-scraper",
    capability: "search",
    summary: "Google search result pages as structured records.",
    costHint: "per-result"
  },
  {
    id: "compass/google-maps-extractor",
    capability: "places",
    summary:
      "Google Maps businesses by search term and location, with address, " +
      "rating, category, and contact details.",
    costHint: "per-result"
  },
  {
    id: "apify/instagram-scraper",
    capability: "social",
    summary: "Public Instagram profiles, posts, and comments.",
    costHint: "per-result"
  },
  {
    id: "trudax/reddit-scraper-lite",
    capability: "social",
    summary: "Public Reddit posts and comments by subreddit, user, or search.",
    costHint: "per-result"
  },
  {
    id: "apify/screenshot-url",
    capability: "screenshot",
    summary:
      "Render a URL and store the screenshot in the run's key-value store.",
    costHint: "per-event"
  },
  {
    id: "streamers/youtube-scraper",
    capability: "transcript",
    summary:
      "YouTube video metadata and, where published, subtitles/transcripts.",
    costHint: "per-result"
  }
];

const BY_ID = new Map(ACTOR_CATALOG.map((actor) => [actor.id, actor]));

/** The catalog entry for a canonical actor id, if NodeTool ships one. */
export function catalogActor(id: string): CatalogActor | undefined {
  return BY_ID.get(id);
}

/** Every shipped actor for one capability, in catalog (preference) order. */
export function actorsFor(
  capability: ActorCapability
): readonly CatalogActor[] {
  return ACTOR_CATALOG.filter((actor) => actor.capability === capability);
}

/** The default actor a wrapper uses for a capability. */
export function defaultActorFor(
  capability: ActorCapability
): CatalogActor | undefined {
  return actorsFor(capability)[0];
}

/** The ids that make up the shipped default allowlist. */
export const CATALOG_ACTOR_IDS: readonly string[] = ACTOR_CATALOG.map(
  (actor) => actor.id
);
