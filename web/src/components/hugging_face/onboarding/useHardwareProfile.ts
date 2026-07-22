import { useMemo } from "react";
import { useSystemStatsStore } from "../../../stores/systemStatsHandler";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { classifyFit, type FitLevel } from "./onboardingCatalog";

/** Where the memory budget used for recommendations comes from. */
export type BudgetSource = "gpu" | "unified-memory" | "manual" | "unknown";

export type HardwareTier = "entry" | "mid" | "high" | "workstation";

export interface HardwareProfile {
  /** Detected dedicated VRAM (GB), or null when unavailable. */
  vramGb: number | null;
  /** Detected system RAM (GB), or null when unavailable. */
  ramGb: number | null;
  /**
   * The memory budget (GB) recommendations are measured against: the manual
   * override if set, else detected VRAM, else a fraction of system RAM (unified
   * memory), else null.
   */
  budgetGb: number | null;
  budgetSource: BudgetSource;
  /** Coarse tier for headline copy, or null when the budget is unknown. */
  tier: HardwareTier | null;
  /** True when the manual override is driving the budget. */
  isManual: boolean;
  /** Classify a model's memory requirement against this machine's budget. */
  classify: (minVramGb: number) => FitLevel;
}

/**
 * Fraction of system RAM treated as usable for models when there's no discrete
 * VRAM figure (Apple Silicon unified memory, or CPU-only inference). The OS and
 * app need the rest.
 */
const UNIFIED_MEMORY_FRACTION = 0.7;

const tierFor = (budgetGb: number | null): HardwareTier | null => {
  if (budgetGb == null) {
    return null;
  }
  if (budgetGb < 6) {
    return "entry";
  }
  if (budgetGb < 12) {
    return "mid";
  }
  if (budgetGb < 24) {
    return "high";
  }
  return "workstation";
};

export const TIER_LABELS: Record<HardwareTier, string> = {
  entry: "Entry — small models run great",
  mid: "Mid-range — 7–14B models are comfortable",
  high: "High-end — up to ~24B and image models",
  workstation: "Workstation — the largest local models"
};

/**
 * Read hardware from the live system stats and combine it with the manual
 * override into a single budget the onboarding UI recommends against.
 *
 * The default backend stats sampler often reports RAM but not VRAM, so the
 * budget falls back to a fraction of system RAM, and the user can always set an
 * explicit VRAM value that takes precedence.
 */
export const useHardwareProfile = (): HardwareProfile => {
  const stats = useSystemStatsStore((state) => state.stats);
  const override = useModelManagerStore((state) => state.vramOverrideGb);

  return useMemo(() => {
    const vramGb =
      stats?.vram_total_gb != null && stats.vram_total_gb > 0
        ? stats.vram_total_gb
        : null;
    const ramGb =
      stats?.memory_total_gb != null && stats.memory_total_gb > 0
        ? stats.memory_total_gb
        : null;

    let budgetGb: number | null;
    let budgetSource: BudgetSource;
    if (override != null && override > 0) {
      budgetGb = override;
      budgetSource = "manual";
    } else if (vramGb != null) {
      budgetGb = vramGb;
      budgetSource = "gpu";
    } else if (ramGb != null) {
      budgetGb = Math.round(ramGb * UNIFIED_MEMORY_FRACTION);
      budgetSource = "unified-memory";
    } else {
      budgetGb = null;
      budgetSource = "unknown";
    }

    return {
      vramGb,
      ramGb,
      budgetGb,
      budgetSource,
      tier: tierFor(budgetGb),
      isManual: budgetSource === "manual",
      classify: (minVramGb: number) => classifyFit(minVramGb, budgetGb)
    };
  }, [stats, override]);
};
