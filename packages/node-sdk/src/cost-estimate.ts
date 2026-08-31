/**
 * Pure pre-run cost estimation for a workflow graph.
 *
 * Walks the nodes, resolves per-node unit pricing attached to node metadata
 * (`fal_unit_pricing` first, then `kie_unit_pricing`) — or, where the model
 * catalogs publish a grid for the same endpoint, off that grid — multiplies by
 * an expected run count, and returns a {@link WorkflowCostEstimate}. Nodes without a known
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
  /** The node's registered display name ("Image To Video"). */
  title?: string | null;
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
  /** Characters of text a speech job will synthesize. */
  characters?: number;
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
  /** The text length the figure was billed for, when one applied. */
  characters?: number;
  /**
   * The figure came off a published grid row, so it moves with the resolution,
   * duration and audio state the node states. A flat rate leaves it unset.
   */
  fromGrid?: boolean;
}

/* -------------------------------------------------------------------------
 * Scalar catalog prices
 * ---------------------------------------------------------------------- */

/** The trimmed, lower-cased billing unit — rows ship `"1000 characters "`. */
function unitKey(billingUnit: string): string {
  return billingUnit.trim().toLowerCase();
}

/** Units whose figure is one second of output. */
const PER_SECOND_UNITS = new Set(["second", "seconds"]);

/** Units whose figure is one minute of output. */
const PER_MINUTE_UNITS = new Set(["minute", "minutes"]);

/** Units whose figure is one megapixel of the image produced. */
const PER_MEGAPIXEL_UNITS = new Set([
  "megapixels",
  "megapixel",
  "processed megapixels",
  "processed megapixel"
]);

/**
 * Units carrying no fixed amount of anything: a credit has no USD value here,
 * and a bare count names no deliverable. Priced as a per-run figure they would
 * read as a real number, so the caller is told why there is none.
 *
 * Reading `"units"` as one run is the obvious-looking shortcut, and it is
 * wrong. Measured over the 56 FAL image/video/audio endpoints billed this way
 * (2026-08-31), the figure spans $0.001 to $1.50 — 1,500× — and the two ends
 * cannot both be a run: `fal-ai/minimax/hailuo-2.3/standard/image-to-video` at
 * $0.28 reads as a video, `bytedance/seedance-2.0/image-to-video` at $0.014
 * does not, and `krea/v2/large/text-to-image` at $0.001 is a fraction of a
 * cent for an image GenSpend prices at $0.06. The unit means something
 * different per endpoint, and FAL does not say what: its pricing API
 * (`https://api.fal.ai/v1/models/pricing`) returns exactly `endpoint_id`,
 * `unit_price`, `unit` and `currency` per row — no grid, no variants, no
 * per-parameter breakdown — so there is nothing further to read there either.
 *
 * The route that does work is GenSpend: since a scalar decline stopped hiding
 * a GenSpend entry for the same model, any of these endpoints GenSpend prices
 * under `fal_ai` already resolves that way. None of the 248 endpoints
 * currently declining on an ambiguous or unstated unit carries one, so that
 * path is exhausted rather than unexplored — they are upstream gaps in
 * GenSpend's FAL coverage, and they close when GenSpend adds the model, not
 * when this set is loosened.
 */
const UNCONVERTIBLE_UNITS = new Set(["", "unit", "units", "credit", "credits"]);

/**
 * Rates over something the node states nothing about: wall-clock time on FAL's
 * machines, the length of an *input* it has not been given, training steps,
 * tokens. Multiplying them by anything would be an invention, and reporting the
 * rate as a run understates it by however many units the job really takes.
 */
const UNSTATED_RATE_UNITS = new Set([
  "compute second",
  "compute seconds",
  "input second",
  "input seconds",
  "step",
  "steps",
  "train unit",
  "train units",
  "1m tokens",
  // GenSpend's own spelling. A speech model billed per token bills the audio
  // tokens it produced, which no caller states — pricing it off the text would
  // be a guess dressed as a quote.
  "1m_tokens",
  "1k_tokens"
]);

