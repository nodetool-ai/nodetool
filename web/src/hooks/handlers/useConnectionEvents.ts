import { useCallback } from "react";
import { Edge, IsValidConnection } from "@xyflow/react";
import { wouldCreateCycle } from "../../utils/graphCycle";
import { useNodes } from "../../contexts/NodeContext";

export function useConnectionEvents() {
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
