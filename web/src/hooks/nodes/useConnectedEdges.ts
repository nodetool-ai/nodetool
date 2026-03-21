import { useMemo } from "react";
import { Edge } from "@xyflow/react";
import { NodeStoreState } from "../../stores/NodeStore";

/**
 * Optimized selector that filters edges connected to a specific node.
 * It caches the previous result and performs a deep check of the filtered array
 * to ensure a stable array reference is returned if the actual connected edges haven't changed.
 * This prevents unnecessary re-renders in components (like NodeInputs) when unrelated
 * edges in the graph change during drag operations or workflow execution.
 */
export const useConnectedEdgesSelector = (nodeId: string) => {
  return useMemo(() => {
    let lastEdges: Edge[] | null = null;
    let lastResult: Edge[] = [];

    return (state: NodeStoreState) => {
      if (state.edges === lastEdges) {
        return lastResult;
      }

      lastEdges = state.edges;
      const newResult = state.edges.filter((edge) => edge.target === nodeId);

      // Deep referential check of the filtered array elements
      // If the edges connected to this node are exactly the same references as before,
      // return the previous array reference so Zustand doesn't trigger a re-render.
      if (
        lastResult.length === newResult.length &&
        lastResult.every((edge, i) => edge === newResult[i])
      ) {
        return lastResult;
      }

      lastResult = newResult;
      return lastResult;
    };
  }, [nodeId]);
};
