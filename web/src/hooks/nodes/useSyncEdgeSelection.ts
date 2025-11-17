import { useEffect, useMemo } from "react";
import { useNodes } from "../../contexts/NodeContext";
import type { Edge } from "@xyflow/react";

export const useSyncEdgeSelection = (
  nodeId: string,
  isSelected: boolean
): void => {
  const { edges, findNode, setEdgeSelectionState } = useNodes((state) => ({
    edges: state.edges,
    findNode: state.findNode,
    setEdgeSelectionState: state.setEdgeSelectionState
  }));

  const connectedEdges = useMemo(
    () =>
      edges.filter(
        (edge) => edge.source === nodeId || edge.target === nodeId
      ) as Edge[],
    [edges, nodeId]
  );

  useEffect(() => {
    if (!connectedEdges.length) {
      return;
    }

    const selectionUpdates: Record<string, boolean> = {};

    for (const edge of connectedEdges) {
      const neighborId = edge.source === nodeId ? edge.target : edge.source;
      const neighborSelected = Boolean(findNode(neighborId)?.selected);
      const shouldSelect = isSelected || neighborSelected;
      if (Boolean(edge.selected) !== shouldSelect) {
        selectionUpdates[edge.id] = shouldSelect;
      }
    }

    if (Object.keys(selectionUpdates).length > 0) {
      setEdgeSelectionState(selectionUpdates);
    }
  }, [
    connectedEdges,
    findNode,
    nodeId,
    isSelected,
    setEdgeSelectionState
  ]);
};

