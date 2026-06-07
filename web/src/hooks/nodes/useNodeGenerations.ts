import { useMemo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import useResultsStore from "../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../stores/WorkflowAssetStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  assetToGeneration,
  mergeGenerations,
  getCurrentGeneration,
  type Generation
} from "../../utils/nodeGenerations";

/**
 * Reactive view of a node's generation timeline: durable workflow assets merged
 * with the live buffer, with the current generation resolved from the node's
 * persisted `selected_generation` (latest when unset/stale) and a `select`
 * action that persists a new selection.
 */
export const useNodeGenerations = (workflowId: string, nodeId: string) => {
  const assets = useWorkflowAssetStore(
    useShallow(
      (s) =>
        s.assetsByWorkflow[workflowId]?.filter((a) => a.node_id === nodeId) ?? []
    )
  );
  const live = useResultsStore(
    useShallow((s) => s.liveGenerations[`${workflowId}:${nodeId}`] ?? [])
  );
  const selectedId = useNodes(
    (s) => s.findNode(nodeId)?.data?.selected_generation
  );
  const updateNodeData = useNodes((s) => s.updateNodeData);

  const generations = useMemo<Generation[]>(
    () => mergeGenerations(assets.map(assetToGeneration), live),
    [assets, live]
  );
  const current = useMemo(
    () => getCurrentGeneration(generations, selectedId),
    [generations, selectedId]
  );
  const select = useCallback(
    (id: string) => updateNodeData(nodeId, { selected_generation: id }),
    [updateNodeData, nodeId]
  );

  return { generations, current, select };
};
