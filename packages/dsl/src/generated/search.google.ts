// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Google Search — search.google.GoogleSearch
export interface GoogleSearchInputs {
  keyword?: Connectable<string>;
  num_results?: Connectable<number>;
}

export function googleSearch(inputs: GoogleSearchInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("search.google.GoogleSearch", inputs as Record<string, unknown>);
}

// Google News — search.google.GoogleNews
export interface GoogleNewsInputs {
  keyword?: Connectable<string>;
  num_results?: Connectable<number>;
}

export function googleNews(inputs: GoogleNewsInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("search.google.GoogleNews", inputs as Record<string, unknown>);
}

// Google Images — search.google.GoogleImages
export interface GoogleImagesInputs {
  keyword?: Connectable<string>;
  image_url?: Connectable<string>;
  num_results?: Connectable<number>;
}

export function googleImages(inputs: GoogleImagesInputs): DslNode<SingleOutput<ImageRef[]>> {
  return createNode("search.google.GoogleImages", inputs as Record<string, unknown>);
}

// Google Finance — search.google.GoogleFinance
export interface GoogleFinanceInputs {
  query?: Connectable<string>;
  window?: Connectable<string>;
}

export function googleFinance(inputs: GoogleFinanceInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("search.google.GoogleFinance", inputs as Record<string, unknown>);
}

// Google Jobs — search.google.GoogleJobs
export interface GoogleJobsInputs {
  query?: Connectable<string>;
  location?: Connectable<string>;
  num_results?: Connectable<number>;
}

export function googleJobs(inputs: GoogleJobsInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("search.google.GoogleJobs", inputs as Record<string, unknown>);
}

// Google Lens — search.google.GoogleLens
export interface GoogleLensInputs {
  image_url?: Connectable<string>;
  num_results?: Connectable<number>;
}

export function googleLens(inputs: GoogleLensInputs): DslNode<SingleOutput<unknown>> {
  return createNode("search.google.GoogleLens", inputs as Record<string, unknown>);
}

// Google Maps — search.google.GoogleMaps
export interface GoogleMapsInputs {
  query?: Connectable<string>;
  num_results?: Connectable<number>;
}

export function googleMaps(inputs: GoogleMapsInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("search.google.GoogleMaps", inputs as Record<string, unknown>);
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

export function googleShopping(inputs: GoogleShoppingInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("search.google.GoogleShopping", inputs as Record<string, unknown>);
}
