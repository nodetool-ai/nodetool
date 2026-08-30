/**
 * What generating this whole sequence costs, at list price.
 *
 * Sums every generated clip's own direct-generation price. A workflow-bound
 * clip is counted but not priced: its cost lives in a graph this surface has
 * not fetched, and inventing a figure for it would make the total read as a
 * quote. So the total is a floor, and the status bar shows it as one.
 *
 * Null when the sequence has nothing generated to price.
 */

import { useMemo } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { estimateGenerationCost } from "../../utils/generationCostEstimate";
import { clipGenerationSpec } from "./useClipCostEstimate";

/** How many per-clip lines the tooltip carries before it summarizes. */
const MAX_DETAIL_LINES = 6;

export interface SequenceCostEstimate {
  total: number;
  /**
   * The total leaves out clips it could not price, so it reads as a floor.
   * Satisfies `CostLineDetail`, which is how the status bar renders it.
   */
  isLowerBound: boolean;
  /** The total, formatted: "$1.24". */
  label: string;
  pricedCount: number;
  /** Clips counted in the sequence that no catalog figure covers. */
  unpricedCount: number;
  /** Per-clip detail for the tooltip, summarized past `MAX_DETAIL_LINES`. */
  lines: string[];
}

/** The pure half: what a sequence's clips add up to. */
export function summarizeClipCosts(
  clips: readonly TimelineClip[]
): SequenceCostEstimate | null {
  const generated = clips.filter((clip) => clip.sourceType === "generated");
  if (generated.length === 0) {
    return null;
  }

  let total = 0;
  let unpricedCount = 0;
  const priced: string[] = [];
  for (const clip of generated) {
    const spec = clipGenerationSpec(clip);
    const estimate = spec ? estimateGenerationCost(spec) : null;
    if (!estimate) {
      unpricedCount += 1;
      continue;
    }
    total += estimate.total;
    priced.push(
      `${clip.name || clip.id.slice(0, 8)}: ${estimate.label}${
        estimate.breakdown ? ` — ${estimate.breakdown}` : ""
      }`
    );
  }
  if (priced.length === 0) {
    return null;
  }

  const lines =
    priced.length > MAX_DETAIL_LINES
      ? [
          ...priced.slice(0, MAX_DETAIL_LINES),
          `+${priced.length - MAX_DETAIL_LINES} more clips`
        ]
      // Copied, not aliased: the note below is pushed onto `lines`, and
      // `priced.length` is still the count reported.
      : [...priced];
  if (unpricedCount > 0) {
    lines.push(
      `${unpricedCount} clip${unpricedCount === 1 ? "" : "s"} without a ` +
        `known price ${unpricedCount === 1 ? "is" : "are"} excluded ` +
        `(workflow-bound clips are priced in their inspector).`
    );
  }

  return {
    total,
    isLowerBound: unpricedCount > 0,
    label: formatUsd(total),
    pricedCount: priced.length,
    unpricedCount,
    lines
  };
}

export function useTimelineCostEstimate(): SequenceCostEstimate | null {
  const clips = useTimelineStore((s) => s.clips);
  return useMemo(() => summarizeClipCosts(clips), [clips]);
}

export default useTimelineCostEstimate;
