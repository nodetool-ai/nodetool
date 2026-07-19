/**
 * useWorkflowCostEstimate — reactive pre-run cost estimate for a workflow.
 *
 * Reads the open workflow's nodes (from its NodeStore) and the node-type
 * metadata (which carries `fal_unit_pricing` / `kie_unit_pricing`), keeps only
 * the nodes that use an AI model, then runs the pure {@link estimateWorkflowCost}
 * estimator. Re-computes when the graph or metadata changes. Returns `null`
 * when the graph isn't available yet.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Node } from "@xyflow/react";
import { estimateWorkflowCost } from "@nodetool-ai/node-sdk/cost-estimate";
import type { WorkflowCostEstimate } from "@nodetool-ai/protocol";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useMetadataStore from "../stores/MetadataStore";
import { useBudgetStore } from "../stores/BudgetStore";
import type { NodeData } from "../stores/NodeData";
import {
  nodeExpectedQuantity,
  nodeMetadataUsesAiModel
} from "../utils/aiModelNodes";

const EMPTY_NODES: Node<NodeData>[] = [];

export function useWorkflowCostEstimate(
  workflowId: string
): WorkflowCostEstimate | null {
  const nodeStore = useWorkflowManager((state) =>
    state.getNodeStore(workflowId)
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const draftMode = useBudgetStore((state) => state.draftMode);

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
      node.type ? nodeMetadataUsesAiModel(getMetadata(node.type)) : false
    );
    // Draft mode estimates a single cheap preview (one output per node); off /
    // final use each node's configured fan-out. Branching lives here so the
    // estimator itself stays pure.
    const quantities: Record<string, number> =
      draftMode === "draft"
        ? {}
        : Object.fromEntries(
            aiNodes.map((node) => [
              node.id,
              nodeExpectedQuantity(
                node.data as Record<string, unknown> | undefined
              )
            ])
          );
    return estimateWorkflowCost({
      nodes: aiNodes.map((node) => ({
        id: node.id,
        type: node.type ?? "",
        data: node.data as Record<string, unknown> | undefined
      })),
      getMetadata: (nodeType) => getMetadata(nodeType),
      quantities,
      currency: "USD"
    });
  }, [nodeStore, nodes, getMetadata, draftMode]);
}

export default useWorkflowCostEstimate;
