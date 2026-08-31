/**
 * Look up a unit price for a model chosen on a generic node's provider-model
 * property (e.g. `model` on `nodetool.image.TextToImage`), given what the node
 * states about the job. The catalogs answer in this order, and every step
 * before the last quotes the selected provider's own published price:
 *
 * - The GenSpend catalog (`genspend-catalog.ts`, refreshed nightly from
 *   genspend.io) whenever it carries a *parameter-priceable* entry for the
 *   model — a published grid, or a per-second class the duration multiplies.
 *   That is the only catalog whose rows say what a rung costs, so it prices
 *   the run rather than one unit of it.
 * - The FAL (`endpoint_id`) and kie (`model_id`) codegen catalogs otherwise,
 *   with their one scalar per endpoint converted to a per-run figure here.
 *   Those catalogs are keyed by bare endpoint id and are consulted only for
 *   their own provider: a reseller lists the vendor's id verbatim, and an
 *   unscoped lookup was quoting FAL's rate — or FAL's refusal to convert a
 *   "units" row — for models FAL does not sell.
 * - The GenSpend base-spec scalar, for a flat entry with no grid. It also
 *   answers when the provider's own scalar row cannot be converted to a run,
 *   so a model the catalog does price is never reported unpriced.
 * - Last, the same model id on a provider the catalog *does* track, since
 *   resellers reuse the vendor's id. That figure is another vendor's margin,
 *   so it comes back with an assumption naming whose rate it is and the cost
 *   views render it as "~$X" — a named borrowing beats a blank row for a node
 *   that has already stated its model, duration and resolution.
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
import { priceScalarUnit } from "@nodetool-ai/node-sdk/cost-estimate";
import {
  isParameterPriceable,
  priceGenspendEntry,
  type ModelParamPrice
} from "./genspend-calc.js";
import falUnitPricingCatalog from "@nodetool-ai/fal-nodes/unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool-ai/kie-nodes/unit-pricing-catalog";
import {
  getGenspendPrice,
  getGenspendPricesByModelId,
  GENSPEND_CURRENCY,
  type GenspendPrice
} from "./genspend-catalog.js";
import { PROVIDER_IDS, resolveNodetoolDelegate } from "@nodetool-ai/protocol";

/** Providers whose scalar catalogs this module carries, keyed by their own id. */
const PROVIDER_FAL_AI: string = PROVIDER_IDS.FAL_AI;
const PROVIDER_KIE: string = PROVIDER_IDS.KIE;

interface CatalogPrice {
  unit_price?: unknown;
  billing_unit?: unknown;
  currency?: unknown;
  usd_price?: unknown;
  /** kie only: how many published tiers the generator collapsed into one row. */
  tier_count?: unknown;
}

/** A provider-catalog scalar plus what the row says about its own fidelity. */
interface ScalarPrice {
  price: ModelUnitPricingLike;
  /** kie: >1 means the figure is the cheapest of several published tiers. */
  tierCount?: number;
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

function falPrice(modelId: string): ScalarPrice | null {
  const prices = falUnitPricingCatalog.prices;
  // SAFETY: the FAL catalog is generated JSON shipped with the package, so its
  // rows have no declared field types here; every field is checked below
  // before it becomes a price.
  const entry = (prices?.[modelId] ??
    prices?.[falPricingKey(modelId)]) as CatalogPrice | undefined;
  if (!entry) return null;
  if (!isFiniteNumber(entry.unit_price)) return null;
  return {
    price: {
      unit_price: entry.unit_price,
      billing_unit: isText(entry.billing_unit) ? entry.billing_unit : "",
      currency: isText(entry.currency) ? entry.currency : "USD",
      source: "bundle"
    }
  };
}

function kiePrice(modelId: string): ScalarPrice | null {
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
    price: {
      unit_price: entry.usd_price,
      billing_unit: isText(entry.billing_unit) ? entry.billing_unit : "",
      currency: "USD",
      source: "bundle"
    },
    tierCount: isFiniteNumber(entry.tier_count) ? entry.tier_count : undefined
  };
}

/**
 * The scalar catalog that belongs to a provider. The FAL and kie catalogs are
 * keyed by bare endpoint id, and resellers list the vendor's id verbatim, so an
 * unscoped lookup answers for models that are not theirs: an AtlasCloud
 * `google/gemini-omni-flash/image-to-video` was priced — and, because FAL bills
 * that endpoint in "units", declined — off FAL's row. A provider whose id we do
 * not know still gets the id-keyed lookup: those ids are FAL/kie-shaped and
 * nothing else can answer for them.
 */
function ownScalarPrice(model: SelectedModel): ScalarPrice | null {
  const provider = model.provider;
  if (provider === null || provider === PROVIDER_FAL_AI) {
    const fal = falPrice(model.id);
    if (fal) return fal;
  }
  if (provider === null || provider === PROVIDER_KIE) {
    return kiePrice(model.id);
  }
  return null;
}

/** A flat GenSpend entry: one number per generation, nothing to narrow. */
function flatGenspendPrice(entry: GenspendPrice): ModelParamPrice {
  return {
    unit_price: entry.unit_price,
    billing_unit: entry.billing_unit,
    currency: GENSPEND_CURRENCY,
    source: "bundle"
  };
}

