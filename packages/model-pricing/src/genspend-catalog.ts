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
 * How a price was tied to a NodeTool model id, most trusted first:
 * - `alias` — pinned by hand in `scripts/genspend/aliases.json`.
 * - `variant` — a GenSpend `variants[]` row naming this exact model, so the
 *   price is that endpoint's own, not the model's headline number.
 * - `receipt` — read from the provider's own model page URL.
 * - `provider-id` — GenSpend's `providerModelId`, taken only when NodeTool's
 *   own provider listing recognizes it.
 * - `catalog` — the model's normalized name matched a model the provider
 *   enumerates in NodeTool. It prices the model, not one endpoint variant, so
 *   sibling task endpoints share the number.
 */
export type GenspendMatch =
  | "alias"
  | "variant"
  | "receipt"
  | "provider-id"
  | "catalog";

/**
 * One rung of a provider's published price grid, reduced to the facets a
 * calculator narrows on. GenSpend's raw `spec` prose is deliberately not
 * carried: a row that says nothing in facets prices nothing and is dropped at
 * sync time.
 */
export interface GenspendVariant {
  price_usd: number;
  /** May differ from the entry's class — e.g. a per-generation duration rung. */
  unit_class: string;
  /** "480p".."4K" for video, an image size for image models. */
  resolution?: string;
  duration_seconds?: number;
  with_audio?: boolean;
  /** True on rows that price a job with a video going in — a billing axis. */
  video_input?: boolean;
  tier?: string;
  /** The provider's own default deliverable; `unit_price` quotes this row. */
  is_base: boolean;
}

/**
 * An input-side charge, in GenSpend's semantics:
 * - `input_image` is **additive** past `free_allowance`.
 * - `input_video_second` **replaces** the generation cost with
 *   `unit_price_usd × (input + output) seconds`, scoped to `spec`'s
 *   resolution. No row for the requested resolution means decline the re-rate,
 *   never apply another rung.
 * - `per_request` is opt-in (prompt expansion, search grounding): surface it,
 *   never add it silently.
 */
export interface GenspendSurcharge {
  kind: "input_image" | "input_video_second" | "per_request";
  /** Resolution the `input_video_second` rate is scoped to. */
  spec?: string;
  unit_price_usd: number;
  free_allowance: number;
  /** What a `per_request` extra buys ("prompt expansion"). */
  label?: string;
}

/**
 * A known discrepancy GenSpend has open against an offering.
 * `quote_wrong` means the number must not be shown as a cost at all;
 * `spec_gap` means it is exact at the base spec and nowhere else. Cosmetic
 * flags are display text and are dropped at sync time.
 */
export interface GenspendDataFlag {
  kind: string;
  severity: "quote_wrong" | "spec_gap";
}

export interface GenspendPrice {
  /** The base-spec price: what one unit costs with nothing specified. */
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
  /** Quality tier the priced variant belongs to ("pro", "turbo", …), if any. */
  tier?: string;
  /** Resolution the priced variant is billed at, if the provider prices per one. */
  resolution?: string;
  /** The provider's published grid. Absent when it prices one flat number. */
  variants?: GenspendVariant[];
  surcharges?: GenspendSurcharge[];
  /**
   * The clip lengths the model is receipted for. `null` is a refusal to price
   * any duration — never read it as "no limits"; absent means none published.
   */
  clip_seconds?: { set?: number[]; min?: number; max?: number } | null;
  data_flags?: GenspendDataFlag[];
}

export interface GenspendPricingCatalog {
  /** 3 since the grid shipped; a v2 file reads fine — every new field is optional. */
  schemaVersion: number;
  source: string;
  attribution: string;
  /** When the prices last changed — an unchanged nightly run leaves it alone. */
  updatedAt: string;
  /** The upstream snapshot these prices came from; frozen with them. */
  catalogGeneratedAt: string | null;
  /** That snapshot's ETag, offered as `If-None-Match` on the next sync. */
  etag: string | null;
  catalogModels: number;
  catalogOfferings: number;
  /** NodeTool provider ids the catalog carries prices for. */
  providers: string[];
  pricedModels: number;
  prices: Record<string, GenspendPrice>;
}

export const genspendPricingCatalog =
  // SAFETY: `catalog` is the generated `genspend-pricing.json` shipped in this
  // package, written by `npm run sync:genspend` to exactly this shape and kept
  // there by `sync:genspend:check`. TypeScript infers the JSON's literal
  // types, which do not match the declared interface structurally.
  catalog as GenspendPricingCatalog;

/** The catalog price for a provider-native model id, or null when untracked. */
export function getGenspendPrice(
  provider: string | null,
  modelId: string
): GenspendPrice | null {
  if (!provider) return null;
  return genspendPricingCatalog.prices[`${provider}:${modelId}`] ?? null;
}

export default genspendPricingCatalog;
