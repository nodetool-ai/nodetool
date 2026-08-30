/**
 * Pure pre-run cost estimation for a workflow graph.
 *
 * Walks the nodes, resolves per-node unit pricing attached to node metadata
 * (`fal_unit_pricing` first, then `kie_unit_pricing`), multiplies by an expected
 * run count, and returns a {@link WorkflowCostEstimate}. Nodes without a known
 * price are still reported (cost 0, confidence "unknown") and counted, never
 * hidden — the plan-before-spend view must surface uncertainty.
 *
 * Generic nodes (e.g. `nodetool.image.TextToImage`) carry no fixed node-type
 * price — the model is chosen at runtime through a provider-model property such
 * as `model`. For those, the estimator reads the selected model id from node
 * data and prices it through the caller-supplied `getModelPrice` lookup.
 *
 * No I/O: callers supply a `getMetadata` lookup so this stays hermetic and
 * usable from web, agents, and the CLI alike.
 */

import type {
  NodeCostEstimate,
  WorkflowCostEstimate,
  CostConfidence
} from "@nodetool-ai/protocol";
import type { UnitPricing } from "./pricing-bundle.js";
import { isFiniteNumber, isObjectLike, isString } from "./type-predicates.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** FAL list price as attached to `NodeMetadata.fal_unit_pricing`. */
export interface FalUnitPricingLike extends UnitPricing {
  endpoint_id?: string;
  /** "live" means fetched from the provider this session — treated as exact. */
  source?: "live" | "bundle";
}

/** kie.ai list price as attached to `NodeMetadata.kie_unit_pricing`. */
export interface KieUnitPricingLike extends UnitPricing {
  model_id?: string;
  /** USD conversion of the credit price, when known. Preferred over credits. */
  usd_price?: number;
  source?: "live" | "bundle";
}

/** A single node property as exposed by `NodeMetadata` — only the shape read here. */
export interface NodePropertyLike {
  name?: string;
  type?: { type?: string } | null;
}

/** Minimal slice of `NodeMetadata` this estimator reads. */
export interface NodeMetadataLike {
  fal_unit_pricing?: FalUnitPricingLike | null;
  kie_unit_pricing?: KieUnitPricingLike | null;
  /** Properties, used to find a provider-model selection on generic nodes. */
  properties?: Array<NodePropertyLike | null> | null;
}

/** Price for a dynamically-selected model, as returned by `getModelPrice`. */
export interface ModelUnitPricingLike extends UnitPricing {
  source?: "live" | "bundle";
}

/** A model chosen on a node via a provider-model property (e.g. `model`). */
export interface SelectedModel {
  id: string;
  provider: string | null;
}

/**
 * What a node states about the job it is about to run, in the vocabulary the
 * price catalogs bill in. Every field is optional: a missing one is priced at
 * the model's base spec and recorded as an assumption, never guessed.
 * `extractPricingParams` (`./pricing-params.js`) reads these off node property
 * values.
 */
export interface ModelPriceParams {
  /** A resolution tier or a raw spelling of one ("720p", "1024x1024"). */
  resolution?: string;
  /** Output duration in seconds. */
  seconds?: number;
  withAudio?: boolean;
  /** Quality tier when a provider sells several under one model id. */
  tier?: string;
  referenceImages?: number;
  /** Duration of a video fed in, which some providers bill instead of output. */
  referenceVideoSeconds?: number;
  megapixels?: number;
}

/**
 * A model price computed from {@link ModelPriceParams}. `unit_price` is the
 * whole per-run figure (a per-second model comes back already multiplied by
 * its duration), so `estimated_cost = unit_price × quantity` still composes.
 */
export interface ModelParamPricingLike extends ModelUnitPricingLike {
  /** How the figure was reached: "5 s × $0.205/s at 720p". */
  breakdown?: string;
  /** What was filled in because the node did not state it. */
  assumptions?: string[];
  /** Known-missing costs — the figure is then a lower bound. */
  warnings?: string[];
  /** Set instead of a price when the catalog refuses to extrapolate. */
  declined?: string;
  /** The duration the figure was billed for, when one applied. */
  seconds?: number;
  /** The rung the figure was billed at, in the catalog's own spelling. */
  resolution?: string;
}

/**
 * A node estimate carrying the two facts the figure was reached with. They live
 * here rather than in `NodeCostEstimate` (`@nodetool-ai/protocol`) so callers
 * that render them — the editor's cost panel — read them off the estimate
 * instead of parsing them back out of `breakdown` prose.
 */
export interface NodeCostEstimateDetail extends NodeCostEstimate {
  /** Output duration the price was multiplied by, when one applied. */
  seconds?: number;
  /** Rung the price was read off ("720p", "1MP"). */
  resolution?: string;
}

/** {@link estimateWorkflowCost}'s result, with the detailed items. */
export interface WorkflowCostEstimateDetail extends WorkflowCostEstimate {
  items: NodeCostEstimateDetail[];
}

/**
 * Property `type.type` values whose value is a provider-backed model selection
 * carrying a provider + model id. Kept in sync with the web `PROVIDER_MODEL_TYPES`
 * list. Local model types (`llama_model`, `hf.*`) are excluded — they aren't
 * priced through a provider catalog.
 */
