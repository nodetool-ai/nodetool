import { useCallback } from "react";
import { Edge, IsValidConnection } from "@xyflow/react";
import { wouldCreateCycle } from "../../utils/graphCycle";
import { useNodes } from "../../contexts/NodeContext";

/**
 * Hook for handling connection events in the node editor.
 * 
 * This hook provides validation for node connections, ensuring that
 * connections don't create cycles in the workflow graph.
 * 
 * @returns Object containing the connection validation function
 * 
 * @example
 * ```typescript
 * const { isConnectionValid } = useConnectionEvents();
 * 
 * return (
 *   <ReactFlow
 *     isValidConnection={isConnectionValid}
 *   />
 * );
 * ```
 */
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
