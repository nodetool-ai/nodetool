// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef } from "../types.js";

// Base Url — lib.beautifulsoup.BaseUrl
export interface BaseUrlInputs {
  url?: Connectable<string>;
}

export interface BaseUrlOutputs {
  output: string;
}

export function baseUrl(
  inputs: BaseUrlInputs
): DslNode<BaseUrlOutputs, "output"> {
  return createNode(
    "lib.beautifulsoup.BaseUrl",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Links — lib.beautifulsoup.ExtractLinks
export interface ExtractLinksInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractLinksOutputs {
  href: string;
  text: string;
  type: string;
}

export function extractLinks(
  inputs: ExtractLinksInputs
): DslNode<ExtractLinksOutputs> {
  return createNode(
    "lib.beautifulsoup.ExtractLinks",
    inputs as Record<string, unknown>,
    { outputNames: ["href", "text", "type"], streaming: true }
  );
}

// Extract Images — lib.beautifulsoup.ExtractImages
export interface ExtractImagesInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractImagesOutputs {
  image: ImageRef;
}

export function extractImages(
  inputs: ExtractImagesInputs
): DslNode<ExtractImagesOutputs, "image"> {
  return createNode(
    "lib.beautifulsoup.ExtractImages",
    inputs as Record<string, unknown>,
    { outputNames: ["image"], defaultOutput: "image", streaming: true }
  );
}

// Extract Audio — lib.beautifulsoup.ExtractAudio
export interface ExtractAudioInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractAudioOutputs {
  audio: AudioRef;
}

export function extractAudio(
  inputs: ExtractAudioInputs
): DslNode<ExtractAudioOutputs, "audio"> {
  return createNode(
    "lib.beautifulsoup.ExtractAudio",
    inputs as Record<string, unknown>,
    { outputNames: ["audio"], defaultOutput: "audio", streaming: true }
  );
}

// Extract Videos — lib.beautifulsoup.ExtractVideos
export interface ExtractVideosInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractVideosOutputs {
  video: VideoRef;
}

export function extractVideos(
  inputs: ExtractVideosInputs
): DslNode<ExtractVideosOutputs, "video"> {
  return createNode(
    "lib.beautifulsoup.ExtractVideos",
    inputs as Record<string, unknown>,
    { outputNames: ["video"], defaultOutput: "video", streaming: true }
  );
}

// Extract Metadata — lib.beautifulsoup.ExtractMetadata
export interface ExtractMetadataInputs {
  html?: Connectable<string>;
}

export interface ExtractMetadataOutputs {
  title: string;
  description: string;
  keywords: string;
}

export function extractMetadata(
  inputs: ExtractMetadataInputs
): DslNode<ExtractMetadataOutputs> {
  return createNode(
    "lib.beautifulsoup.ExtractMetadata",
    inputs as Record<string, unknown>,
    { outputNames: ["title", "description", "keywords"] }
  );
}

// Convert HTML to Text — lib.beautifulsoup.HTMLToText
export interface HTMLToTextInputs {
  text?: Connectable<string>;
  preserve_linebreaks?: Connectable<boolean>;
}

export interface HTMLToTextOutputs {
  output: string;
}

export function htmlToText(
  inputs: HTMLToTextInputs
): DslNode<HTMLToTextOutputs, "output"> {
  return createNode(
    "lib.beautifulsoup.HTMLToText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Website Content Extractor — lib.beautifulsoup.WebsiteContentExtractor
export interface WebsiteContentExtractorInputs {
  html_content?: Connectable<string>;
}

export interface WebsiteContentExtractorOutputs {
  output: string;
}

export function websiteContentExtractor(
  inputs: WebsiteContentExtractorInputs
): DslNode<WebsiteContentExtractorOutputs, "output"> {
  return createNode(
    "lib.beautifulsoup.WebsiteContentExtractor",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
