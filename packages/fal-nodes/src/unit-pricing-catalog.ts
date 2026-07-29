/**
 * The FAL unit-price catalog written by `packages/fal-codegen`, exposed as a
 * plain module so consumers import it (and bundlers inline it) instead of
 * reading JSON off disk at runtime.
 *
 * Keyed by FAL `endpoint_id` (e.g. `fal-ai/flux/schnell`) — the same id that
 * lands on a node's provider-model property when a model is selected.
 */

import catalog from "./generated/fal-unit-pricing.json" with { type: "json" };

export interface FalUnitPricingCatalog {
  schemaVersion: number;
  writtenAt: string;
  prices?: Record<string, unknown>;
}

export const falUnitPricingCatalog: FalUnitPricingCatalog = catalog;

export default falUnitPricingCatalog;
