import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import {
  addExposedInput,
  canPromotePropertyToInputHandle,
  removeExposedInput
} from "../../utils/exposedInputs";

export function useExposedInputToggle() {
  const findNode = useNodes((state) => state.findNode);
  const edges = useNodes((state) => state.edges);
  const deleteEdges = useNodes((state) => state.deleteEdges);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const isPropertyExposed = useCallback(
    (nodeId: string, propertyName: string): boolean => {
      const node = findNode(nodeId);
      return (node?.data.exposedInputs ?? []).includes(propertyName);
    },
    [findNode]
  );

  const canToggleExposed = useCallback(
    (nodeId: string, propertyName: string): boolean => {
      const node = findNode(nodeId);
      if (!node?.type) {
        return false;
      }
      return canPromotePropertyToInputHandle(
        getMetadata(node.type as string),
        propertyName
      );
    },
    [findNode, getMetadata]
  );

  const toggleExposedInput = useCallback(
    (nodeIds: string | readonly string[], propertyName: string): void => {
      const ids = typeof nodeIds === "string" ? [nodeIds] : nodeIds;
      if (ids.length === 0) {
        return;
      }

      const firstNode = findNode(ids[0]);
      if (!firstNode?.type) {
        return;
      }
      const metadata = getMetadata(firstNode.type as string);
      if (!canPromotePropertyToInputHandle(metadata, propertyName)) {
        return;
      }

      const currentlyExposed = (firstNode.data.exposedInputs ?? []).includes(
        propertyName
      );

      if (currentlyExposed) {
        const hasConnectedEdge = ids.some((nodeId) =>
          edges.some(
            (edge) =>
              edge.target === nodeId && edge.targetHandle === propertyName
          )
        );
        if (
          hasConnectedEdge &&
          !window.confirm(
            `Hide input handle for "${propertyName}"? The connected edge will be removed.`
          )
        ) {
          return;
        }
        if (hasConnectedEdge) {
          const edgeIds = edges
            .filter(
              (edge) =>
                ids.includes(edge.target) && edge.targetHandle === propertyName
            )
            .map((edge) => edge.id);
          if (edgeIds.length > 0) {
            deleteEdges(edgeIds);
          }
        }
        for (const nodeId of ids) {
          const node = findNode(nodeId);
          if (!node) {
            continue;
          }
          const next = removeExposedInput(
            node.data.exposedInputs,
            propertyName
          );
          if (next !== node.data.exposedInputs) {
            updateNodeData(nodeId, { exposedInputs: next });
          }
        }
      } else {
        for (const nodeId of ids) {
          const node = findNode(nodeId);
          if (!node) {
            continue;
          }
          const nodeMeta = getMetadata(node.type as string);
          if (!canPromotePropertyToInputHandle(nodeMeta, propertyName)) {
            continue;
          }
          const next = addExposedInput(node.data.exposedInputs, propertyName);
          if (next !== node.data.exposedInputs) {
            updateNodeData(nodeId, { exposedInputs: next });
          }
        }
      }
    },
    [deleteEdges, edges, findNode, getMetadata, updateNodeData]
  );

  return {
    canToggleExposed,
    isPropertyExposed,
    toggleExposedInput
  };
}
