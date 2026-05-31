/**
 * Estimated cost tracking for FAL nodes.
 *
 * FAL bills per endpoint in varying units (per image, per megapixel, per second
 * of video, per generation, …). The generated `fal-node-type-pricing.json` maps
 * each node type to its `unit_price` + `billing_unit`. We estimate the spend of
 * a completed call as `unit_price * quantity`, inferring `quantity` from the
 * call's output where it is observable (image dimensions, media duration, output
 * count) and otherwise treating the call as a single billable unit.
 *
 * These are estimates — surfaced as "~$" in the UI — not invoiced charges.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FalPricingEntry {
  endpoint_id: string;
  unit_price: number;
  billing_unit: string;
  currency: string;
}

export interface FalCostEstimate {
  provider: "fal";
  /** FAL endpoint id the charge applies to. */
  model: string;
  /** Estimated cost, `unit_price * quantity`, in `currency`. */
  cost: number;
  unitPrice: number;
  quantity: number;
  billingUnit: string;
  currency: string;
}

interface PricingFile {
  byNodeType?: Record<string, FalPricingEntry>;
}

function loadPricing(): Record<string, FalPricingEntry> {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const path = join(dir, "generated", "fal-node-type-pricing.json");
    const parsed = JSON.parse(readFileSync(path, "utf8")) as PricingFile;
    return parsed.byNodeType ?? {};
  } catch {
    // Pricing data is optional — without it, estimates are simply skipped.
    return {};
  }
}

const PRICING_BY_NODE_TYPE = loadPricing();

/** Look up the static pricing entry for a FAL node type. */
export function getFalPricing(nodeType: string): FalPricingEntry | null {
  return PRICING_BY_NODE_TYPE[nodeType] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Leading number of a value, tolerating unit suffixes like "8s" → 8. */
function leadingNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Total megapixels across all images in a FAL result. */
function megapixelsFromResult(res: Record<string, unknown>): number | null {
  const images = [
    ...asArray(res.images),
    ...(asRecord(res.image) ? [res.image] : [])
  ];
  let total = 0;
  for (const img of images) {
    const rec = asRecord(img);
    const w = finiteNumber(rec?.width);
    const h = finiteNumber(rec?.height);
    if (w && h) total += (w * h) / 1_000_000;
  }
  return total > 0 ? total : null;
}

/** Output media duration in seconds, from the result or the request args. */
function durationSeconds(
  res: Record<string, unknown>,
  args: Record<string, unknown>
): number | null {
  const candidates = [
    asRecord(res.video)?.duration,
    asRecord(res.audio)?.duration,
    res.duration,
    res.duration_seconds,
    args.duration,
    args.duration_seconds,
    args.seconds
  ];
  for (const c of candidates) {
    const n = leadingNumber(c);
    if (n && n > 0) return n;
  }
  return null;
}

/** Leading integer of a bucketed unit like "5 seconds" → 5. */
function bucketSize(unit: string): number {
  const n = parseInt(unit, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Infer how many billing units a completed call consumed. Falls back to 1 for
 * units that aren't observable from the output (compute seconds, tokens, …).
 */
function inferQuantity(
  billingUnit: string,
  res: Record<string, unknown>,
  args: Record<string, unknown>
): number {
  const unit = billingUnit.trim().toLowerCase();

  if (unit.includes("megapixel")) {
    return megapixelsFromResult(res) ?? 1;
  }
  if (unit === "images" || unit === "image") {
    return asArray(res.images).length || 1;
  }
  if (unit === "videos" || unit === "video") {
    return asArray(res.videos).length || 1;
  }
  if (unit === "audios" || unit === "audio") {
    return asArray(res.audios).length || 1;
  }
  // "compute seconds" is server-side compute time — not observable client-side.
  if (unit.includes("second") && !unit.includes("compute")) {
    const secs = durationSeconds(res, args);
    if (secs == null) return 1;
    return Math.max(1, Math.ceil(secs / bucketSize(unit)));
  }
  if (unit.includes("minute")) {
    const secs = durationSeconds(res, args);
    return secs == null ? 1 : Math.max(1, secs / 60);
  }
  return 1;
}

/**
 * Estimate the cost of a completed FAL call. Returns `null` when no pricing is
 * known for the node type.
 */
export function estimateFalCost(
  nodeType: string,
  res: Record<string, unknown>,
  args: Record<string, unknown> = {}
): FalCostEstimate | null {
  const pricing = getFalPricing(nodeType);
  if (!pricing) return null;

  const unitPrice = finiteNumber(pricing.unit_price);
  if (unitPrice == null) return null;

  const quantity = inferQuantity(pricing.billing_unit, res, args);
  const cost = unitPrice * quantity;

  return {
    provider: "fal",
    model: pricing.endpoint_id || nodeType,
    cost,
    unitPrice,
    quantity,
    billingUnit: pricing.billing_unit,
    currency: pricing.currency || "USD"
  };
}

type ProviderCostSetter = (
  provider: string,
  amount: number,
  unit: string,
  details?: {
    model?: string | null;
    billing_unit?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    currency?: string | null;
  }
) => void;

/**
 * Estimate and report a FAL call's cost onto the processing context, so it is
 * attached to the node's completed update and persisted by the runner. No-op
 * when pricing is unknown or the context can't receive provider costs.
 */
export function reportFalCost(
  context: unknown,
  nodeType: string,
  res: Record<string, unknown>,
  args: Record<string, unknown> = {}
): void {
  const setter = (context as { setProviderCost?: unknown } | null | undefined)
    ?.setProviderCost;
  if (typeof setter !== "function") return;

  const estimate = estimateFalCost(nodeType, res, args);
  if (!estimate) return;

  (setter as ProviderCostSetter).call(
    context,
    estimate.provider,
    estimate.cost,
    estimate.currency,
    {
      model: estimate.model,
      billing_unit: estimate.billingUnit,
      quantity: estimate.quantity,
      unit_price: estimate.unitPrice,
      currency: estimate.currency
    }
  );
}
