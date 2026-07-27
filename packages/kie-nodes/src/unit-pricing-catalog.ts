/**
 * The kie.ai unit-price catalog written by `packages/kie-codegen`, exposed as a
 * plain module so consumers import it (and bundlers inline it) instead of
 * reading JSON off disk at runtime.
 *
 * Keyed by kie `model_id` — the same id that lands on a node's provider-model
 * property when a model is selected.
 */

import catalog from "./generated/kie-unit-pricing.json" with { type: "json" };

export interface KieUnitPricingCatalog {
  schemaVersion: number;
  writtenAt: string;
  prices?: Record<string, unknown>;
}

export const kieUnitPricingCatalog: KieUnitPricingCatalog = catalog;

export default kieUnitPricingCatalog;
