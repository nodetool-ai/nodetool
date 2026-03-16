// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Fetch RSS Feed — lib.rss.FetchRSSFeed
export interface FetchRSSFeedInputs {
  url?: Connectable<string>;
}

export interface FetchRSSFeedOutputs {
  title: OutputHandle<string>;
  link: OutputHandle<string>;
  published: OutputHandle<unknown>;
  summary: OutputHandle<string>;
  author: OutputHandle<string>;
}

export function fetchRSSFeed(inputs: FetchRSSFeedInputs): DslNode<FetchRSSFeedOutputs> {
  return createNode("lib.rss.FetchRSSFeed", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Extract Feed Metadata — lib.rss.ExtractFeedMetadata
export interface ExtractFeedMetadataInputs {
  url?: Connectable<string>;
}

export function extractFeedMetadata(inputs: ExtractFeedMetadataInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.rss.ExtractFeedMetadata", inputs as Record<string, unknown>);
}
