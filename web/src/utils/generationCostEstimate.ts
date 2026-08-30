/**
 * List price of one direct generation, priced from what the surface states
 * about the job rather than from a graph.
 *
 * The timeline's clips and the sketch's layers both carry the same fields a
 * media generation is configured with — a provider/model pair, an output size,
 * a duration — so both price through this one function, and through the same
 * `getModelUnitPrice` the editor's cost panel and the server's pre-run budget
 * gate use. A per-second video model therefore prices the clip that is about to
 * be generated, not one second of it.
 *
 * Returns null whenever a figure would be invented: no model picked, no catalog
 * entry, or a catalog that refuses to extrapolate (a rung the provider does not
 * publish, a unit with no fixed value per run). Showing nothing beats showing a
 * number the run will not match.
 */

import { formatUsd, getModelUnitPrice } from "@nodetool-ai/model-pricing";
import type { ModelPriceParams } from "@nodetool-ai/node-sdk/cost-estimate";
import {
  resolveImageSize,
  type ImageResolution
} from "../stores/MediaGenerationStore";

/** What a surface states about the generation it is about to start. */
export interface GenerationSpec {
  /** "image" prices a still, "video" a clip, "audio" a spoken take. */
  kind: "image" | "video" | "audio";
  provider?: string | null;
  model?: string | null;
  /** The rung in the catalog's own spelling: "1K", "720p". */
  resolution?: string | null;
  aspectRatio?: string | null;
  /** Output pixel size, when the surface stores it (images). */
  width?: number | null;
  height?: number | null;
  /** Output length in seconds (video). */
  seconds?: number | null;
  /** How many outputs one press buys. Defaults to 1. */
  quantity?: number;
}

export interface GenerationCostEstimate {
  /** The whole run, fan-out included: "$0.42". */
  label: string;
  total: number;
  /** How many outputs the price covers. */
  quantity: number;
  /** How the figure was reached: "10 s × $0.14/s at 1080p". */
  breakdown?: string;
  /** What the catalog filled in because the surface states nothing about it. */
  assumptions?: string[];
  /** Known-missing costs — the figure is then a lower bound. */
  warnings?: string[];
}

/** The megapixels the job will produce, from its size or its size preset. */
function megapixelsFor(spec: GenerationSpec): number | undefined {
  if (spec.width && spec.height) {
    return Math.round(((spec.width * spec.height) / 1_000_000) * 100) / 100;
  }
  if (!spec.resolution || !spec.aspectRatio) {
    return undefined;
  }
  const { width, height } = resolveImageSize(
    spec.resolution as ImageResolution,
    spec.aspectRatio
  );
  return Math.round(((width * height) / 1_000_000) * 100) / 100;
}

/** The price parameters for a spec, in the vocabulary the catalogs bill in. */
function priceParams(spec: GenerationSpec): ModelPriceParams {
  if (spec.kind === "audio") {
    return {};
  }
  const params: ModelPriceParams = {};
  if (spec.resolution) {
    params.resolution = spec.resolution;
  }
  if (spec.kind === "video") {
    if (spec.seconds != null && spec.seconds > 0) {
      params.seconds = spec.seconds;
    }
    return params;
  }
  const megapixels = megapixelsFor(spec);
  if (megapixels != null) {
    params.megapixels = megapixels;
  }
  return params;
}

export function estimateGenerationCost(
  spec: GenerationSpec
): GenerationCostEstimate | null {
  if (!spec.model) {
    return null;
  }
  const quantity = spec.quantity ?? 1;
  const price = getModelUnitPrice(
    { id: spec.model, provider: spec.provider ?? null },
    priceParams(spec)
  );
  if (!price || price.declined || !Number.isFinite(price.unit_price)) {
    return null;
  }
  const total = price.unit_price * quantity;
  if (!(total > 0)) {
    return null;
  }
  return {
    label: formatUsd(total),
    total,
    quantity,
    breakdown: price.breakdown,
    assumptions: price.assumptions,
    warnings: price.warnings
  };
}

export default estimateGenerationCost;
