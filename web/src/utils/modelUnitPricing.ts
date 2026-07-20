/**
 * Look up a unit price for a model chosen on a generic node's provider-model
 * property (e.g. `model` on `nodetool.image.TextToImage`). The model id matches
 * the endpoint/model key in the codegen pricing catalogs: FAL is keyed by
 * `endpoint_id` (e.g. `fal-ai/flux/schnell`), kie by `model_id`. Returns a
 * bundle-sourced price, or null when the model isn't in either catalog.
 */

import type {
  ModelUnitPricingLike,
  SelectedModel
} from "@nodetool-ai/node-sdk/cost-estimate";
import falUnitPricingCatalog from "@nodetool/fal-unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool/kie-unit-pricing-catalog";

interface CatalogPrice {
  unit_price?: unknown;
  billing_unit?: unknown;
  currency?: unknown;
  usd_price?: unknown;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function falPrice(modelId: string): ModelUnitPricingLike | null {
  const prices = falUnitPricingCatalog.prices;
  const entry = prices?.[modelId] as CatalogPrice | undefined;
  if (!entry) return null;
  const unitPrice = readNumber(entry.unit_price);
  if (unitPrice === undefined) return null;
  return {
    unit_price: unitPrice,
    billing_unit: typeof entry.billing_unit === "string" ? entry.billing_unit : "",
    currency: typeof entry.currency === "string" ? entry.currency : "USD",
    source: "bundle"
  };
}

function kiePrice(modelId: string): ModelUnitPricingLike | null {
  const entry = kieUnitPricingCatalog.prices?.[modelId] as
    | CatalogPrice
    | undefined;
  if (!entry) return null;
  // Only the USD conversion is a real price; a raw credit figure has no fixed
  // USD value, so skip the model when it's absent.
  const usd = readNumber(entry.usd_price);
  if (usd === undefined) return null;
  return {
    unit_price: usd,
    billing_unit: typeof entry.billing_unit === "string" ? entry.billing_unit : "",
    currency: "USD",
    source: "bundle"
  };
}

export function getModelUnitPrice(
  model: SelectedModel
): ModelUnitPricingLike | null {
  return falPrice(model.id) ?? kiePrice(model.id);
}

export default getModelUnitPrice;
