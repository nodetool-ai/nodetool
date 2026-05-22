import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import {
  canPromotePropertyToInputHandle,
  getExposedInputPlacement,
  nextExposedInputPlacement,
  patchExposedInputPlacement,
  type ExposedInputPlacement
} from "../../utils/exposedInputs";

export function useExposedInputToggle() {
  const findNode = useNodes((state) => state.findNode);
  const edges = useNodes((state) => state.edges);
  const deleteEdges = useNodes((state) => state.deleteEdges);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const getPlacement = useCallback(
    (nodeId: string, propertyName: string): ExposedInputPlacement | null => {
      const node = findNode(nodeId);
      if (!node) {
        return null;
      }
      return getExposedInputPlacement(node.data, propertyName);
    },
    [findNode]
  );

  const isPropertyExposed = useCallback(
    (nodeId: string, propertyName: string): boolean =>
      getPlacement(nodeId, propertyName) === "handle",
    [getPlacement]
  );

  const isPropertyExposedLabeled = useCallback(
    (nodeId: string, propertyName: string): boolean =>
      getPlacement(nodeId, propertyName) === "labeled",
    [getPlacement]
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

  const applyPlacementPatch = useCallback(
    (
      nodeIds: readonly string[],
      propertyName: string,
      placement: ExposedInputPlacement | null
    ): void => {
      for (const nodeId of nodeIds) {
        const node = findNode(nodeId);
        if (!node) {
          continue;
        }
        const nodeMeta = getMetadata(node.type as string);
        if (!canPromotePropertyToInputHandle(nodeMeta, propertyName)) {
          continue;
        }
        const patch = patchExposedInputPlacement(
          node.data,
          propertyName,
          placement
        );
        if (Object.keys(patch).length > 0) {
          updateNodeData(nodeId, patch);
        }
      }
    },
    [findNode, getMetadata, updateNodeData]
  );

  const confirmDisconnectIfNeeded = useCallback(
    (nodeIds: readonly string[], propertyName: string): boolean => {
      const hasConnectedEdge = nodeIds.some((nodeId) =>
        edges.some(
          (edge) =>
            edge.target === nodeId && edge.targetHandle === propertyName
        )
      );
      if (
        hasConnectedEdge &&
        !window.confirm(
          `Hide input for "${propertyName}"? The connected edge will be removed.`
        )
      ) {
        return false;
      }
      if (hasConnectedEdge) {
        const edgeIds = edges
          .filter(
            (edge) =>
              nodeIds.includes(edge.target) &&
              edge.targetHandle === propertyName
          )
          .map((edge) => edge.id);
        if (edgeIds.length > 0) {
          deleteEdges(edgeIds);
        }
      }
      return true;
    },
    [deleteEdges, edges]
  );

  /** Cycle placement: off → top handle → bottom labeled → off (inspector arrow). */
  const cycleExposedInputPlacement = useCallback(
    (nodeIds: string | readonly string[], propertyName: string): void => {
      const ids = typeof nodeIds === "string" ? [nodeIds] : nodeIds;
      if (ids.length === 0) {
        return;
      }

      const current = getPlacement(ids[0], propertyName);
      const next = nextExposedInputPlacement(current);
      if (current !== null && next === null) {
        if (!confirmDisconnectIfNeeded(ids, propertyName)) {
          return;
        }
      }
      applyPlacementPatch(ids, propertyName, next);
    },
    [applyPlacementPatch, confirmDisconnectIfNeeded, getPlacement]
  );

  /** @deprecated Use cycleExposedInputPlacement — kept as alias for callers. */
  const toggleExposedInput = cycleExposedInputPlacement;

  /** Toggle labeled row at the bottom of the node (handle + param title). */
  const toggleExposedInputLabeled = useCallback(
    (nodeIds: string | readonly string[], propertyName: string): void => {
      const ids = typeof nodeIds === "string" ? [nodeIds] : nodeIds;
      if (ids.length === 0) {
        return;
      }

      const placement = getPlacement(ids[0], propertyName);
      if (placement === "labeled") {
        if (!confirmDisconnectIfNeeded(ids, propertyName)) {
          return;
        }
        applyPlacementPatch(ids, propertyName, null);
      } else {
        applyPlacementPatch(ids, propertyName, "labeled");
      }
    },
    [applyPlacementPatch, confirmDisconnectIfNeeded, getPlacement]
  );

  const setExposedInputPlacement = useCallback(
    (
      nodeIds: string | readonly string[],
      propertyName: string,
      placement: ExposedInputPlacement | null
    ): void => {
      const ids = typeof nodeIds === "string" ? [nodeIds] : nodeIds;
      if (ids.length === 0) {
        return;
      }
      const current = getPlacement(ids[0], propertyName);
      if (current !== null && placement === null) {
        if (!confirmDisconnectIfNeeded(ids, propertyName)) {
          return;
        }
      } else if (current !== null && current !== placement) {
        if (!confirmDisconnectIfNeeded(ids, propertyName)) {
          return;
        }
      }
      applyPlacementPatch(ids, propertyName, placement);
    },
    [applyPlacementPatch, confirmDisconnectIfNeeded, getPlacement]
  );

  return {
    canToggleExposed,
    getPlacement,
    isPropertyExposed,
    isPropertyExposedLabeled,
    setExposedInputPlacement,
    cycleExposedInputPlacement,
    toggleExposedInput,
    toggleExposedInputLabeled
  };
}
