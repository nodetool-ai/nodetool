// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Google Search — search.google.GoogleSearch
export interface GoogleSearchInputs {
  keyword?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleSearchOutputs {
  output: unknown[];
}

export function googleSearch(
  inputs: GoogleSearchInputs
): DslNode<GoogleSearchOutputs, "output"> {
  return createNode(
    "search.google.GoogleSearch",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Google News — search.google.GoogleNews
export interface GoogleNewsInputs {
  keyword?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleNewsOutputs {
  output: unknown[];
}

export function googleNews(
  inputs: GoogleNewsInputs
): DslNode<GoogleNewsOutputs, "output"> {
  return createNode(
    "search.google.GoogleNews",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Google Images — search.google.GoogleImages
export interface GoogleImagesInputs {
  keyword?: Connectable<string>;
  image_url?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleImagesOutputs {
  output: ImageRef[];
}

export function googleImages(
  inputs: GoogleImagesInputs
): DslNode<GoogleImagesOutputs, "output"> {
  return createNode(
    "search.google.GoogleImages",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Google Finance — search.google.GoogleFinance
export interface GoogleFinanceInputs {
  query?: Connectable<string>;
  window?: Connectable<string>;
}

export interface GoogleFinanceOutputs {
  output: Record<string, unknown>;
}

export function googleFinance(
  inputs: GoogleFinanceInputs
): DslNode<GoogleFinanceOutputs, "output"> {
  return createNode(
    "search.google.GoogleFinance",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Google Jobs — search.google.GoogleJobs
export interface GoogleJobsInputs {
  query?: Connectable<string>;
  location?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleJobsOutputs {
  output: unknown[];
}

export function googleJobs(
  inputs: GoogleJobsInputs
): DslNode<GoogleJobsOutputs, "output"> {
  return createNode(
    "search.google.GoogleJobs",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Google Lens — search.google.GoogleLens
export interface GoogleLensInputs {
  image_url?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleLensOutputs {}

export function googleLens(
  inputs: GoogleLensInputs
): DslNode<GoogleLensOutputs> {
  return createNode(
    "search.google.GoogleLens",
    inputs as Record<string, unknown>,
    { outputNames: [] }
  );
}

// Google Maps — search.google.GoogleMaps
export interface GoogleMapsInputs {
  query?: Connectable<string>;
  num_results?: Connectable<number>;
}

export interface GoogleMapsOutputs {
  output: unknown[];
}

export function googleMaps(
  inputs: GoogleMapsInputs
): DslNode<GoogleMapsOutputs, "output"> {
  return createNode(
    "search.google.GoogleMaps",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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
  output: unknown[];
}

export function googleShopping(
  inputs: GoogleShoppingInputs
): DslNode<GoogleShoppingOutputs, "output"> {
  return createNode(
    "search.google.GoogleShopping",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
