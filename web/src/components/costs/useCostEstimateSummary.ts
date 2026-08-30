/**
 * useCostEstimateSummary
 *
 * Turns a raw {@link WorkflowCostEstimateDetail} into the view-model
 * {@link CostEstimateSummary} renders: one formatted row per node (units
 * phrase, cost, lower-bound flag, unknown-price reason) plus a formatted,
 * honestly-labeled total. Pure and hook-shaped only so it memoizes with the
 * estimate — every other surface that wants a cost summary reuses this
 * instead of re-deriving the same strings.
 */

import { useMemo } from "react";
import type {
  NodeCostEstimateDetail,
  WorkflowCostEstimateDetail
} from "@nodetool-ai/node-sdk/cost-estimate";
import { formatUsd } from "@nodetool-ai/model-pricing";

/** "image" → "images" for a count that is not one. */
const plural = (unit: string, count: number): string =>
  count === 1 || unit.endsWith("s") ? unit : `${unit}s`;

/**
 * What a run of this node buys, in one phrase: fan-out, clip length and the
 * resolution rung it was priced at — "2 × 5 s @ 720p", "4 images". Reads the
 * estimator's own structured `seconds`/`resolution` fields rather than
 * parsing them back out of `breakdown` prose.
 */
function formatUnits(item: NodeCostEstimateDetail): string {
  const quantity = item.quantity;
  const seconds = item.seconds;

  let units: string;
  if (seconds != null) {
    units = quantity === 1 ? `${seconds} s` : `${quantity} × ${seconds} s`;
  } else if (item.billing_unit && !/\bunits?\b/i.test(item.billing_unit)) {
    units = `${quantity} ${plural(item.billing_unit, quantity)}`;
  } else {
    units = String(quantity);
  }
  return item.resolution ? `${units} @ ${item.resolution}` : units;
}

/** True when the figure leaves out a cost we know exists — "at least $X". */
const isLowerBound = (item: NodeCostEstimateDetail): boolean =>
  item.confidence !== "unknown" &&
  ((item.warnings?.length ?? 0) > 0 || (item.assumptions?.length ?? 0) > 0);

export interface CostEstimateRow {
  key: string;
  nodeType: string;
  unknown: boolean;
  /** Why the price could not be quoted, for an unknown row's tooltip. */
  unknownReason: string;
  providerModel: string;
  units: string;
  costLabel: string;
  isLowerBound: boolean;
  /** Breakdown + warnings, for a priced row's hover tooltip. */
  tooltip: string | null;
  assumptions: string[];
}

export interface CostEstimateSummaryView {
  currency: string;
  rows: CostEstimateRow[];
  /** True once at least one node in the graph uses an AI model. */
  hasItems: boolean;
  unknownCount: number;
  /** Sum of every priced row, formatted; "—" when nothing could be priced. */
  totalLabel: string;
  isTotalLowerBound: boolean;
}

export function useCostEstimateSummary(
  estimate: WorkflowCostEstimateDetail | null
): CostEstimateSummaryView | null {
  return useMemo(() => {
    if (!estimate) return null;

    const rows: CostEstimateRow[] = estimate.items.map((item) => {
      const unknown = item.confidence === "unknown";
      return {
        key: item.node_id,
        nodeType: item.node_type,
        unknown,
        unknownReason:
          item.assumptions?.join(" ") ??
          "Price unknown — excluded from the total",
        providerModel: [item.provider, item.model].filter(Boolean).join(" · "),
        units: formatUnits(item),
        costLabel: unknown ? "—" : formatUsd(item.estimated_cost),
        isLowerBound: isLowerBound(item),
        tooltip: item.breakdown
          ? [item.breakdown, ...(item.warnings ?? [])].join(" — ")
          : null,
        assumptions: unknown ? [] : (item.assumptions ?? [])
      };
    });

    const pricedCount = estimate.items.length - estimate.unknown_count;

    return {
      currency: estimate.currency,
      rows,
      hasItems: estimate.items.length > 0,
      unknownCount: estimate.unknown_count,
      totalLabel: pricedCount > 0 ? formatUsd(estimate.total) : "—",
      isTotalLowerBound: estimate.items.some((item) => isLowerBound(item))
    };
  }, [estimate]);
}

export default useCostEstimateSummary;
