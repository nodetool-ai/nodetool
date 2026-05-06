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

export function baseUrl(inputs: BaseUrlInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BaseUrlOutputs, "output"> {
  return createNode("lib.html.BaseUrl", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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
  links: unknown[];
}

export function extractLinks(inputs: ExtractLinksInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractLinksOutputs> {
  return createNode("lib.html.ExtractLinks", inputs as Record<string, unknown>, { outputNames: ["href", "text", "type", "links"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Images — lib.html.ExtractImages
export interface ExtractImagesInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractImagesOutputs {
  image: ImageRef;
  images: unknown[];
}

export function extractImages(inputs: ExtractImagesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractImagesOutputs> {
  return createNode("lib.html.ExtractImages", inputs as Record<string, unknown>, { outputNames: ["image", "images"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Audio — lib.html.ExtractAudio
export interface ExtractAudioInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractAudioOutputs {
  audio: AudioRef;
  audios: unknown[];
}

export function extractAudio(inputs: ExtractAudioInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractAudioOutputs> {
  return createNode("lib.html.ExtractAudio", inputs as Record<string, unknown>, { outputNames: ["audio", "audios"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Videos — lib.html.ExtractVideos
export interface ExtractVideosInputs {
  html?: Connectable<string>;
  base_url?: Connectable<string>;
}

export interface ExtractVideosOutputs {
  video: VideoRef;
  videos: unknown[];
}

export function extractVideos(inputs: ExtractVideosInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractVideosOutputs> {
  return createNode("lib.html.ExtractVideos", inputs as Record<string, unknown>, { outputNames: ["video", "videos"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function extractMetadata(inputs: ExtractMetadataInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractMetadataOutputs> {
  return createNode("lib.html.ExtractMetadata", inputs as Record<string, unknown>, { outputNames: ["title", "description", "keywords"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Convert HTML to Text — lib.html.HTMLToText
export interface HTMLToTextInputs {
  text?: Connectable<string>;
  preserve_linebreaks?: Connectable<boolean>;
}

export interface HTMLToTextOutputs {
  output: string;
}

export function htmlToText(inputs: HTMLToTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<HTMLToTextOutputs, "output"> {
  return createNode("lib.html.HTMLToText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Website Content Extractor — lib.html.WebsiteContentExtractor
export interface WebsiteContentExtractorInputs {
  html_content?: Connectable<string>;
}

export interface WebsiteContentExtractorOutputs {
  output: string;
}

export function websiteContentExtractor(inputs: WebsiteContentExtractorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<WebsiteContentExtractorOutputs, "output"> {
  return createNode("lib.html.WebsiteContentExtractor", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
