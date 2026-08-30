/**
 * useWorkflowCostEstimate — reactive pre-run cost estimate for an open workflow.
 *
 * Subscribes to the open workflow's NodeStore and prices its graph through
 * {@link estimateGraphCost}, so the editor's panel and the media editors'
 * workflow-bound inspectors read one estimator. Re-computes when the graph or
 * the node-type metadata changes. Returns `null` when the graph isn't
 * available yet.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Node } from "@xyflow/react";
import type { WorkflowCostEstimateDetail } from "@nodetool-ai/node-sdk/cost-estimate";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeData } from "../stores/NodeData";
import { estimateGraphCost } from "./useGraphCostEstimate";

const EMPTY_NODES: Node<NodeData>[] = [];

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

  return useMemo(
    () => (nodeStore ? estimateGraphCost(nodes, getMetadata) : null),
    [nodeStore, nodes, getMetadata]
  );
}

export default useWorkflowCostEstimate;
