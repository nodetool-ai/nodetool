/**
 * Price one step from a GenSpend catalog entry given what a node states about
 * the job: resolution, duration, audio state, reference inputs.
 *
 * Pure and I/O-free. The arithmetic is a port of `priceCase` in
 * `scripts/genspend/parity-check.mjs`, which the nightly sync asserts equals
 * `POST https://genspend.io/api/v1/quote`. Keep the two in step: a rule changed
 * here and not there ships a number nothing checks.
 *
 * Two deliberate divergences from the parity script, both product decisions the
 * plan names (a node that never set the property would otherwise show no price
 * at all, which is less useful than an honest assumption):
 *
 * - Resolution unset → the provider's base-spec row plus an assumption, where
 *   `/quote` declines a laddered offering outright.
 * - Duration unset on a per-second class → the shortest duration the model is
 *   receipted for (one second when it publishes no envelope) plus an
 *   assumption, where the parity script declines.
 *
 * Declining is a result, not an error: we never reuse another rung for a
 * resolution the provider does not publish, because understating is the
 * direction that hurts.
 */

import type {
  ModelPriceParams,
  ModelUnitPricingLike
} from "@nodetool-ai/node-sdk/cost-estimate";
import type {
  GenspendPrice,
  GenspendSurcharge,
  GenspendVariant
} from "./genspend-catalog.js";
import { GENSPEND_CURRENCY } from "./genspend-catalog.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * A price computed from stated parameters, with the reasoning that produced it.
 * `unit_price` is the whole per-run figure — a per-second class comes back
 * already multiplied by the priced duration — so `estimated_cost` stays
 * `unit_price × fan-out`.
 */
export interface ModelParamPrice extends ModelUnitPricingLike {
  /** How the figure was reached: "5 s × $0.205/s at 720p". */
  breakdown?: string;
  /** What we filled in because the node did not state it. */
  assumptions?: string[];
  /** Costs we know are missing — the figure is then a lower bound. */
  warnings?: string[];
  /** Set instead of a price when we refuse to extrapolate. */
  declined?: string;
}

/**
 * GenSpend's video ladder plus the spellings provider pages use for it, and
 * the image tiers (`1MP` is their name for 1024×1024). Both the caller's value
 * and the stored row are pushed through this, so the two always compare in one
 * vocabulary.
 */
const RESOLUTION_TIERS: Record<string, string> = {
  "360p": "360p",
  "480p": "480p",
  "540p": "480p",
  "576p": "480p",
  "720p": "720p",
  "768p": "720p",
  "1080p": "1080p",
  fhd: "1080p",
  "1440p": "2K",
  "2k": "2K",
  "2160p": "4K",
  "4k": "4K",
  // Image tiers.
  "512": "512×512",
  "512p": "512×512",
  "512x512": "512×512",
  "512×512": "512×512",
  "1k": "1MP",
  "1mp": "1MP",
  "1 mp": "1MP",
  "1024": "1MP",
  "1024x1024": "1MP",
  "1024×1024": "1MP",
  "2048": "2K",
  "2048x2048": "2K",
  "4096": "4K"
};

/** Normalize a resolution to a tier, or null when it names none we know. */
export function normalizeResolution(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Collapse whitespace runs before touching the separators: an unbounded
  // `\s*` on both sides of the class backtracks polynomially (CodeQL).
  const key = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ ?[x*×] ?/g, "x");
  if (!key) return null;
  return RESOLUTION_TIERS[key] ?? null;
}

const PER_SECOND_CLASSES = new Set(["per-video-second", "per-audio-second"]);

const money = (usd: number): string =>
  usd >= 0.01
    ? `$${usd.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`
    : `$${usd}`;

/** The shortest duration the model is receipted for, or 1 s when unbounded. */
function shortestClipSecond(clip: GenspendPrice["clip_seconds"]): number {
  if (!clip) return 1;
  if (Array.isArray(clip.set) && clip.set.length > 0) {
    const legal = clip.set.filter((s) => Number.isFinite(s) && s > 0);
    if (legal.length > 0) return Math.min(...legal);
  }
  if (
    typeof clip.min === "number" &&
    Number.isFinite(clip.min) &&
    clip.min > 1
  ) {
    return clip.min;
  }
  return 1;
}

