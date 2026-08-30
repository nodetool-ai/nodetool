/**
 * useWorkflowCostEstimate — reactive pre-run cost estimate for a workflow.
 *
 * Reads the open workflow's nodes (from its NodeStore) and the node-type
 * metadata (which carries `fal_unit_pricing` / `kie_unit_pricing`), keeps only
 * the nodes that use an AI model, then runs the pure {@link estimateWorkflowCost}
 * estimator. Generic nodes (e.g. TextToImage) are priced from their selected
 * `model` field via the FAL/kie pricing catalogs. Re-computes when the graph or
 * metadata changes. Returns `null` when the graph isn't available yet.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Node } from "@xyflow/react";
import {
  estimateWorkflowCost,
  nodeExpectedQuantity,
  usesAiModel,
  type WorkflowCostEstimateDetail
} from "@nodetool-ai/node-sdk/cost-estimate";
import { extractPricingParams } from "@nodetool-ai/node-sdk/pricing-params";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeData } from "../stores/NodeData";
import { getModelUnitPrice } from "../utils/modelUnitPricing";

const EMPTY_NODES: Node<NodeData>[] = [];

/**
 * A node's property values. The editor stores them under `data.properties`
 * (`../stores/NodeData`); graphs that arrive from the server carry them spread
 * on `data`. Read both, the way the server preflight does — reading only the
 * outer object priced every model-picker node as unknown.
 */
function propertyValues(
  data: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const nested = data.properties;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : data;
}

export function useWorkflowCostEstimate(
  workflowId: string
): WorkflowCostEstimateDetail | null {
  const nodeStore = useWorkflowManager((state) =>
    state.getNodeStore(workflowId)
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const subscribe = useCallback(
    (onChange: () => void) =>
      nodeStore ? nodeStore.subscribe(onChange) : () => {},
    [nodeStore]
  );
  const getSnapshot = useCallback(
    () => (nodeStore ? nodeStore.getState().nodes : EMPTY_NODES),
    [nodeStore]
  );
  const nodes = useSyncExternalStore(subscribe, getSnapshot);

  return useMemo(() => {
    if (!nodeStore) {
      return null;
    }
    const aiNodes = nodes.filter((node) =>
      node.type ? usesAiModel(getMetadata(node.type)) : false
    );
    // Each node contributes its configured fan-out (e.g. num_images) so the
    // estimate reflects a real run.
    const quantities: Record<string, number> = Object.fromEntries(
      aiNodes.map((node) => [
        node.id,
        nodeExpectedQuantity(
          propertyValues(node.data as Record<string, unknown> | undefined)
        )
      ])
    );
    return estimateWorkflowCost({
      nodes: aiNodes.map((node) => ({
        id: node.id,
        type: node.type ?? "",
        data: propertyValues(node.data as Record<string, unknown> | undefined)
      })),
      getMetadata: (nodeType) => getMetadata(nodeType),
      getModelPrice: getModelUnitPrice,
      // What the node states about the job it will run (duration, resolution,
      // audio), so a per-second model prices the clip and not one second.
      getParams: (node) => extractPricingParams(node.data),
      quantities,
      currency: "USD"
    });
  }, [nodeStore, nodes, getMetadata]);
}

export default useWorkflowCostEstimate;
