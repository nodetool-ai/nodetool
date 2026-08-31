/**
 * useGraphCostEstimate — pre-run cost estimate for a plain graph.
 *
 * The estimator half of {@link useWorkflowCostEstimate}, taken off the editor's
 * NodeStore so a surface that merely *fetched* a workflow can price it too: the
 * timeline's workflow-bound clips and the sketch's workflow-bound layers both
 * hold a fetched graph and no open editor.
 *
 * Keeps only the nodes that use an AI model, then runs the pure
 * `estimateWorkflowCost`. Returns null when there is no graph to price.
 */

import { useMemo } from "react";
import {
  estimateWorkflowCost,
  nodeExpectedQuantity,
  usesAiModel,
  type WorkflowCostEstimateDetail
} from "@nodetool-ai/node-sdk/cost-estimate";
import { extractPricingParams } from "@nodetool-ai/node-sdk/pricing-params";
import type { NodeMetadata } from "../stores/ApiTypes";
import useMetadataStore from "../stores/MetadataStore";
import { getModelUnitPrice } from "../utils/modelUnitPricing";

/** A graph node as either source gives it: the editor's, or the API's. */
export interface CostEstimateNode {
  id: string;
  type?: string | null;
  data?: unknown;
}

/**
 * A node's property values. The editor stores them under `data.properties`
 * (`../stores/NodeData`); graphs that arrive from the server carry them spread
 * on `data`. Read both, the way the server preflight does — reading only the
 * outer object priced every model-picker node as unknown.
 */
function propertyValues(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const outer = data as Record<string, unknown>;
  const nested = outer.properties;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : outer;
}

/**
 * The title the user put on the node, which lives beside `properties` rather
 * than in it. Absent, the estimator falls back to the node type's registered
 * title.
 */
function userTitle(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const title = (data as { title?: unknown }).title;
  return typeof title === "string" && title.trim() !== "" ? title : undefined;
}

/** Price a graph. Pure but for the metadata lookup the caller supplies. */
export function estimateGraphCost(
  nodes: readonly CostEstimateNode[],
  getMetadata: (nodeType: string) => NodeMetadata | undefined
): WorkflowCostEstimateDetail {
  const aiNodes = nodes.filter((node) =>
    node.type ? usesAiModel(getMetadata(node.type)) : false
  );
  // Each node contributes its configured fan-out (e.g. num_images) so the
  // estimate reflects a real run.
  const quantities: Record<string, number> = Object.fromEntries(
    aiNodes.map((node) => [
      node.id,
      nodeExpectedQuantity(propertyValues(node.data))
    ])
  );
  // A renamed node is named that way in the cost table too — four Agent nodes
  // are only told apart by what the user called them.
  const titles: Record<string, string> = Object.fromEntries(
    aiNodes
      .map((node) => [node.id, userTitle(node.data)] as const)
      .filter((entry): entry is readonly [string, string] => !!entry[1])
  );
  return estimateWorkflowCost({
    nodes: aiNodes.map((node) => ({
      id: node.id,
      type: node.type ?? "",
      data: propertyValues(node.data)
    })),
    getMetadata: (nodeType) => getMetadata(nodeType),
    getModelPrice: getModelUnitPrice,
    // What the node states about the job it will run (duration, resolution,
    // audio), so a per-second model prices the clip and not one second.
    getParams: (node) => extractPricingParams(node.data),
    quantities,
    titles,
    currency: "USD"
  });
}

export function useGraphCostEstimate(
  nodes: readonly CostEstimateNode[] | undefined | null
): WorkflowCostEstimateDetail | null {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  return useMemo(
    () => (nodes ? estimateGraphCost(nodes, getMetadata) : null),
    [nodes, getMetadata]
  );
}

export default useGraphCostEstimate;
