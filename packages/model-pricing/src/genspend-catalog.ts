/**
 * The GenSpend price catalog refreshed nightly by
 * `scripts/sync-genspend-pricing.mjs`, exposed as a plain module so consumers
 * import it (and bundlers inline it) instead of reading JSON off disk — the
 * same shape as the FAL and kie catalogs.
 *
 * Keyed `<provider_id>:<model_id>`, where `provider_id` is a NodeTool
 * `PROVIDER_IDS` value and `model_id` is the provider-native id that lands on a
 * node's provider-model property. Every provider NodeTool can run and GenSpend
 * tracks is in here.
 *
 * Prices via genspend.io.
 */

import catalog from "./generated/genspend-pricing.json" with { type: "json" };

/** GenSpend prices are USD list prices; the sync never converts a currency. */
export const GENSPEND_CURRENCY = "USD";

/**
 * How a price was tied to a NodeTool model id:
 * - `receipt` — read from the provider's own model page URL. Exact.
 * - `alias` — pinned by hand in `scripts/genspend/aliases.json`.
 * - `catalog` — the model's normalized name matched a model the provider
 *   enumerates in NodeTool. It prices the model, not one endpoint variant, so
 *   sibling task endpoints share the number.
 */
export type GenspendMatch = "receipt" | "alias" | "catalog";

export interface GenspendPrice {
  unit_price: number;
  /** "images", "seconds", "generations", … — the FAL catalog's vocabulary. */
  billing_unit: string;
  /** GenSpend's machine key; prices only compare inside one unit class. */
  unit_class: string;
  model_slug: string;
  match: GenspendMatch;
  /** Auto-synced from the provider (~6h) rather than hand-verified weekly. */
  live: boolean;
  /** The receipt page the price was read from. */
  source_url: string;
}

export interface GenspendPricingCatalog {
  schemaVersion: number;
  source: string;
  attribution: string;
  /** When the prices last changed — an unchanged nightly run leaves it alone. */
  updatedAt: string;
  catalogModels: number;
  catalogOfferings: number;
  /** NodeTool provider ids the catalog carries prices for. */
  providers: string[];
  pricedModels: number;
  prices: Record<string, GenspendPrice>;
}

export const genspendPricingCatalog =
  catalog as unknown as GenspendPricingCatalog;

/** The catalog price for a provider-native model id, or null when untracked. */
export function getGenspendPrice(
  provider: string | null,
  modelId: string
): GenspendPrice | null {
  if (!provider) return null;
  return genspendPricingCatalog.prices[`${provider}:${modelId}`] ?? null;
}

export default genspendPricingCatalog;
