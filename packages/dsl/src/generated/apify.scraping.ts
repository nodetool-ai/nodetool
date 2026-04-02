// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Apify Web Scraper — apify.scraping.ApifyWebScraper
export interface ApifyWebScraperInputs {
  start_urls?: Connectable<string[]>;
  link_selector?: Connectable<string>;
  page_function?: Connectable<string>;
  max_pages?: Connectable<number>;
  wait_for_finish?: Connectable<number>;
}

export interface ApifyWebScraperOutputs {
  output: Record<string, unknown>[];
}

export function apifyWebScraper(
  inputs: ApifyWebScraperInputs
): DslNode<ApifyWebScraperOutputs, "output"> {
  return createNode(
    "apify.scraping.ApifyWebScraper",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Apify Google Search Scraper — apify.scraping.ApifyGoogleSearchScraper
export interface ApifyGoogleSearchScraperInputs {
  queries?: Connectable<string[]>;
  country_code?: Connectable<string>;
  language_code?: Connectable<string>;
  max_pages?: Connectable<number>;
  results_per_page?: Connectable<number>;
  wait_for_finish?: Connectable<number>;
}

export interface ApifyGoogleSearchScraperOutputs {
  output: Record<string, unknown>[];
}

export function apifyGoogleSearchScraper(
  inputs: ApifyGoogleSearchScraperInputs
): DslNode<ApifyGoogleSearchScraperOutputs, "output"> {
  return createNode(
    "apify.scraping.ApifyGoogleSearchScraper",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Apify Instagram Scraper — apify.scraping.ApifyInstagramScraper
export interface ApifyInstagramScraperInputs {
  usernames?: Connectable<string[]>;
  hashtags?: Connectable<string[]>;
  results_limit?: Connectable<number>;
  scrape_comments?: Connectable<boolean>;
  scrape_likes?: Connectable<boolean>;
  wait_for_finish?: Connectable<number>;
}

export interface ApifyInstagramScraperOutputs {
  output: Record<string, unknown>[];
}

export function apifyInstagramScraper(
  inputs: ApifyInstagramScraperInputs
): DslNode<ApifyInstagramScraperOutputs, "output"> {
  return createNode(
    "apify.scraping.ApifyInstagramScraper",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Apify Amazon Scraper — apify.scraping.ApifyAmazonScraper
export interface ApifyAmazonScraperInputs {
  search_queries?: Connectable<string[]>;
  product_urls?: Connectable<string[]>;
  country_code?: Connectable<string>;
  max_items?: Connectable<number>;
  scrape_reviews?: Connectable<boolean>;
  wait_for_finish?: Connectable<number>;
}

export interface ApifyAmazonScraperOutputs {
  output: Record<string, unknown>[];
}

export function apifyAmazonScraper(
  inputs: ApifyAmazonScraperInputs
): DslNode<ApifyAmazonScraperOutputs, "output"> {
  return createNode(
    "apify.scraping.ApifyAmazonScraper",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Apify You Tube Scraper — apify.scraping.ApifyYouTubeScraper
export interface ApifyYouTubeScraperInputs {
  search_queries?: Connectable<string[]>;
  video_urls?: Connectable<string[]>;
  channel_urls?: Connectable<string[]>;
  max_results?: Connectable<number>;
  scrape_comments?: Connectable<boolean>;
  wait_for_finish?: Connectable<number>;
}

export interface ApifyYouTubeScraperOutputs {
  output: Record<string, unknown>[];
}

export function apifyYouTubeScraper(
  inputs: ApifyYouTubeScraperInputs
): DslNode<ApifyYouTubeScraperOutputs, "output"> {
  return createNode(
    "apify.scraping.ApifyYouTubeScraper",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Apify Twitter Scraper — apify.scraping.ApifyTwitterScraper
export interface ApifyTwitterScraperInputs {
  search_terms?: Connectable<string[]>;
  usernames?: Connectable<string[]>;
  tweet_urls?: Connectable<string[]>;
  max_tweets?: Connectable<number>;
  wait_for_finish?: Connectable<number>;
}

export interface ApifyTwitterScraperOutputs {
  output: Record<string, unknown>[];
}

export function apifyTwitterScraper(
  inputs: ApifyTwitterScraperInputs
): DslNode<ApifyTwitterScraperOutputs, "output"> {
  return createNode(
    "apify.scraping.ApifyTwitterScraper",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Apify Linked In Scraper — apify.scraping.ApifyLinkedInScraper
export interface ApifyLinkedInScraperInputs {
  profile_urls?: Connectable<string[]>;
  company_urls?: Connectable<string[]>;
  job_search_urls?: Connectable<string[]>;
  max_results?: Connectable<number>;
  wait_for_finish?: Connectable<number>;
}

export interface ApifyLinkedInScraperOutputs {
  output: Record<string, unknown>[];
}

export function apifyLinkedInScraper(
  inputs: ApifyLinkedInScraperInputs
): DslNode<ApifyLinkedInScraperOutputs, "output"> {
  return createNode(
    "apify.scraping.ApifyLinkedInScraper",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
