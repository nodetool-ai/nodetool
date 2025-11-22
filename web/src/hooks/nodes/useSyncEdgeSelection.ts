import { useEffect } from "react";
import { useNodes } from "../../contexts/NodeContext";

export const useSyncEdgeSelection = (
  nodeId: string,
  isSelected: boolean
): void => {
  // Only subscribe to helper functions, not the full `edges` array,
  // to avoid re-rendering every node whenever edges change.
  const { getInputEdges, getOutputEdges, findNode, setEdgeSelectionState } =
    useNodes((state) => ({
      getInputEdges: state.getInputEdges,
      getOutputEdges: state.getOutputEdges,
      findNode: state.findNode,
      setEdgeSelectionState: state.setEdgeSelectionState
    }));

  useEffect(() => {
    const inputEdges = getInputEdges(nodeId);
    const outputEdges = getOutputEdges(nodeId);
    const connectedEdges = [...inputEdges, ...outputEdges];

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
    nodeId,
    isSelected,
    getInputEdges,
    getOutputEdges,
    findNode,
    setEdgeSelectionState
  ]);
};

