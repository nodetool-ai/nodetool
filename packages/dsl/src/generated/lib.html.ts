// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef } from "../types.js";

// Base Url — lib.html.BaseUrl
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
    "lib.html.BaseUrl",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Links — lib.html.ExtractLinks
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
    "lib.html.ExtractLinks",
    inputs as Record<string, unknown>,
    { outputNames: ["href", "text", "type"], streaming: true }
  );
}

// Extract Images — lib.html.ExtractImages
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
    "lib.html.ExtractImages",
    inputs as Record<string, unknown>,
    { outputNames: ["image"], defaultOutput: "image", streaming: true }
  );
}

// Extract Audio — lib.html.ExtractAudio
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
    "lib.html.ExtractAudio",
    inputs as Record<string, unknown>,
    { outputNames: ["audio"], defaultOutput: "audio", streaming: true }
  );
}

// Extract Videos — lib.html.ExtractVideos
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
    "lib.html.ExtractVideos",
    inputs as Record<string, unknown>,
    { outputNames: ["video"], defaultOutput: "video", streaming: true }
  );
}

// Extract Metadata — lib.html.ExtractMetadata
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
    "lib.html.ExtractMetadata",
    inputs as Record<string, unknown>,
    { outputNames: ["title", "description", "keywords"] }
  );
}

// Convert HTML to Text — lib.html.HTMLToText
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
    "lib.html.HTMLToText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Website Content Extractor — lib.html.WebsiteContentExtractor
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
    "lib.html.WebsiteContentExtractor",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