/** A duration outside the model's receipted envelope, with the reason. */
function outsideEnvelope(
  clip: GenspendPrice["clip_seconds"],
  seconds: number
): string | null {
  if (!clip) return null;
  if (Array.isArray(clip.set) && !clip.set.includes(seconds)) {
    return `no published price at ${seconds}s`;
  }
  if (
    typeof clip.min === "number" &&
    Number.isFinite(clip.min) &&
    seconds < clip.min
  ) {
    return `below the receipted clip envelope (${clip.min}s minimum)`;
  }
  if (
    typeof clip.max === "number" &&
    Number.isFinite(clip.max) &&
    seconds > clip.max
  ) {
    return `above the receipted clip envelope (${clip.max}s maximum)`;
  }
  return null;
}

const declined = (reason: string): ModelParamPrice => ({
  unit_price: 0,
  billing_unit: "",
  currency: GENSPEND_CURRENCY,
  source: "bundle",
  declined: reason
});

/**
 * Narrow the published grid to the row the job actually bills at, one axis at a
 * time. Returns the row, or a decline when a *stated* resolution has no rung.
 */
function selectRow(
  rows: GenspendVariant[],
  baseRow: GenspendVariant | null,
  params: ModelPriceParams,
  resolution: string | null,
  seconds: number | null,
  assumptions: string[]
): { row: GenspendVariant | null } | { declined: string } {
  // A plain t2v/i2v job never takes a video-input row: that is a different
  // billing axis, handled by the re-rate below.
  let candidates = rows.filter((row) => row.video_input !== true);

  const laddered = candidates.filter((row) => row.resolution);
  if (laddered.length > 0) {
    if (resolution) {
      candidates = laddered.filter(
        (row) => normalizeResolution(row.resolution) === resolution
      );
      if (candidates.length === 0) {
        return { declined: `no published price at ${resolution}` };
      }
    } else if (baseRow?.resolution) {
      candidates = laddered.filter(
        (row) => row.resolution === baseRow.resolution
      );
      assumptions.push(
        `resolution not set on the node — priced at the base spec ${baseRow.resolution}`
      );
    }
  }

  const timed = candidates.filter((row) =>
    Number.isFinite(row.duration_seconds)
  );
  if (timed.length > 0) {
    if (seconds !== null) {
      candidates = timed.filter((row) => row.duration_seconds === seconds);
      if (candidates.length === 0) {
        return { declined: `no published price at ${seconds}s` };
      }
    } else {
      const based = timed.filter((row) => row.is_base);
      candidates = based.length > 0 ? based : timed;
    }
  }

  // Audio is a billing axis worth up to 2×. Unset, the honest default is
  // whatever the base spec delivers — not the cheaper of the two.
  const wantAudio =
    typeof params.withAudio === "boolean"
      ? params.withAudio
      : typeof baseRow?.with_audio === "boolean"
        ? baseRow.with_audio
        : null;
  if (wantAudio !== null) {
    const audio = candidates.filter((row) => row.with_audio === wantAudio);
    if (audio.length > 0) candidates = audio;
  }

  // Tier is the same shape of axis: a provider selling Standard and Pro under
  // one id delivers the base spec's tier unless the caller says otherwise.
  const wantTier = params.tier ?? baseRow?.tier ?? null;
  if (wantTier) {
    const tiered = candidates.filter((row) => row.tier === wantTier);
    if (tiered.length > 0) candidates = tiered;
  }

  return { row: candidates.find((r) => r.is_base) ?? candidates[0] ?? null };
}

/**
 * Price a catalog entry for the stated job. `params` may be empty: the result
 * is then the base spec with its assumptions written down.
 */