/**
 * The price of the same model on a provider the catalog does track, for a
 * provider it does not.
 *
 * Resellers publish the vendor's own model id (AtlasCloud and fal both sell
 * `google/gemini-omni-flash/image-to-video`), so an untracked offering of a
 * tracked model is the common case, not a coincidence — and a node stating a
 * model, a duration and a resolution deserves a figure rather than a blank.
 * What it is not is a quote: the margin is the reseller's own, so the figure
 * comes back with an assumption naming whose rate it is, which the cost views
 * render as "~$X" rather than an exact price.
 *
 * Two guards keep it from inventing a number. The offerings must agree on a
 * unit class — a per-second rate and a per-generation rate are not comparable,
 * and picking either would be arbitrary — and the cheapest of them is quoted,
 * so a model sold at four prices reports the one that overstates least.
 */
function borrowedPrice(
  model: SelectedModel,
  params?: ModelPriceParams
): ModelParamPrice | null {
  return (
    borrowedGenspendPrice(model, params) ?? borrowedScalarPrice(model, params)
  );
}

/** {@link borrowedPrice} off a GenSpend offering of the same model id. */
function borrowedGenspendPrice(
  model: SelectedModel,
  params?: ModelPriceParams
): ModelParamPrice | null {
  if (!model.provider) return null;
  const offerings = getGenspendPricesByModelId(model.id).filter(
    (offering) => offering.provider !== model.provider
  );
  if (offerings.length === 0) return null;
  const unitClass = offerings[0].price.unit_class;
  if (offerings.some((offering) => offering.price.unit_class !== unitClass)) {
    return null;
  }
  const cheapest = offerings.reduce((best, offering) =>
    offering.price.unit_price < best.price.unit_price ? offering : best
  );

  const priced = isParameterPriceable(cheapest.price)
    ? priceGenspendEntry(cheapest.price, params ?? {})
    : flatGenspendPrice(cheapest.price);
  if (priced.declined) return priced;
  return borrowed(priced, model.provider, cheapest.provider);
}

/**
 * {@link borrowedPrice} off the FAL or kie scalar catalog, for a reseller that
 * lists the same endpoint id. Last, because those rows are one number for a
 * whole endpoint where a GenSpend offering carries the grid.
 */
function borrowedScalarPrice(
  model: SelectedModel,
  params?: ModelPriceParams
): ModelParamPrice | null {
  if (!model.provider) return null;
  const fal = falPrice(model.id);
  const scalar = fal ?? kiePrice(model.id);
  if (!scalar) return null;
  const priced = priceScalarUnit(scalar.price, params, {
    tierCount: scalar.tierCount
  });
  if (priced.declined) return priced;
  return borrowed(priced, model.provider, fal ? PROVIDER_FAL_AI : PROVIDER_KIE);
}

/** Say whose rate a figure is, when it is not the selected provider's own. */
function borrowed(
  priced: ModelParamPrice,
  provider: string,
  source: string
): ModelParamPrice {
  return {
    ...priced,
    assumptions: [
      `no published price for this model on ${provider} — priced at ${source}'s rate for the same model`,
      ...(priced.assumptions ?? [])
    ]
  };
}

/**
 * The unit price for a selected model, as the whole per-run figure with the
 * reasoning attached.
 *
 * A model GenSpend prices off a published grid — a resolution ladder, a
 * duration rung, an audio axis, an input surcharge, or a per-second class the
 * duration multiplies — is priced there, ahead of the FAL and kie catalogs.
 * Those two carry one scalar per endpoint, and for the 500-odd FAL rows billed
 * per second that scalar is a rate, not a run: reported as a price it
 * understated a 4-second clip by 40×. A kie row is the cheapest of the tiers
 * its generator collapsed, so it is a floor by construction.
 *
 * The FAL/kie scalar answers when GenSpend has nothing parameter-priceable for
 * the model, and it is made duration-aware on the way out: a per-second or
 * per-N-second unit is multiplied by the stated duration, and a unit with no
 * fixed value per run (credits, a bare count) declines rather than passing a
 * per-unit number off as the cost of a run.
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

  const entry = getGenspendPrice(model.provider, model.id);
  if (entry && isParameterPriceable(entry)) {
    return priceGenspendEntry(entry, params ?? {});
  }

  // The provider's own scalar row. A row billed in a unit that names no fixed
  // amount ("units", "credits") declines, and a decline is not a price: fall
  // through to whatever else prices this model rather than reporting the node
  // unpriced next to a catalog that does carry a number for it.
  const scalar = ownScalarPrice(model);
  if (scalar) {
    const priced = priceScalarUnit(scalar.price, params, {
      tierCount: scalar.tierCount
    });
    if (!priced.declined) return priced;
    if (entry) return flatGenspendPrice(entry);
    // Keep the refusal when nothing else can price the model: the reason it
    // carries is what the cost views show instead of a bare "unknown".
    return borrowedPrice(model, params) ?? priced;
  }

  if (entry) {
    // A flat GenSpend entry: one number per generation, nothing to narrow.
    return flatGenspendPrice(entry);
  }

  return borrowedPrice(model, params);
}

export {
  priceGenspendEntry,
  normalizeResolution,
  isParameterPriceable,
  formatUsd
} from "./genspend-calc.js";
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
