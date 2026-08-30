/**
 * What regenerating every generated layer in this sketch costs, at list price.
 *
 * Sums each layer binding's own direct-generation price. A workflow-bound layer
 * is counted but not priced: its cost lives in a graph this surface has not
 * fetched, so the total is a floor and the status bar shows it as one.
 *
 * Null when the document has no generated layer to price.
 */

import { useMemo } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { estimateGenerationCost } from "../../utils/generationCostEstimate";
import { layerGenerationSpec } from "./useLayerCostEstimate";

/** How many per-layer lines the tooltip carries before it summarizes. */
const MAX_DETAIL_LINES = 6;

export interface SketchCostEstimate {
  total: number;
  /**
   * The total leaves out layers it could not price, so it reads as a floor.
   * Satisfies `CostLineDetail`, which is how the status bar renders it.
   */
  isLowerBound: boolean;
  /** The total, formatted: "$0.12". */
  label: string;
  pricedCount: number;
  /** Bindings counted in the document that no catalog figure covers. */
  unpricedCount: number;
  /** Per-layer detail for the tooltip, summarized past `MAX_DETAIL_LINES`. */
  lines: string[];
}

/** The pure half: what a document's layer bindings add up to. */
export function summarizeLayerCosts(
  bindings: readonly LayerWorkflowBinding[]
): SketchCostEstimate | null {
  if (bindings.length === 0) {
    return null;
  }

  let total = 0;
  let unpricedCount = 0;
  const priced: string[] = [];
  for (const binding of bindings) {
    const spec = layerGenerationSpec(binding);
    const estimate = spec ? estimateGenerationCost(spec) : null;
    if (!estimate) {
      unpricedCount += 1;
      continue;
    }
    total += estimate.total;
    priced.push(
      `${binding.model}: ${estimate.label}${
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
          `+${priced.length - MAX_DETAIL_LINES} more layers`
        ]
      // Copied, not aliased: the note below is pushed onto `lines`, and
      // `priced.length` is still the count reported.
      : [...priced];
  if (unpricedCount > 0) {
    lines.push(
      `${unpricedCount} layer${unpricedCount === 1 ? "" : "s"} without a ` +
        `known price ${unpricedCount === 1 ? "is" : "are"} excluded ` +
        `(workflow-bound layers are priced in their inspector).`
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

export function useSketchCostEstimate(): SketchCostEstimate | null {
  const bindings = useSketchSessionStore((s) => s.bindings);
  return useMemo(
    () => summarizeLayerCosts(Object.values(bindings)),
    [bindings]
  );
}

export default useSketchCostEstimate;
