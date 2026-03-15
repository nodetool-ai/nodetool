/**
 * Local Model Fit — Deterministic Scoring Engine
 *
 * Maps (HardwareProfile, ModelCatalogEntry, ModelVariant) → RankedModelFit.
 *
 * ## Scoring algorithm
 *
 * The score is a number 0–100 computed from deterministic, explainable
 * heuristics.  No ML or opaque estimates are used.
 *
 * 1. **Available memory** — for discrete GPUs, this is VRAM.
 *    For Apple Silicon (vramGb === 0), we use ~75 % of unified RAM.
 *    For CPU-only, we use ~60 % of RAM (OS + runtime overhead).
 *
 * 2. **Memory ratio** = memoryRequired / availableMemory.
 *    Ratio ≤ 0.5 → Excellent headroom.
 *    Ratio ≤ 0.75 → Comfortable.
 *    Ratio ≤ 0.90 → Tight but runnable.
 *    Ratio ≤ 1.0  → Very tight, may OOM.
 *    Ratio > 1.0  → Does not fit.
 *
 * 3. A small bonus is added for lower-bit quantisation (faster inference)
 *    and penalised for very long context lengths at tight ratios.
 *
 * 4. The final score is clamped to 0–100 and mapped to a tier + fit label.
 */

import type {
  HardwareProfile,
  ModelCatalogEntry,
  ModelVariant,
  RankedModelFit,
  FitTier,
  FitLabel,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the effective available memory in GB for running a model.
 *
 * Apple Silicon: unified memory, ~75 % usable for ML workloads.
 * Discrete GPU: full VRAM.
 * CPU-only: ~60 % of system RAM (OS/runtime overhead).
 */
export const effectiveMemoryGb = (hw: HardwareProfile): number => {
  if (hw.vramGb > 0) {
    return hw.vramGb;
  }
  // Apple Silicon → unified memory
  if (hw.platform === "macos") {
    return hw.ramGb * 0.75;
  }
  // CPU-only fallback
  return hw.ramGb * 0.6;
};

/** Map a numeric score to a tier letter. */
export const scoreToTier = (score: number): FitTier => {
  if (score >= 90) { return "S"; }
  if (score >= 75) { return "A"; }
  if (score >= 60) { return "B"; }
  if (score >= 40) { return "C"; }
  if (score >= 20) { return "D"; }
  return "F";
};

/** Map a tier letter to a human-readable label. */
export const tierToLabel = (tier: FitTier): FitLabel => {
  switch (tier) {
    case "S": return "Excellent";
    case "A": return "Great";
    case "B": return "Good";
    case "C": return "Marginal";
    case "D": return "Poor";
    case "F": return "Won't Fit";
  }
};

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Score a single model variant against a hardware profile.
 *
 * Returns a full `RankedModelFit` with score, tier, fit label, and reasons.
 */
export const scoreModelFit = (
  hw: HardwareProfile,
  entry: ModelCatalogEntry,
  variant: ModelVariant,
): RankedModelFit => {
  const reasons: string[] = [];
  const available = effectiveMemoryGb(hw);
  const required = variant.memoryGb;

  // --- Memory ratio --------------------------------------------------
  const memoryPercent =
    available > 0 ? Math.round((required / available) * 100) : 100;

  const ratio = available > 0 ? required / available : Infinity;

  let score: number;

  if (ratio <= 0.3) {
    // Fits very comfortably
    score = 100;
    reasons.push(`Uses only ${memoryPercent}% of available memory`);
  } else if (ratio <= 0.5) {
    // Plenty of headroom
    score = 95 - (ratio - 0.3) * 50; // 95 → 85
    reasons.push(`Comfortable fit at ${memoryPercent}% memory`);
  } else if (ratio <= 0.75) {
    // Moderate
    score = 85 - (ratio - 0.5) * 80; // 85 → 65
    reasons.push(`Moderate fit at ${memoryPercent}% memory`);
  } else if (ratio <= 0.90) {
    // Tight
    score = 65 - (ratio - 0.75) * 166.67; // 65 → 40
    reasons.push(`Tight fit at ${memoryPercent}% memory — may be slow`);
  } else if (ratio <= 1.0) {
    // Very tight
    score = 40 - (ratio - 0.90) * 200; // 40 → 20
    reasons.push(`Very tight at ${memoryPercent}% memory — risk of OOM`);
  } else {
    // Does not fit
    score = Math.max(0, 20 - (ratio - 1.0) * 40);
    reasons.push(`Exceeds available memory (${memoryPercent}%)`);
  }

  // --- Quantisation bonus/penalty ------------------------------------
  if (variant.bits !== undefined) {
    if (variant.bits <= 4) {
      score = Math.min(100, score + 3);
      reasons.push("4-bit quant — faster inference");
    } else if (variant.bits >= 16) {
      score = Math.max(0, score - 2);
      reasons.push("16-bit — higher precision but slower");
    }
  }

  // --- Clamp ---------------------------------------------------------
  score = Math.round(Math.max(0, Math.min(100, score)));

  const tier = scoreToTier(score);
  const fitLabel = tierToLabel(tier);
  const fits = ratio <= 1.0;

  return {
    id: `${entry.id}::${variant.id}`,
    modelId: entry.id,
    variantId: variant.id,
    name: entry.name,
    provider: entry.provider,
    family: entry.family,
    paramLabel: entry.paramLabel,
    subtitle: variant.label,
    description: entry.description,
    releaseDate: entry.releaseDate,
    architecture: entry.architecture,
    activeParamsLabel: entry.activeParamsLabel,
    tags: entry.tags,
    memoryGb: required,
    memoryPercent,
    contextLength: entry.contextLength,
    fitLabel,
    tier,
    score,
    fits,
    reasons,
  };
};
