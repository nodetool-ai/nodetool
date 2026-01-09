import { useCallback } from "react";
import { Edge, IsValidConnection } from "@xyflow/react";
import { wouldCreateCycle } from "../../utils/graphCycle";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { isConnectable } from "../../utils/TypeHandler";
import { findOutputHandle, findInputHandle } from "../../utils/handleUtils";

export function useConnectionEvents() {
  const edges = useNodes((state) => state.edges);
  const nodes = useNodes((state) => state.nodes);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const isConnectionValid = useCallback<IsValidConnection<Edge>>(
    (connection) => {
      const sourceId = connection.source ?? null;
      const targetId = connection.target ?? null;

      if (!sourceId || !targetId) {
        return true;
      }

      if (wouldCreateCycle(edges, sourceId, targetId)) {
        return false;
      }

      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);

      if (!sourceNode || !targetNode) {
        return true;
      }

      const sourceHandle = connection.sourceHandle ?? null;
      const targetHandle = connection.targetHandle ?? null;

      if (!sourceHandle || !targetHandle) {
        return true;
      }

      const sourceMetadata = getMetadata(sourceNode.type || "");
      const targetMetadata = getMetadata(targetNode.type || "");

      if (!sourceMetadata || !targetMetadata) {
        return true;
      }

      const sourceOutputHandle = findOutputHandle(
        sourceNode,
        sourceHandle,
        sourceMetadata
      );
      const targetInputHandle = findInputHandle(
        targetNode,
        targetHandle,
        targetMetadata
      );

      if (!sourceOutputHandle) {
        return false;
      }

      const isDynamicProperty =
        targetNode.data.dynamic_properties?.[targetHandle] !==
        undefined;

      if (!targetInputHandle && !isDynamicProperty) {
        return false;
      }

      const sourceType = sourceOutputHandle.type;
      const targetType =
        targetInputHandle?.type ||
        ({ type: "any", type_args: [], optional: false, type_name: "any" } as any);

      return isConnectable(sourceType, targetType, true);
    },
    [edges, nodes, getMetadata]
  );

  return {
    isConnectionValid
  };
}