export const PROVIDER_MODEL_TYPES: ReadonlySet<string> = new Set([
  "language_model",
  "image_model",
  "embedding_model",
  "tts_model",
  "asr_model",
  "video_model"
]);

/**
 * The slice of node metadata {@link usesAiModel} reads. Structural on purpose:
 * the editor's generated `NodeMetadata` and the SDK's own registry metadata are
 * different types over the same fields, and both satisfy this.
 */
export interface AiModelNodeMetadataLike {
  type?: string;
  fal_unit_pricing?: unknown;
  kie_unit_pricing?: unknown;
  properties?: ReadonlyArray<{ type?: { type?: string } | null } | null> | null;
}

/**
 * Whether a node type runs on an AI model — it carries provider unit pricing
 * (FAL, kie) or exposes a provider-backed model property. The billable-node
 * predicate: what the cost panel lists and what a pre-run estimate walks.
 * Plain data and utility nodes answer false.
 */
export function usesAiModel(
  metadata: AiModelNodeMetadataLike | undefined | null
): boolean {
  if (!metadata) return false;
  if (metadata.fal_unit_pricing || metadata.kie_unit_pricing) return true;
  return (metadata.properties ?? []).some((property) => {
    const propType = property?.type?.type;
    return propType ? PROVIDER_MODEL_TYPES.has(propType) : false;
  });
}

/**
 * Property names that multiply a node's output count (fan-out), most specific
 * first — the first one present with a usable value wins. Counted over the
 * generator manifests: `num_images` (280 FAL endpoints), `num_outputs` (33
 * Replicate models), plus `num_samples` and `batch_size` on both. `num_frames`
 * is deliberately absent: it sets the length of one video, not a batch.
 */
const FAN_OUT_PROPERTIES = [
  "num_images",
  "num_outputs",
  "num_samples",
  "batch_size"
] as const;

/**
 * How many outputs a node is expected to produce, from its property values.
 * Conservative: an absent or unreadable count is one output, so an estimate
 * never over-counts a fan-out nobody asked for.
 */
export function nodeExpectedQuantity(
  values: Record<string, unknown> | undefined | null
): number {
  if (!values) return 1;
  for (const name of FAN_OUT_PROPERTIES) {
    const value = values[name];
    if (isFiniteNumber(value) && value > 0) return Math.floor(value);
  }
  return 1;
}

export interface CostEstimateInput {
  nodes: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
  /** Look up metadata (which may carry fal_unit_pricing / kie_unit_pricing) for a node type. */
  getMetadata: (nodeType: string) => NodeMetadataLike | undefined;
  /**
   * Optional lookup of unit pricing for a model selected on a generic node's
   * provider-model property. Returns `null`/`undefined` when the model is
   * unknown. Without it, generic nodes stay "unknown".
   */
  getModelPrice?: (
    model: SelectedModel,
    params?: ModelPriceParams
  ) => ModelParamPricingLike | null | undefined;
  /**
   * Optional per-node read of what the node states about its job (duration,
   * resolution, audio). Supplied by the caller so this stays hermetic; the
   * result is handed to `getModelPrice`.
   */
  getParams?: (node: {
    id: string;
    type: string;
    data?: Record<string, unknown>;
  }) => ModelPriceParams | undefined;
  /** Optional per-node expected run count (fan-out). Defaults to 1. */
  quantities?: Record<string, number>;
  /**
   * Explicitly identifies graph plumbing or local utility nodes known not to
   * create a billable provider request. Excluded nodes do not become
   * misleading unknown-cost items.
   */
  isKnownNonBillable?: (node: {
    id: string;
    type: string;
    data?: Record<string, unknown>;
  }) => boolean;
  currency?: string;
}

const DEFAULT_CURRENCY = "USD";

function positiveQuantity(value: number | undefined): number {
  return isFiniteNumber(value) && value > 0 ? value : 1;
}

function confidenceFromSource(
  source: "live" | "bundle" | undefined
): CostConfidence {
  return source === "live" ? "exact" : "estimate";
}

interface ResolvedPrice {
  provider: string;
  model: string | null;
  unitPrice: number;
  billingUnit: string;
  confidence: CostConfidence;
  breakdown?: string;
  assumptions?: string[];
  warnings?: string[];
  seconds?: number;
  resolution?: string;
}

function isVagueBillingUnit(unit: string): boolean {
  return /\bunits?\b|\bcredits?\b/i.test(unit.trim());
}

/**
 * The model selected on a generic node, read from the value of its first
 * provider-model property (e.g. `model` on TextToImage). Returns null when the
 * node exposes no such property or nothing is selected.
 */
function selectedModel(
  metadata: NodeMetadataLike | undefined,
  data: Record<string, unknown> | undefined
): SelectedModel | null {
  if (!data) return null;
  const properties = metadata?.properties;
  if (!properties) return null;

  for (const property of properties) {
    const propType = property?.type?.type;
    const name = property?.name;
    if (!name || !propType || !PROVIDER_MODEL_TYPES.has(propType)) {
      continue;
    }
    const value = data[name];
    if (isObjectLike(value)) {
      const id = (value as { id?: unknown }).id;
      if (isString(id) && id.trim() !== "") {
        const provider = (value as { provider?: unknown }).provider;
        return {
          id,
          provider: isString(provider) ? provider : null
        };
      }
    }
  }

  return null;
}

