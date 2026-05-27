import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import {
  applyExposedPlacementTarget,
  canConfigureExposedPlacement,
  getEffectiveExposedPlacement,
  nextExposedInputPlacement,
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
      if (!node?.type) {
        return null;
      }
      const metadata = getMetadata(node.type);
      if (!metadata) {
        return null;
      }
      return getEffectiveExposedPlacement(metadata, node.data, propertyName);
    },
    [findNode, getMetadata]
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
      return canConfigureExposedPlacement(
        getMetadata(node.type),
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
        if (!node?.type) {
          continue;
        }
        const nodeMeta = getMetadata(node.type);
        if (!canConfigureExposedPlacement(nodeMeta, propertyName)) {
          continue;
        }
        const patch = applyExposedPlacementTarget(
          nodeMeta!,
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

  const toggleExposedInput = cycleExposedInputPlacement;

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