export function priceGenspendEntry(
  entry: GenspendPrice,
  params: ModelPriceParams = {}
): ModelParamPrice {
  if ((entry.data_flags ?? []).some((f) => f.severity === "quote_wrong")) {
    return declined("a known price discrepancy is open against this model");
  }

  const assumptions: string[] = [];
  const warnings: string[] = [];

  const resolution =
    params.resolution === undefined || params.resolution === null
      ? null
      : normalizeResolution(params.resolution);
  if (params.resolution && !resolution) {
    assumptions.push(
      `resolution "${params.resolution}" is not one the catalog prices — priced at the base spec`
    );
  }

  const statedSeconds =
    typeof params.seconds === "number" &&
    Number.isFinite(params.seconds) &&
    params.seconds > 0
      ? params.seconds
      : null;

  const clip = "clip_seconds" in entry ? entry.clip_seconds : undefined;
  if (statedSeconds !== null && clip !== undefined) {
    if (clip === null)
      return declined("no receipted clip length for this model");
    const outside = outsideEnvelope(clip, statedSeconds);
    if (outside) return declined(outside);
  }

  const rows = entry.variants ?? [];
  const baseRow = rows.find((row) => row.is_base) ?? null;
  const selected = selectRow(
    rows,
    baseRow,
    params,
    resolution,
    statedSeconds,
    assumptions
  );
  if ("declined" in selected) return declined(selected.declined);

  const row = selected.row;
  const unitPrice = row ? row.price_usd : entry.unit_price;
  // The base-spec row's class travels with its price: some models bill a
  // duration rung per generation while the headline class is per second.
  const unitClass = row ? row.unit_class : entry.unit_class;
  const rungLabel = row?.resolution ? ` at ${row.resolution}` : "";

  let cost: number;
  let breakdown: string;
  let seconds = statedSeconds;

  if (PER_SECOND_CLASSES.has(unitClass)) {
    if (seconds === null) {
      if (clip === null)
        return declined("no receipted clip length for this model");
      seconds = shortestClipSecond(clip);
      assumptions.push(
        `duration not set on the node — priced at ${seconds} s${
          seconds > 1 ? " (the shortest clip this model publishes)" : ""
        }`
      );
    }
    cost = unitPrice * seconds;
    breakdown = `${seconds} s × ${money(unitPrice)}/s${rungLabel}`;
  } else {
    cost = unitPrice;
    breakdown = `${money(unitPrice)} per ${entry.billing_unit || "generation"}${rungLabel}`;
  }

  const surcharges: GenspendSurcharge[] = entry.surcharges ?? [];

  // A re-rate replaces the generation cost rather than adding to it, and is
  // scoped by resolution. No row for the requested resolution declines the
  // re-rate — never another rung — leaving the generation cost as a floor.
  const refVideoSeconds =
    typeof params.referenceVideoSeconds === "number" &&
    Number.isFinite(params.referenceVideoSeconds)
      ? params.referenceVideoSeconds
      : 0;
  if (refVideoSeconds > 0) {
    const rates = surcharges.filter((s) => s.kind === "input_video_second");
    const rate =
      rates.find((s) => !s.spec) ??
      rates.find(
        (s) => resolution && normalizeResolution(s.spec) === resolution
      ) ??
      null;
    if (rate) {
      const outSeconds = seconds ?? 1;
      cost = rate.unit_price_usd * (outSeconds + refVideoSeconds);
      breakdown = `${outSeconds} s out + ${refVideoSeconds} s in × ${money(
        rate.unit_price_usd
      )}/s`;
    } else if (rates.length > 0) {
      warnings.push(
        "no video-input rate published at this resolution — the generation price is a lower bound"
      );
    }
  }

  const refImages =
    typeof params.referenceImages === "number" &&
    Number.isFinite(params.referenceImages)
      ? params.referenceImages
      : 0;
  if (refImages > 0) {
    const surcharge = surcharges.find((s) => s.kind === "input_image");
    if (surcharge) {
      const billable = Math.max(0, refImages - surcharge.free_allowance);
      if (billable > 0) {
        cost += billable * surcharge.unit_price_usd;
        breakdown += ` + ${billable} ref image${billable === 1 ? "" : "s"} × ${money(
          surcharge.unit_price_usd
        )}`;
      }
    } else {
      warnings.push(
        "reference images are not priced for this model — the figure is a lower bound"
      );
    }
  }

  // `per_request` extras are opt-in (prompt expansion, search grounding):
  // surfaced, never summed.
  for (const extra of surcharges.filter((s) => s.kind === "per_request")) {
    warnings.push(
      `${extra.label ?? "an optional per-request extra"} costs ${money(
        extra.unit_price_usd
      )} more when enabled — not included`
    );
  }

  if ((entry.data_flags ?? []).some((f) => f.severity === "spec_gap")) {
    warnings.push(
      "this price is exact at the model's base spec only — other specs may differ"
    );
  }

  type PriceFields = Mutable<ModelParamPrice>;
  const price: PriceFields = {
    unit_price: cost,
    billing_unit: entry.billing_unit,
    currency: GENSPEND_CURRENCY,
    source: "bundle",
    breakdown
  };
  if (assumptions.length > 0) {
    price.assumptions = assumptions;
  }
  if (warnings.length > 0) {
    price.warnings = warnings;
  }
  return price;
}
