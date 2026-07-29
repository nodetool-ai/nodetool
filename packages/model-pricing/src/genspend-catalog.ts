/**
 * The GenSpend price catalog refreshed nightly by
 * `scripts/sync-genspend-pricing.mjs`, exposed as a plain module so consumers
 * import it (and bundlers inline it) instead of reading JSON off disk — the
 * same shape as the FAL and kie catalogs.
 *
 * Keyed `<provider_id>:<model_id>`, where `provider_id` is a NodeTool
 * `PROVIDER_IDS` value and `model_id` is the provider-native id that lands on a
 * node's provider-model property.
 *
 * Prices via genspend.io.
 */

import catalog from "./generated/genspend-pricing.json" with { type: "json" };

export interface GenspendVariant {
  spec: string;
  unit_class: string;
  unit_price: number;
}

export interface GenspendPrice {
  unit_price: number;
  billing_unit: string;
  currency: string;
  /** The provider's own human-readable billing basis, e.g. "per second of video". */
  unit: string;
  /** Machine key; prices are only comparable within one unit class. */
  unit_class: string;
  model_slug: string;
  model_name: string;
  provider_name: string;
  /** Auto-synced from the provider (~6h) rather than hand-verified weekly. */
  live: boolean;
  /** The receipt page the price was read from. */
  source_url: string;
  /** Published per-spec rows (e.g. "1080p · 8s"), when the provider has them. */
  variants?: GenspendVariant[];
}

export interface GenspendPricingCatalog {
  schemaVersion: number;
  source: string;
  attribution: string;
  /** When the prices last changed — an unchanged nightly run leaves it alone. */
  updatedAt: string;
  catalogModels: number;
  catalogOfferings: number;
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
