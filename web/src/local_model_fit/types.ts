/**
 * Local Model Fit — Core Types
 *
 * Canonical shapes for the local-model-fit domain.  Every UI renderer,
 * hook, and consumer of model-fit data imports from this single file.
 *
 * Data flow:  ModelCatalogEntry[] + HardwareProfile → scoreModelFit()
 *             → RankedModelFit[]  (consumed by card grid, list, badges, menus)
 */

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------

/** A user's (detected or manually set) hardware profile. */
export interface HardwareProfile {
  /** Unique id, e.g. "rtx-4090" or "custom". */
  id: string;
  /** Human-readable label, e.g. "NVIDIA RTX 4090". */
  label: string;
  /** Available VRAM in GB (0 for integrated / CPU-only). */
  vramGb: number;
  /** System RAM in GB. */
  ramGb: number;
  /** Platform hint for display / detection. */
  platform: "windows" | "macos" | "linux" | "browser" | "unknown";
  /** True when the profile was auto-detected rather than manually chosen. */
  detected: boolean;
}

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

/** A single quantised or runtime variant of a model. */
export interface ModelVariant {
  /** Variant id, e.g. "Q4_K_M". */
  id: string;
  /** Human-readable label, e.g. "Q4_K_M (4-bit)". */
  label: string;
  /** Approximate memory footprint in GB when loaded. */
  memoryGb: number;
  /** Quantisation bits (4, 5, 8, 16, …). */
  bits?: number;
  /** Runtime this variant targets, e.g. "llama.cpp", "ollama", "lm-studio". */
  runtime?: string;
}

/** A normalised entry in the local-model catalog. */
export interface ModelCatalogEntry {
  /** Stable unique id, e.g. "llama-3.2-1b". */
  id: string;
  /** Display name, e.g. "Llama 3.2 1B". */
  name: string;
  /** Model family, e.g. "Llama", "Qwen", "DeepSeek". */
  family: string;
  /** Provider / source, e.g. "ollama", "lm-studio", "llama.cpp". */
  provider: string;
  /** Short parameter label, e.g. "1B", "7B", "70B". */
  paramLabel?: string;
  /** Optional subtitle for extra context. */
  subtitle?: string;
  /** Short description. */
  description?: string;
  /** ISO release date string (YYYY-MM-DD) if known. */
  releaseDate?: string;
  /** Model architecture, e.g. "transformer", "moe". */
  architecture?: string;
  /** Active parameters label for MoE models, e.g. "14B active". */
  activeParamsLabel?: string;
  /** Task tags, e.g. ["chat","code","reasoning","vision"]. */
  tags: string[];
  /** Total parameter count in billions. */
  paramsBillion: number;
  /** Active parameter count in billions (for MoE; equals paramsBillion otherwise). */
  activeParamsBillion: number;
  /** Default / recommended context length in tokens. */
  contextLength: number;
  /** Available quantised / runtime variants. */
  variants: ModelVariant[];
}

// ---------------------------------------------------------------------------
// Fit result (the canonical ranked card/row shape)
// ---------------------------------------------------------------------------

/** Tier labels from best to worst fit. */
export type FitTier = "S" | "A" | "B" | "C" | "D" | "F";

/** Human-readable fit label. */
export type FitLabel =
  | "Excellent"
  | "Great"
  | "Good"
  | "Marginal"
  | "Poor"
  | "Won't Fit";

/** A single ranked model-fit result. This is the canonical shape consumed by every UI. */
export interface RankedModelFit {
  /** Unique row id (catalogEntry.id + variant.id). */
  id: string;
  /** Reference back to catalog entry id. */
  modelId: string;
  /** Variant id used for this result. */
  variantId: string;

  // Display fields
  name: string;
  provider: string;
  family: string;
  paramLabel?: string;
  subtitle?: string;
  description?: string;
  releaseDate?: string;
  architecture?: string;
  activeParamsLabel?: string;
  tags: string[];

  // Fit metrics
  /** Memory required in GB. */
  memoryGb: number;
  /** Memory as a % of available (VRAM or RAM fallback). */
  memoryPercent: number;
  /** Default context length. */
  contextLength: number;
  /** Rough estimated tokens/sec (optional heuristic). */
  estimatedTokPerSec?: number;

  // Scoring
  /** Human-readable fit label. */
  fitLabel: FitLabel;
  /** Tier letter. */
  tier: FitTier;
  /** Numeric score 0–100. */
  score: number;
  /** True when the model is expected to run on this hardware. */
  fits: boolean;
  /** Optional list of human-readable reasons explaining the score. */
  reasons?: string[];
}
