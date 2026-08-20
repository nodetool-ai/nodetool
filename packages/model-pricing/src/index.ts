/**
 * Look up a unit price for a model chosen on a generic node's provider-model
 * property (e.g. `model` on `nodetool.image.TextToImage`). The model id matches
 * the endpoint/model key in the codegen pricing catalogs: FAL is keyed by
 * `endpoint_id` (e.g. `fal-ai/flux/schnell`), kie by `model_id`. Returns a
 * bundle-sourced price, or null when the model isn't in either catalog.
 *
 * Models in neither catalog fall back to the GenSpend catalog
 * (`genspend-catalog.ts`), refreshed nightly from genspend.io. That covers
 * every provider NodeTool can run and GenSpend tracks — Replicate, AtlasCloud,
 * Together, Gemini, OpenAI, MiniMax, ElevenLabs, and any FAL or kie model their
 * own catalogs predate. FAL and kie stay ahead of it because those catalogs
 * come from the provider itself, so a run is gated on the provider's own number
 * wherever one exists.
 *
 * Shared on purpose: the web cost preview and the server-side pre-run budget
 * estimate (`estimateRunCost`) both call this, so a run is gated on the same
 * number the editor shows. The catalogs are imported as modules, not read from
 * disk, so the estimate works identically in the browser bundle and inside the
 * packaged Electron backend (no `PACKAGE_RUNTIME_ASSETS` entry needed).
 */

import type {
  ModelPriceParams,
  ModelUnitPricingLike,
  SelectedModel
} from "@nodetool-ai/node-sdk/cost-estimate";
import { priceGenspendEntry, type ModelParamPrice } from "./genspend-calc.js";
import falUnitPricingCatalog from "@nodetool-ai/fal-nodes/unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool-ai/kie-nodes/unit-pricing-catalog";
import { getGenspendPrice, GENSPEND_CURRENCY } from "./genspend-catalog.js";
import { resolveNodetoolDelegate } from "@nodetool-ai/protocol";

interface CatalogPrice {
  unit_price?: unknown;
  billing_unit?: unknown;
  currency?: unknown;
  usd_price?: unknown;
}

/**
 * Whether a catalog field arrived as a real number. Generic in the caller's
 * type so it narrows the row's `unknown` fields in place, rather than taking
 * bare `unknown` and handing back a value that lost its origin.
 */
function isFiniteNumber<T>(value: T): value is T & number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Whether a catalog field arrived as text. */
function isText<T>(value: T): value is T & string {
  return typeof value === "string";
}

/**
 * Endpoints whose catalog id is a prefix of the ids NodeTool offers: the FAL
 * provider expands Topaz's `model` enum into one selectable model per variant
 * (`fal-ai/topaz/upscale/image/Redefine`), while the generated catalog is keyed
 * by the endpoint FAL bills — which prices every variant the same. Without this
 * the variants would come back unpriced, so a run of one would skip the budget
 * gate the single entry used to be gated by.
 */
const FAL_VARIANT_ENDPOINTS = [
  "fal-ai/topaz/upscale/image",
  "fal-ai/topaz/upscale/video"
];

/** The catalog key for a model id, folding a variant back onto its endpoint. */
function falPricingKey(modelId: string): string {
  return (
    FAL_VARIANT_ENDPOINTS.find((e) => modelId.startsWith(`${e}/`)) ?? modelId
  );
}

function falPrice(modelId: string): ModelUnitPricingLike | null {
  const prices = falUnitPricingCatalog.prices;
  // SAFETY: the FAL catalog is generated JSON shipped with the package, so its
  // rows have no declared field types here; every field is checked below
  // before it becomes a price.
  const entry = (prices?.[modelId] ??
    prices?.[falPricingKey(modelId)]) as CatalogPrice | undefined;
  if (!entry) return null;
  if (!isFiniteNumber(entry.unit_price)) return null;
  return {
    unit_price: entry.unit_price,
    billing_unit: isText(entry.billing_unit) ? entry.billing_unit : "",
    currency: isText(entry.currency) ? entry.currency : "USD",
    source: "bundle"
  };
}

function kiePrice(modelId: string): ModelUnitPricingLike | null {
  // SAFETY: as in `falPrice` — generated JSON with no declared field types,
  // checked field by field below.
  const entry = kieUnitPricingCatalog.prices?.[modelId] as
    | CatalogPrice
    | undefined;
  if (!entry) return null;
  // Only the USD conversion is a real price; a raw credit figure has no fixed
  // USD value, so skip the model when it's absent.
  if (!isFiniteNumber(entry.usd_price)) return null;
  return {
    unit_price: entry.usd_price,
    billing_unit: isText(entry.billing_unit) ? entry.billing_unit : "",
    currency: "USD",
    source: "bundle"
  };
}

function genspendPrice(
  model: SelectedModel,
  params?: ModelPriceParams
): ModelParamPrice | null {
  const entry = getGenspendPrice(model.provider, model.id);
  if (!entry) return null;
  // With parameters in hand the catalog's grid decides the rung, the duration
  // multiplication, and the surcharges. Without them the base-spec scalar is
  // the answer, exactly as before.
  if (params) return priceGenspendEntry(entry, params);
  return {
    unit_price: entry.unit_price,
    billing_unit: entry.billing_unit,
    currency: GENSPEND_CURRENCY,
    source: "bundle"
  };
}

/**
 * The unit price for a selected model. With `params` — what the node states
 * about the job (duration, resolution, audio) — a GenSpend-priced model is
 * priced off its published grid and `unit_price` comes back as the whole
 * per-run figure, with the reasoning attached. Without `params` the answer is
 * byte-identical to what it has always been.
 *
 * The FAL and kie catalogs stay parameter-unaware for now: they carry the same
 * per-second defect, from a different generator, and are a follow-up. They keep
 * winning the lookup order, because those numbers come from the provider.
 */
export function getModelUnitPrice(
  model: SelectedModel,
  params?: ModelPriceParams
): ModelParamPrice | null {
  // NodeTool's managed models price at their delegate's rate: translate the
  // curated id to the underlying provider+model before the catalog lookups,
  // so credit estimates for the metered provider are real numbers.
  if (model.provider === "nodetool") {
    const delegate = resolveNodetoolDelegate(model.id);
    if (!delegate) return null;
    return getModelUnitPrice(
      { id: delegate.model, provider: delegate.provider },
      params
    );
  }
  return falPrice(model.id) ?? kiePrice(model.id) ?? genspendPrice(model, params);
}

export { priceGenspendEntry, normalizeResolution } from "./genspend-calc.js";
export type { ModelParamPrice } from "./genspend-calc.js";

export {
  modelRankings,
  buildRankingsIndex,
  getModelRank,
  getCanonicalId,
  routesFor,
  rankedForTask
} from "./model-rankings.js";
export type {
  ModelRankingsArtifact,
  RankedModelEntry,
  TaskRank,
  ModelRoute,
  RankedRoute,
  RankedTaskEntry,
  RankingsIndex
} from "./model-rankings.js";

export default getModelUnitPrice;
