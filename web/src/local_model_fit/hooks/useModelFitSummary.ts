/**
 * Local Model Fit — useModelFitSummary hook
 *
 * Lightweight wrapper that computes tier counts and a one-liner from
 * the current ranked results.
 */

import { useMemo } from "react";
import type { TierCounts } from "../summaries";
import { computeTierCounts, oneLinerSummary } from "../summaries";
import type { RankedModelFit } from "../types";

export interface UseModelFitSummaryResult {
  tierCounts: TierCounts;
  summary: string;
}

export const useModelFitSummary = (
  results: readonly RankedModelFit[],
): UseModelFitSummaryResult => {
  const tierCounts = useMemo(() => computeTierCounts(results), [results]);
  const summary = useMemo(() => oneLinerSummary(results), [results]);
  return { tierCounts, summary };
};