/**
 * Resolve a node's unit price. Node-type metadata pricing wins (FAL, then kie);
 * for generic nodes that carry none, fall back to the model chosen on a
 * provider-model property, priced through `getModelPrice`.
 */
function resolvePrice(
  metadata: NodeMetadataLike | undefined,
  data: Record<string, unknown> | undefined,
  getModelPrice: CostEstimateInput["getModelPrice"],
  params?: ModelPriceParams
): ResolvedPrice | null {
  const fal = metadata?.fal_unit_pricing;
  if (fal && Number.isFinite(fal.unit_price)) {
    if (isVagueBillingUnit(fal.billing_unit)) {
      return null;
    }
    return {
      provider: "fal",
      model: fal.endpoint_id ?? null,
      unitPrice: fal.unit_price,
      billingUnit: fal.billing_unit,
      confidence: confidenceFromSource(fal.source)
    };
  }

  const kie = metadata?.kie_unit_pricing;
  if (kie) {
    // Only the USD conversion enters the total. A raw credit price has no
    // fixed USD value, so folding it in would corrupt the sum — without
    // usd_price the node is reported but stays "unknown" (cost 0).
    const usd = kie.usd_price;
    if (isFiniteNumber(usd)) {
      return {
        provider: "kie",
        model: kie.model_id ?? null,
        unitPrice: usd,
        billingUnit: kie.billing_unit,
        confidence: confidenceFromSource(kie.source)
      };
    }
  }

  if (getModelPrice) {
    const model = selectedModel(metadata, data);
    if (model) {
      const price = getModelPrice(model, params);
      if (price?.declined) {
        // A refusal to extrapolate is a reason, not a price: report it where a
        // user can act on it instead of dropping the node into silent unknown.
        return {
          provider: model.provider ?? "model",
          model: model.id,
          unitPrice: 0,
          billingUnit: "",
          confidence: "unknown",
          assumptions: [price.declined],
          warnings: price.warnings
        };
      }
      // A price billed in "units" or "credits" has no fixed currency value —
      // summing it would corrupt the total, so the node stays unknown.
      if (
        price &&
        Number.isFinite(price.unit_price) &&
        !isVagueBillingUnit(price.billing_unit)
      ) {
        return {
          provider: model.provider ?? "model",
          model: model.id,
          unitPrice: price.unit_price,
          billingUnit: price.billing_unit,
          confidence: confidenceFromSource(price.source),
          breakdown: price.breakdown,
          assumptions: price.assumptions,
          warnings: price.warnings,
          seconds: price.seconds,
          resolution: price.resolution
        };
      }
    }
  }

  return null;
}

export function estimateWorkflowCost(
  input: CostEstimateInput
): WorkflowCostEstimateDetail {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const quantities = input.quantities ?? {};

  const items: NodeCostEstimateDetail[] = [];
  let total = 0;
  let unknownCount = 0;

  for (const node of input.nodes) {
    if (input.isKnownNonBillable?.(node)) {
      continue;
    }
    const quantity = positiveQuantity(quantities[node.id]);
    const price = resolvePrice(
      input.getMetadata(node.type),
      node.data,
      input.getModelPrice,
      input.getParams?.(node)
    );

    if (!price || price.confidence === "unknown") {
      type UnknownItemFields = Mutable<NodeCostEstimateDetail>;
      const unknownItem: UnknownItemFields = {
        node_id: node.id,
        node_type: node.type,
        provider: price?.provider ?? null,
        model: price?.model ?? null,
        quantity,
        estimated_cost: 0,
        confidence: "unknown"
      };
      if (price?.assumptions) {
        unknownItem.assumptions = price.assumptions;
      }
      if (price?.warnings) {
        unknownItem.warnings = price.warnings;
      }
      items.push(unknownItem);
      unknownCount += 1;
      continue;
    }

    const estimatedCost = price.unitPrice * quantity;
    total += estimatedCost;
    type ItemFields = Mutable<NodeCostEstimateDetail>;
    const item: ItemFields = {
      node_id: node.id,
      node_type: node.type,
      provider: price.provider,
      model: price.model,
      unit_price: price.unitPrice,
      billing_unit: price.billingUnit,
      quantity,
      estimated_cost: estimatedCost,
      confidence: price.confidence
    };
    if (price.breakdown) {
      item.breakdown = price.breakdown;
    }
    if (price.assumptions) {
      item.assumptions = price.assumptions;
    }
    if (price.warnings) {
      item.warnings = price.warnings;
    }
    if (price.seconds !== undefined) {
      item.seconds = price.seconds;
    }
    if (price.resolution !== undefined) {
      item.resolution = price.resolution;
    }
    items.push(item);
  }

  return { currency, total, items, unknown_count: unknownCount };
}
