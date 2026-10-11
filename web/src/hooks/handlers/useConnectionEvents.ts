import { useCallback } from "react";
import { Edge, IsValidConnection } from "@xyflow/react";
import { nodeTypeLookup, wouldCreateCycle } from "../../utils/graphCycle";
import { isTypedSlot } from "../../utils/dynamicSlots";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import { CONTROL_HANDLE_ID } from "../../stores/graphEdgeToReactFlowEdge";

/**
 * Validates node connections while the user drags them, so the canvas shows
 * an incompatible handle as invalid instead of rejecting it after the drop.
 * Applies the gate `NodeStore.onConnect` applies: cycles are rejected except
 * a loop closing on a Loop node's feedback input, an untyped dynamic input
 * takes anything, and every other handle goes through `validateConnection`
 * (handle existence, type compatibility, Agent-only control edges).
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
      const state = store.getState();
      const { edges, nodes } = state;
      if (
        wouldCreateCycle(edges, sourceId, targetId, {
          targetHandle: connection.targetHandle,
          nodeTypeOf: nodeTypeLookup(nodes)
        })
      ) {
        return false;
      }

      const sourceHandle = connection.sourceHandle ?? null;
      const targetHandle = connection.targetHandle ?? null;
      if (!sourceHandle || !targetHandle) {
        return true;
      }
      const sourceNode = state.findNode(sourceId);
      const targetNode = state.findNode(targetId);
      if (!sourceNode || !targetNode) {
        return true;
      }

      // A reconnected edge dropped back on its own handle is a no-op, which
      // `validateConnection` would reject as a duplicate.
      const isExistingEdge = edges.some(
        (edge) =>
          edge.source === sourceId &&
          edge.target === targetId &&
          (edge.sourceHandle ?? null) === sourceHandle &&
          (edge.targetHandle ?? null) === targetHandle
      );
      if (isExistingEdge) {
        return true;
      }

      const isControlEdge =
        targetHandle === CONTROL_HANDLE_ID || sourceHandle === CONTROL_HANDLE_ID;
      const isUntypedDynamicProperty =
        targetNode.data.dynamic_properties?.[targetHandle] !== undefined &&
        !isTypedSlot(targetNode.data.dynamic_inputs?.[targetHandle]);
      if (isUntypedDynamicProperty && !isControlEdge) {
        return true;
      }

      return state.validateConnection(
        { source: sourceId, target: targetId, sourceHandle, targetHandle },
        sourceNode,
        targetNode
      );
    },
    [store]
  );

  return {
    isConnectionValid
  };
}
