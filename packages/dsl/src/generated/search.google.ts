// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Google Search — search.google.GoogleSearch
export interface GoogleSearchInputs {
  keyword?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleSearchOutputs {
  results: unknown[];
  text: string;
}

export function googleSearch(inputs: GoogleSearchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleSearchOutputs> {
  return createNode("search.google.GoogleSearch", inputs as Record<string, unknown>, { outputNames: ["results", "text"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Google News — search.google.GoogleNews
export interface GoogleNewsInputs {
  keyword?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleNewsOutputs {
  results: unknown[];
  text: string;
}

export function googleNews(inputs: GoogleNewsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleNewsOutputs> {
  return createNode("search.google.GoogleNews", inputs as Record<string, unknown>, { outputNames: ["results", "text"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Google Images — search.google.GoogleImages
export interface GoogleImagesInputs {
  keyword?: Connectable<string>;
  image_url?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleImagesOutputs {
  results: ImageRef[];
}

export function googleImages(inputs: GoogleImagesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleImagesOutputs, "results"> {
  return createNode("search.google.GoogleImages", inputs as Record<string, unknown>, { outputNames: ["results"], defaultOutput: "results", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Google Finance — search.google.GoogleFinance
export interface GoogleFinanceInputs {
  query?: Connectable<string>;
  window?: Connectable<string>;
}

export interface GoogleFinanceOutputs {
  results: Record<string, unknown>;
}

export function googleFinance(inputs: GoogleFinanceInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleFinanceOutputs, "results"> {
  return createNode("search.google.GoogleFinance", inputs as Record<string, unknown>, { outputNames: ["results"], defaultOutput: "results", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Google Jobs — search.google.GoogleJobs
export interface GoogleJobsInputs {
  query?: Connectable<string>;
  location?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleJobsOutputs {
  results: unknown[];
  text: string;
}

export function googleJobs(inputs: GoogleJobsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleJobsOutputs> {
  return createNode("search.google.GoogleJobs", inputs as Record<string, unknown>, { outputNames: ["results", "text"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Google Lens — search.google.GoogleLens
export interface GoogleLensInputs {
  image_url?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleLensOutputs {
}

export function googleLens(inputs: GoogleLensInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleLensOutputs> {
  return createNode("search.google.GoogleLens", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Google Maps — search.google.GoogleMaps
export interface GoogleMapsInputs {
  query?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleMapsOutputs {
  results: unknown[];
  text: string;
}

export function googleMaps(inputs: GoogleMapsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleMapsOutputs> {
  return createNode("search.google.GoogleMaps", inputs as Record<string, unknown>, { outputNames: ["results", "text"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Google Shopping — search.google.GoogleShopping
export interface GoogleShoppingInputs {
  query?: Connectable<string>;
  country?: Connectable<string>;
  min_price?: Connectable<number>;
  max_price?: Connectable<number>;
  condition?: Connectable<string>;
  sort_by?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleShoppingOutputs {
  results: unknown[];
  text: string;
}

export function googleShopping(inputs: GoogleShoppingInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GoogleShoppingOutputs> {
  return createNode("search.google.GoogleShopping", inputs as Record<string, unknown>, { outputNames: ["results", "text"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