/**
 * Units billing a block of synthesized characters, and how many characters one
 * unit price covers. Speech models publish this as `1m_chars` (GenSpend) or as
 * a block spelling the {@link BLOCK_UNIT} branch reads (`"1000 characters"`).
 * Left unconverted, ElevenLabs' $100-per-million read as $100 a line.
 */
const CHARACTER_BLOCK_UNITS = new Map<string, number>([
  ["character", 1],
  ["characters", 1],
  ["char", 1],
  ["chars", 1],
  ["1k_chars", 1_000],
  ["1m_chars", 1_000_000]
]);

/** Nouns the block branch prices as characters: `"1000 characters"`. */
const CHARACTER_NOUNS = new Set(["character", "characters", "char", "chars"]);

/** How a block of `size` characters is named in a breakdown. */
function characterBlockLabel(size: number): string {
  if (size >= 1_000_000) return `${size / 1_000_000}M chars`;
  if (size >= 1_000) return `${size / 1_000}K chars`;
  return size === 1 ? "char" : `${size} chars`;
}

/** `"5 seconds"`, `"30 seconds"`, `"16 frames"` — a block of N somethings. */
const BLOCK_UNIT = /^(\d+(?:\.\d+)?) (.+)$/;

const trimZeros = (text: string): string =>
  text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;

/**
 * A price as text. Sub-cent figures get as many decimal places as they need:
 * `String(3e-7)` is `3e-7`, and a breakdown reading "$3e-7/s" is unreadable.
 */
export const formatUsd = (usd: number): string => {
  if (!Number.isFinite(usd)) return "$0";
  if (usd >= 0.01) return `$${trimZeros(usd.toFixed(3))}`;
  if (usd <= 0) return "$0";
  const places = Math.min(12, Math.ceil(-Math.log10(usd)) + 2);
  return `$${trimZeros(usd.toFixed(places))}`;
};

/** Extra facts a catalog row states about its own fidelity. */
export interface ScalarPriceOptions {
  /** >1 means the figure is the cheapest of several published tiers. */
  tierCount?: number;
}

/**
 * A character-billed scalar times the text the job will synthesize.
 *
 * Declines when no text length was stated: a per-character rate says nothing
 * about a run on its own, and reporting the block price as the run's cost
 * overstates one line of dialogue by four or five orders of magnitude.
 */
function priceCharacters(
  price: ModelUnitPricingLike,
  blockSize: number,
  characters: number | null,
  decline: (reason: string) => ModelParamPricingLike,
  attach: (result: ModelParamPricingLike) => ModelParamPricingLike
): ModelParamPricingLike {
  const label = characterBlockLabel(blockSize);
  if (characters === null) {
    return decline(
      `the catalog prices this model per ${label}, and no text length was given`
    );
  }
  return attach({
    ...price,
    unit_price: (price.unit_price * characters) / blockSize,
    breakdown: `${characters} chars × ${formatUsd(price.unit_price)}/${label}`,
    characters
  });
}

/**
 * Turn a catalog scalar into a per-run figure for the stated job.
 *
 * A per-second, per-minute or per-megapixel scalar times what the node states;
 * a block unit times the number of blocks the duration needs. Everything else
 * is already a per-run price, and a unit we cannot convert — one with no fixed
 * value (credits) or a rate over something the node never states (compute
 * seconds, training steps) — declines rather than passing off a per-unit number
 * as the cost of a run.
 *
 * Every catalog scalar goes through here: the FAL/kie rows
 * `@nodetool-ai/model-pricing` looks a selected model up in, and the same rows
 * attached to node metadata as `fal_unit_pricing`. A 10-second clip on a
 * $0.14/second endpoint costs $1.40 whichever of the two answered.
 */
