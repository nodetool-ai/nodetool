/**
 * Local Model Fit — Summaries
 *
 * Utility functions that summarise a `RankedModelFit[]` for dashboard
 * widgets, tier badges, and header counts.
 */

import type { RankedModelFit, FitTier } from "./types";

/** Counts of models per tier. */
export interface TierCounts {
  S: number;
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
  total: number;
  fitting: number;
}

/** All tier keys in display order. */
export const TIER_ORDER: readonly FitTier[] = ["S", "A", "B", "C", "D", "F"];

/** Count models per tier from a ranked result set. */
export const computeTierCounts = (
  results: readonly RankedModelFit[],
): TierCounts => {
  const counts: TierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0, total: 0, fitting: 0 };
  for (const r of results) {
    counts[r.tier]++;
    counts.total++;
    if (r.fits) { counts.fitting++; }
  }
  return counts;
};

/** The best tier that has at least one result. */
export const bestAvailableTier = (
  results: readonly RankedModelFit[],
): FitTier | null => {
  for (const tier of TIER_ORDER) {
    if (results.some((r) => r.tier === tier)) { return tier; }
  }
  return null;
};

/** Short one-line summary, e.g. "12 models fit · best tier S". */
export const oneLinerSummary = (
  results: readonly RankedModelFit[],
): string => {
  const counts = computeTierCounts(results);
  const best = bestAvailableTier(results);
  if (counts.total === 0) { return "No models in catalog"; }
  if (counts.fitting === 0) { return "No models fit this hardware"; }
  return `${counts.fitting} model${counts.fitting === 1 ? "" : "s"} fit · best tier ${best}`;
};
