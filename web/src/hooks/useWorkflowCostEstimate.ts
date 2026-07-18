/**
 * useWorkflowCostEstimate — reactive pre-run cost estimate for a workflow.
 *
 * Reads the open workflow's nodes (from its NodeStore) and the node-type
 * metadata (which carries `fal_unit_pricing` / `kie_unit_pricing`), then runs
 * the pure {@link estimateWorkflowCost} estimator. Re-computes when the graph
 * or metadata changes. Returns `null` when the graph isn't available yet.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Node } from "@xyflow/react";
import { estimateWorkflowCost } from "@nodetool-ai/node-sdk";
import type { WorkflowCostEstimate } from "@nodetool-ai/protocol";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeData } from "../stores/NodeData";

const EMPTY_NODES: Node<NodeData>[] = [];

export function useWorkflowCostEstimate(
  workflowId: string
): WorkflowCostEstimate | null {
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
    return estimateWorkflowCost({
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type ?? "",
        data: node.data as Record<string, unknown> | undefined
      })),
      getMetadata: (nodeType) => getMetadata(nodeType),
      currency: "USD"
    });
  }, [nodeStore, nodes, getMetadata]);
}

export default useWorkflowCostEstimate;
