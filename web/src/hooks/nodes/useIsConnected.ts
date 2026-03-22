import { useMemo } from "react";
import { Edge } from "@xyflow/react";
import { NodeStoreState } from "../../stores/NodeStore";

export const useIsConnectedSelector = (nodeId: string, propertyName: string) => {
  return useMemo(() => {
    let lastEdges: Edge[] | null = null;
    let lastResult = false;
    return (state: NodeStoreState) => {
      if (state.edges === lastEdges) {
        return lastResult;
      }
      lastEdges = state.edges;
      lastResult = state.edges.some(
        (edge) => edge.target === nodeId && edge.targetHandle === propertyName
      );
      return lastResult;
    };
  }, [nodeId, propertyName]);
};
