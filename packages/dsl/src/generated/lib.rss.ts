// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Fetch RSS Feed — lib.rss.FetchRSSFeed
export interface FetchRSSFeedInputs {
  url?: Connectable<string>;
}

export interface FetchRSSFeedOutputs {
  title: string;
  link: string;
  published: unknown;
  summary: string;
  author: string;
  items: unknown[];
}

export function fetchRSSFeed(inputs: FetchRSSFeedInputs): DslNode<FetchRSSFeedOutputs> {
  return createNode("lib.rss.FetchRSSFeed", inputs as Record<string, unknown>, { outputNames: ["title", "link", "published", "summary", "author", "items"], streaming: true });
}

// Extract Feed Metadata — lib.rss.ExtractFeedMetadata
export interface ExtractFeedMetadataInputs {
  url?: Connectable<string>;
}

export interface ExtractFeedMetadataOutputs {
  output: Record<string, unknown>;
}

export function extractFeedMetadata(inputs: ExtractFeedMetadataInputs): DslNode<ExtractFeedMetadataOutputs, "output"> {
  return createNode("lib.rss.ExtractFeedMetadata", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
