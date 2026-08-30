/**
 * Look up a unit price for a model chosen on a generic node's provider-model
 * property (e.g. `model` on `nodetool.image.TextToImage`), given what the node
 * states about the job. Three catalogs answer, in this order:
 *
 * - The GenSpend catalog (`genspend-catalog.ts`, refreshed nightly from
 *   genspend.io) whenever it carries a *parameter-priceable* entry for the
 *   model — a published grid, or a per-second class the duration multiplies.
 *   That is the only catalog whose rows say what a rung costs, so it prices
 *   the run rather than one unit of it.
 * - The FAL (`endpoint_id`) and kie (`model_id`) codegen catalogs otherwise,
 *   with their one scalar per endpoint converted to a per-run figure here.
 * - The GenSpend base-spec scalar last, for a flat entry with no grid.
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
import {
  formatUsd,
  isParameterPriceable,
  priceGenspendEntry,
  type ModelParamPrice
} from "./genspend-calc.js";
import falUnitPricingCatalog from "@nodetool-ai/fal-nodes/unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool-ai/kie-nodes/unit-pricing-catalog";
import { getGenspendPrice, GENSPEND_CURRENCY } from "./genspend-catalog.js";
import { resolveNodetoolDelegate } from "@nodetool-ai/protocol";

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

/** The trimmed, lower-cased billing unit — rows ship `"1000 characters "`. */
function unitKey(billingUnit: string): string {
  return billingUnit.trim().toLowerCase();
}

/** Units whose figure is one second of output. */
const PER_SECOND_UNITS = new Set(["second", "seconds"]);

/**
 * Units carrying no fixed amount of anything: a credit has no USD value here,
 * and a bare count names no deliverable. Priced as a per-run figure they would
 * read as a real number, so the caller is told why there is none.
 */
const UNCONVERTIBLE_UNITS = new Set(["", "unit", "units", "credit", "credits"]);

/** `"5 seconds"`, `"30 seconds"`, `"16 frames"` — a block of N somethings. */
const BLOCK_UNIT = /^(\d+(?:\.\d+)?) (.+)$/;

/**
 * Turn a provider-catalog scalar into a per-run figure for the stated job.
 * A per-second scalar times the duration; a block unit times the number of
 * blocks the duration needs. Everything else is already a per-run price, and a
 * unit we cannot convert declines rather than passing off a per-unit number as
 * the cost of a run.
 */
function priceScalar(
  scalar: ScalarPrice,
  params: ModelPriceParams | undefined
): ModelParamPrice {
  const { price } = scalar;
  const unit = unitKey(price.billing_unit);
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (scalar.tierCount !== undefined && scalar.tierCount > 1) {
    warnings.push(
      `this model publishes ${scalar.tierCount} priced tiers and the catalog carries only the cheapest — the figure is a lower bound`
    );
  }

  const attach = (result: ModelParamPrice): ModelParamPrice => {
    if (assumptions.length > 0) result.assumptions = assumptions;
    if (warnings.length > 0) result.warnings = warnings;
    return result;
  };

  if (UNCONVERTIBLE_UNITS.has(unit)) {
    return {
      unit_price: 0,
      billing_unit: price.billing_unit,
      currency: price.currency,
      source: price.source,
      declined: `the catalog prices this model per "${
        price.billing_unit.trim() || "unit"
      }", which has no fixed value per run`
    };
  }

  const seconds =
    params?.seconds !== undefined &&
    Number.isFinite(params.seconds) &&
    params.seconds > 0
      ? params.seconds
      : null;

  if (PER_SECOND_UNITS.has(unit)) {
    if (seconds === null) {
      assumptions.push(
        "duration not set on the node — priced at 1 s of output"
      );
      return attach({
        ...price,
        breakdown: `1 s × ${formatUsd(price.unit_price)}/s`,
        seconds: 1
      });
    }
    return attach({
      ...price,
      unit_price: price.unit_price * seconds,
      breakdown: `${seconds} s × ${formatUsd(price.unit_price)}/s`,
      seconds
    });
  }

  const block = BLOCK_UNIT.exec(unit);
  if (block) {
    const size = Number(block[1]);
    const noun = block[2];
    if (PER_SECOND_UNITS.has(noun) && size > 0) {
      if (seconds === null) {
        assumptions.push(
          `duration not set on the node — priced at one ${size}-second block`
        );
        return attach({ ...price, seconds: size });
      }
      const blocks = Math.ceil(seconds / size);
      return attach({
        ...price,
        unit_price: price.unit_price * blocks,
        breakdown: `${blocks} × ${size} s block${
          blocks === 1 ? "" : "s"
        } × ${formatUsd(price.unit_price)} (${seconds} s of output)`,
        seconds
      });
    }
    return {
      unit_price: 0,
      billing_unit: price.billing_unit,
      currency: price.currency,
      source: price.source,
      declined: `the catalog prices this model per "${price.billing_unit.trim()}", which the node states nothing about`
    };
  }

  return attach({ ...price });
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
  const grid = entry !== null && isParameterPriceable(entry);
  if (entry && grid) {
    return priceGenspendEntry(entry, params ?? {});
  }

  const scalar = falPrice(model.id) ?? kiePrice(model.id);
  if (scalar) return priceScalar(scalar, params);

  if (entry) {
    // A flat GenSpend entry: one number per generation, nothing to narrow.
    return {
      unit_price: entry.unit_price,
      billing_unit: entry.billing_unit,
      currency: GENSPEND_CURRENCY,
      source: "bundle"
    };
  }
  return null;
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
