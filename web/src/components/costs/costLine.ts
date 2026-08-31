/**
 * Adapters onto {@link CostLineDetail} — the compact figure
 * {@link CostEstimateLine} shows.
 *
 * Two things get priced in the media editors: one direct generation, from what
 * the surface states about it, and a bound workflow, from its graph. Both end
 * up as the same one-line figure, so the two conversions live together here
 * rather than being re-derived at every call site.
 */

import { formatUsd } from "@nodetool-ai/model-pricing";
import type { WorkflowCostEstimateDetail } from "@nodetool-ai/node-sdk/cost-estimate";
import type { GenerationCostEstimate } from "../../utils/generationCostEstimate";
import type { CostLineDetail } from "./CostEstimateLine";

/** One direct generation as a cost line. */
export function generationCostLine(
  estimate: GenerationCostEstimate | null
): CostLineDetail | null {
  if (!estimate) {
    return null;
  }
  const perOutput =
    estimate.quantity > 1
      ? `${estimate.quantity} outputs × ${estimate.breakdown ?? "list price"}`
      : estimate.breakdown;
  return {
    label: estimate.label,
    isLowerBound: (estimate.warnings?.length ?? 0) > 0,
    lines: [
      perOutput,
      ...(estimate.assumptions ?? []),
      ...(estimate.warnings ?? [])
    ].filter((line): line is string => !!line)
  };
}

/**
 * A bound workflow's graph as a cost line: the total, one line per node that
 * priced, and a count of the nodes that did not. An unpriced node is named
 * rather than dropped — the total is then a floor, not a quote.
 */
export function workflowCostLine(
  estimate: WorkflowCostEstimateDetail | null
): CostLineDetail | null {
  if (!estimate || estimate.items.length === 0) {
    return null;
  }
  const priced = estimate.items.filter(
    (item) => item.confidence !== "unknown"
  );
  if (priced.length === 0) {
    return null;
  }
  const lines = priced.map((item) =>
    [
      `${item.node_title ?? item.node_type}: ${formatUsd(item.estimated_cost)}`,
      item.breakdown,
      ...(item.warnings ?? [])
    ]
      .filter(Boolean)
      .join(" — ")
  );
  if (estimate.unknown_count > 0) {
    lines.push(
      `${estimate.unknown_count} node${
        estimate.unknown_count === 1 ? "" : "s"
      } without a known price ${
        estimate.unknown_count === 1 ? "is" : "are"
      } excluded.`
    );
  }
  return {
    label: formatUsd(estimate.total),
    isLowerBound:
      estimate.unknown_count > 0 ||
      priced.some((item) => (item.warnings?.length ?? 0) > 0),
    lines
  };
}
