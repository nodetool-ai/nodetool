import { useMemo } from "react";
import { Edge } from "@xyflow/react";
import { NodeStoreState } from "../../stores/NodeStore";
import { edgesTargeting } from "./edgeIndex";

/**
 * Selector for the edges connected to a specific node. Holds the result
 * against the previous one element-by-element so an unrelated edge change
 * returns the same array reference and Zustand skips the re-render, which is
 * what keeps NodeInputs quiet during drags and workflow runs.
 */
export const useConnectedEdgesSelector = (nodeId: string): ((state: NodeStoreState) => Edge[]) => {
  return useMemo(() => {
    let lastResult: Edge[] = [];

    return (state: NodeStoreState) => {
      const newResult = edgesTargeting(state.edges, nodeId);
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