export function priceScalarUnit(
  price: ModelUnitPricingLike,
  params?: ModelPriceParams,
  options?: ScalarPriceOptions
): ModelParamPricingLike {
  const unit = unitKey(price.billing_unit);
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (options?.tierCount !== undefined && options.tierCount > 1) {
    warnings.push(
      `this model publishes ${options.tierCount} priced tiers and the catalog carries only the cheapest — the figure is a lower bound`
    );
  }

  const attach = (result: ModelParamPricingLike): ModelParamPricingLike => {
    if (assumptions.length > 0) result.assumptions = assumptions;
    if (warnings.length > 0) result.warnings = warnings;
    return result;
  };

  const decline = (reason: string): ModelParamPricingLike =>
    attach({
      unit_price: 0,
      billing_unit: price.billing_unit,
      currency: price.currency,
      source: price.source,
      declined: reason
    });

  if (UNCONVERTIBLE_UNITS.has(unit)) {
    return decline(
      `the catalog prices this model per "${
        price.billing_unit.trim() || "unit"
      }", which has no fixed value per run`
    );
  }
  if (UNSTATED_RATE_UNITS.has(unit)) {
    return decline(
      `the catalog prices this model per "${price.billing_unit.trim()}", which the node states nothing about`
    );
  }

  const seconds =
    params?.seconds !== undefined &&
    Number.isFinite(params.seconds) &&
    params.seconds > 0
      ? params.seconds
      : null;

  if (PER_SECOND_UNITS.has(unit)) {
    if (seconds === null) {
      assumptions.push("duration not set on the node — priced at 1 s of output");
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

  if (PER_MINUTE_UNITS.has(unit)) {
    if (seconds === null) {
      assumptions.push(
        "duration not set on the node — priced at one minute of output"
      );
      return attach({
        ...price,
        breakdown: `1 min × ${formatUsd(price.unit_price)}/min`,
        seconds: 60
      });
    }
    return attach({
      ...price,
      unit_price: (price.unit_price * seconds) / 60,
      breakdown: `${seconds} s × ${formatUsd(price.unit_price)}/min`,
      seconds
    });
  }

  if (PER_MEGAPIXEL_UNITS.has(unit)) {
    const megapixels =
      params?.megapixels !== undefined &&
      Number.isFinite(params.megapixels) &&
      params.megapixels > 0
        ? params.megapixels
        : null;
    if (megapixels === null) {
      assumptions.push(
        "output size not set on the node — priced at one megapixel"
      );
      return attach({
        ...price,
        breakdown: `1 MP × ${formatUsd(price.unit_price)}/MP`
      });
    }
    return attach({
      ...price,
      unit_price: price.unit_price * megapixels,
      breakdown: `${megapixels} MP × ${formatUsd(price.unit_price)}/MP`
    });
  }

  const characters =
    params?.characters !== undefined &&
    Number.isFinite(params.characters) &&
    params.characters > 0
      ? params.characters
      : null;

  const charBlock = CHARACTER_BLOCK_UNITS.get(unit);
  if (charBlock !== undefined) {
    return priceCharacters(price, charBlock, characters, decline, attach);
  }

  const block = BLOCK_UNIT.exec(unit);
  if (block) {
    const size = Number(block[1]);
    const noun = block[2];
    if (CHARACTER_NOUNS.has(noun) && size > 0) {
      return priceCharacters(price, size, characters, decline, attach);
    }
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
    return decline(
      `the catalog prices this model per "${price.billing_unit.trim()}", which the node states nothing about`
    );
  }

  return attach({ ...price });
}

/**
 * A node estimate carrying the two facts the figure was reached with. They live
 * here rather than in `NodeCostEstimate` (`@nodetool-ai/protocol`) so callers
 * that render them — the editor's cost panel — read them off the estimate
 * instead of parsing them back out of `breakdown` prose.
 */
export interface NodeCostEstimateDetail extends NodeCostEstimate {
  /**
   * What to call this node in a cost table: the title the user gave it, else
   * the node's registered title, else its class name spaced out. `node_type`
   * stays the identity — a reader who needs `nodetool.video.ImageToVideo`
   * still has it — but a column of dotted paths reads as one repeated prefix,
   * and the four `nodetool.agents.Agent` rows of a real graph are told apart
   * by their titles, not their type.
   */
  node_title?: string;
  /** Output duration the price was multiplied by, when one applied. */
  seconds?: number;
  /** Rung the price was read off ("720p", "1MP"). */
  resolution?: string;
}

/**
 * A node type's class name, spaced: `nodetool.video.ImageToVideo` → "Image To
 * Video". The last resort behind a user title and the registered metadata
 * title, for a node type whose metadata a caller could not supply.
 */
export function humanizeNodeType(nodeType: string): string {
  const leaf = nodeType.split(".").pop() ?? nodeType;
  return (
    leaf
      // `ImageToVideo` → `Image To Video`, `TextToImage2` → `Text To Image 2`,
      // `HTTPRequest` → `HTTP Request`: split before a capital that starts a
      // new word and between a letter run and a digit run.
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .trim() || nodeType
  );
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
   * Optional per-node display title, keyed by node id — the name the user gave
   * the node on the canvas. Falls back to the metadata title, then to the node
   * type's spaced class name.
   */
  titles?: Record<string, string>;
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

/** What to call a node in the table: user title, registered title, class name. */
function nodeTitle(
  userTitle: string | undefined,
  metadata: NodeMetadataLike | undefined,
  nodeType: string
): string {
  const given = userTitle?.trim();
  if (given) return given;
  const registered = metadata?.title?.trim();
  if (registered) return registered;
  return humanizeNodeType(nodeType);
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

/** Provider ids the model catalogs key FAL and kie rows by. */
const PROVIDER_FAL = "fal_ai";
const PROVIDER_KIE = "kie";

/**
 * The model catalogs' answer for an endpoint a node's own metadata prices,
 * when that answer came off a published grid — the rows that move with the
 * resolution, duration and audio state the node states.
 *
 * A flat catalog answer is not preferred over a live node-type row: freshness
 * wins when neither figure responds to the job. A grid row wins regardless,
 * because a live rate for the wrong rung is exact about the wrong number.
 */
function gridPrice(
  getModelPrice: CostEstimateInput["getModelPrice"],
  model: SelectedModel,
  params: ModelPriceParams | undefined,
  metadataSource: "live" | "bundle" | undefined
): ModelParamPricingLike | null {
  if (!getModelPrice || !model.id) return null;
  const price = getModelPrice(model, params);
  if (!price) return null;
  // A refusal travels back so the caller can say why its own row is a floor.
  if (price.declined) return price;
  if (!Number.isFinite(price.unit_price)) return null;
  if (isVagueBillingUnit(price.billing_unit)) return null;
  if (!price.fromGrid && metadataSource === "live") return null;
  return price;
}

/** The decline reason first, so the reader sees why the figure is a floor. */
function withReason(
  reason: string | undefined,
  assumptions: string[] | undefined
): string[] | undefined {
  if (!reason) return assumptions;
  return [reason, ...(assumptions ?? [])];
}

/**
 * Resolve a node's unit price. A node-type row (FAL, then kie) is asked about
 * first, but it is one number for a whole endpoint: when `getModelPrice` has a
 * published grid for the same endpoint, that grid answers instead, so the
 * figure moves with the resolution and duration the node states. A generic
 * node carrying no row at all is priced from the model chosen on its
 * provider-model property, through the same hook.
 */
function resolvePrice(
  metadata: NodeMetadataLike | undefined,
  data: Record<string, unknown> | undefined,
  getModelPrice: CostEstimateInput["getModelPrice"],
  params?: ModelPriceParams
): ResolvedPrice | null {
  const fal = metadata?.fal_unit_pricing;
  if (fal && Number.isFinite(fal.unit_price)) {
    // A node-type row is one number for the whole endpoint, so nothing the
    // user changes can move it. Ask the model catalogs for the same endpoint
    // first: they publish the resolution ladder a run really bills at.
    const graded = gridPrice(
      getModelPrice,
      { id: fal.endpoint_id ?? "", provider: PROVIDER_FAL },
      params,
      fal.source
    );
    if (graded && !graded.declined) {
      return {
        provider: "fal",
        model: fal.endpoint_id ?? null,
        unitPrice: graded.unit_price,
        billingUnit: graded.billing_unit || fal.billing_unit,
        confidence: confidenceFromSource(graded.source),
        breakdown: graded.breakdown,
        assumptions: graded.assumptions,
        warnings: graded.warnings,
        seconds: graded.seconds,
        resolution: graded.resolution
      };
    }
    if (isVagueBillingUnit(fal.billing_unit)) {
      return null;
    }
    // The catalog row is a rate, not a run: a $0.14/second endpoint costs
    // $1.40 for the 10-second clip the node asks for. Same conversion the
    // selected-model path applies, so the two agree on one endpoint.
    const priced = priceScalarUnit(fal, params);
    if (priced.declined) {
      return null;
    }
    return {
      provider: "fal",
      model: fal.endpoint_id ?? null,
      unitPrice: priced.unit_price,
      billingUnit: fal.billing_unit,
      confidence: confidenceFromSource(fal.source),
      breakdown: priced.breakdown,
      assumptions: withReason(graded?.declined, priced.assumptions),
      warnings: priced.warnings,
      seconds: priced.seconds
    };
  }

  const kie = metadata?.kie_unit_pricing;
  if (kie) {
    // Only the USD conversion enters the total. A raw credit price has no
    // fixed USD value, so folding it in would corrupt the sum — without
    // usd_price the node is reported but stays "unknown" (cost 0).
    const graded = gridPrice(
      getModelPrice,
      { id: kie.model_id ?? "", provider: PROVIDER_KIE },
      params,
      kie.source
    );
    if (graded && !graded.declined) {
      return {
        provider: "kie",
        model: kie.model_id ?? null,
        unitPrice: graded.unit_price,
        billingUnit: graded.billing_unit || kie.billing_unit,
        confidence: confidenceFromSource(graded.source),
        breakdown: graded.breakdown,
        assumptions: graded.assumptions,
        warnings: graded.warnings,
        seconds: graded.seconds,
        resolution: graded.resolution
      };
    }

    const usd = kie.usd_price;
    if (isFiniteNumber(usd)) {
      // A third of the kie rows bill per second, so the USD figure is scaled
      // the same way FAL's is. A row whose unit names credits declines the
      // conversion — its `usd_price` is already the whole run.
      const priced = priceScalarUnit(
        { ...kie, unit_price: usd, currency: "USD" },
        params
      );
      const converted = priced.declined ? null : priced;
      return {
        provider: "kie",
        model: kie.model_id ?? null,
        unitPrice: converted?.unit_price ?? usd,
        billingUnit: kie.billing_unit,
        confidence: confidenceFromSource(kie.source),
        breakdown: converted?.breakdown,
        assumptions: withReason(graded?.declined, converted?.assumptions),
        warnings: converted?.warnings,
        seconds: converted?.seconds
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
  const titles = input.titles ?? {};

  const items: NodeCostEstimateDetail[] = [];
  let total = 0;
  let unknownCount = 0;

  for (const node of input.nodes) {
    if (input.isKnownNonBillable?.(node)) {
      continue;
    }
    const quantity = positiveQuantity(quantities[node.id]);
    const metadata = input.getMetadata(node.type);
    const title = nodeTitle(titles[node.id], metadata, node.type);
    const price = resolvePrice(
      metadata,
      node.data,
      input.getModelPrice,
      input.getParams?.(node)
    );

    if (!price || price.confidence === "unknown") {
      type UnknownItemFields = Mutable<NodeCostEstimateDetail>;
      const unknownItem: UnknownItemFields = {
        node_id: node.id,
        node_type: node.type,
        node_title: title,
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
      node_title: title,
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
