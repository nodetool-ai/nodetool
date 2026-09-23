import { useCallback } from "react";
import { Edge, IsValidConnection } from "@xyflow/react";
import { nodeTypeLookup, wouldCreateCycle } from "../../utils/graphCycle";
import { useNodeStoreRef } from "../../contexts/NodeContext";

/**
 * Validates node connections, rejecting any that would create a cycle other
 * than a loop closing on a Loop node's feedback input.
 */
export function useConnectionEvents() {
  // Read at validation time, not subscribed to: this hook lives in the canvas
  // root and only runs while the user drags a connection.
  const store = useNodeStoreRef();

  const isConnectionValid = useCallback<IsValidConnection<Edge>>(
    (connection) => {
      const sourceId = connection.source ?? null;
      const targetId = connection.target ?? null;
      if (!sourceId || !targetId) {
        return true;
      }
      const { edges, nodes } = store.getState();
      return !wouldCreateCycle(edges, sourceId, targetId, {
        targetHandle: connection.targetHandle,
        nodeTypeOf: nodeTypeLookup(nodes)
      });
    },
    [store]
  );

  return {
    isConnectionValid
  };
}
