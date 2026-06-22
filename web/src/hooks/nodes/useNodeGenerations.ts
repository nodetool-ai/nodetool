import { useMemo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import useResultsStore from "../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../stores/WorkflowAssetStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  assetToGeneration,
  mergeGenerations,
  getCurrentGeneration,
  groupByRun,
  getCurrentRun,
  type Generation,
  type RunGroup
} from "../../utils/nodeGenerations";

/** Stable empty array for the multi-select set so an unset node never re-renders
 *  consumers on identity churn. */
const STABLE_EMPTY: string[] = [];

/**
 * Reactive view of a node's generation timeline: durable workflow assets merged
 * with the live buffer, with the current generation resolved from the node's
 * persisted `selected_generation` (latest when unset/stale) and a `select`
 * action that persists a new selection. `selectedIds` /
 * `toggleSelected` / `setSelected` manage the multi-select export set
 * (`selected_generations`) fed downstream as a list, independent of the focused
 * `current` selection.
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
  const selectedIds = useNodes(
    useShallow(
      (s) => s.findNode(nodeId)?.data?.selected_generations ?? STABLE_EMPTY
    )
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
  const runs = useMemo<RunGroup[]>(
    () => groupByRun(generations),
    [generations]
  );
  const currentRun = useMemo(
    () => getCurrentRun(runs, selectedId),
    [runs, selectedId]
  );
  const select = useCallback(
    (id: string) => updateNodeData(nodeId, { selected_generation: id }),
    [updateNodeData, nodeId]
  );
  const setSelected = useCallback(
    (ids: string[]) => updateNodeData(nodeId, { selected_generations: ids }),
    [updateNodeData, nodeId]
  );
  // Add/remove a generation id, preserving pick order: a new id appends, an
  // already-present id is removed in place.
  const toggleSelected = useCallback(
    (id: string) =>
      setSelected(
        selectedIds.includes(id)
          ? selectedIds.filter((existing) => existing !== id)
          : [...selectedIds, id]
      ),
    [setSelected, selectedIds]
  );

  return {
    generations,
    current,
    select,
    runs,
    currentRun,
    selectedIds,
    toggleSelected,
    setSelected
  };
};
