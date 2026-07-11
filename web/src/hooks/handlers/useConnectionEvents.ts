import { useCallback } from "react";
import { Edge, IsValidConnection } from "@xyflow/react";
import { wouldCreateCycle } from "../../utils/graphCycle";
import { useNodes } from "../../contexts/NodeContext";

/** Validates node connections, rejecting any that would create a cycle. */
export function useConnectionEvents(): {
  isConnectionValid: IsValidConnection<Edge>;
} {
  const edges = useNodes((state) => state.edges);

  const isConnectionValid = useCallback<IsValidConnection<Edge>>(
    (connection) => {
      const sourceId = connection.source ?? null;
      const targetId = connection.target ?? null;
      if (!sourceId || !targetId) {
        return true;
      }
      return !wouldCreateCycle(edges, sourceId, targetId);
    },
    [edges]
  );

  return {
    isConnectionValid
  };
}
