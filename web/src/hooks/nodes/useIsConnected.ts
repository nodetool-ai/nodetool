import { useMemo } from "react";
import { NodeStoreState } from "../../stores/NodeStore";
import { isHandleConnected } from "./edgeIndex";

export const useIsConnectedSelector = (nodeId: string, propertyName: string): ((state: NodeStoreState) => boolean) => {
  return useMemo(
    () => (state: NodeStoreState) =>
      isHandleConnected(state.edges, nodeId, propertyName),
    [nodeId, propertyName]
  );
};
