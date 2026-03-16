// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, AudioRef, VideoRef } from "../types.js";

// Base Url — lib.beautifulsoup.BaseUrl
export interface BaseUrlInputs {
  url?: Connectable<string>;
}

export function baseUrl(inputs: BaseUrlInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.beautifulsoup.BaseUrl", inputs as Record<string, unknown>);
}

// Extract Links — lib.beautifulsoup.ExtractLinks
export interface ExtractLinksInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractLinksOutputs {
  href: OutputHandle<string>;
  text: OutputHandle<string>;
  type: OutputHandle<string>;
}

export function extractLinks(inputs: ExtractLinksInputs): DslNode<ExtractLinksOutputs> {
  return createNode("lib.beautifulsoup.ExtractLinks", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Extract Images — lib.beautifulsoup.ExtractImages
export interface ExtractImagesInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractImagesOutputs {
  image: OutputHandle<ImageRef>;
}

export function extractImages(inputs: ExtractImagesInputs): DslNode<ExtractImagesOutputs> {
  return createNode("lib.beautifulsoup.ExtractImages", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Extract Audio — lib.beautifulsoup.ExtractAudio
export interface ExtractAudioInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractAudioOutputs {
  audio: OutputHandle<AudioRef>;
}

export function extractAudio(inputs: ExtractAudioInputs): DslNode<ExtractAudioOutputs> {
  return createNode("lib.beautifulsoup.ExtractAudio", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Extract Videos — lib.beautifulsoup.ExtractVideos
export interface ExtractVideosInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractVideosOutputs {
  video: OutputHandle<VideoRef>;
}

export function extractVideos(inputs: ExtractVideosInputs): DslNode<ExtractVideosOutputs> {
  return createNode("lib.beautifulsoup.ExtractVideos", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Extract Metadata — lib.beautifulsoup.ExtractMetadata
export interface ExtractMetadataInputs {
  html?: Connectable<string>;
}

export interface ExtractMetadataOutputs {
  title: OutputHandle<string>;
  description: OutputHandle<string>;
  keywords: OutputHandle<string>;
}

export function extractMetadata(inputs: ExtractMetadataInputs): DslNode<ExtractMetadataOutputs> {
  return createNode("lib.beautifulsoup.ExtractMetadata", inputs as Record<string, unknown>, { multiOutput: true });
}

// Convert HTML to Text — lib.beautifulsoup.HTMLToText
export interface HTMLToTextInputs {
  text?: Connectable<string>;
  preserve_linebreaks?: Connectable<boolean>;
}

export function hTMLToText(inputs: HTMLToTextInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.beautifulsoup.HTMLToText", inputs as Record<string, unknown>);
}

// Website Content Extractor — lib.beautifulsoup.WebsiteContentExtractor
export interface WebsiteContentExtractorInputs {
  html_content?: Connectable<string>;
}

export function websiteContentExtractor(inputs: WebsiteContentExtractorInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.beautifulsoup.WebsiteContentExtractor", inputs as Record<string, unknown>);
}
