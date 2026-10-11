import { useCallback } from "react";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { rendersExposedInputHandles } from "../../components/node_types/editing/bespokeRegistry";
import {
  applyExposedPlacementTarget,
  canConfigureExposedPlacement,
  canPlaceOnTopHandle,
  getEffectiveExposedPlacement,
  nextExposedInputPlacement,
  type ExposedInputPlacement
} from "../../utils/exposedInputs";
import { isString } from "../../utils/typePredicates";
import { runAsOneUndoEntry } from "../../utils/runAsOneUndoEntry";

interface UseExposedInputToggleResult {
  canToggleExposed: (nodeId: string, propertyName: string) => boolean;
  getPlacement: (nodeId: string, propertyName: string) => ExposedInputPlacement | null;
  isPropertyExposed: (nodeId: string, propertyName: string) => boolean;
  isPropertyExposedLabeled: (nodeId: string, propertyName: string) => boolean;
  setExposedInputPlacement: (nodeIds: string | readonly string[], propertyName: string, placement: ExposedInputPlacement | null) => void;
  cycleExposedInputPlacement: (nodeIds: string | readonly string[], propertyName: string) => void;
  toggleExposedInput: (nodeIds: string | readonly string[], propertyName: string) => void;
  toggleExposedInputLabeled: (nodeIds: string | readonly string[], propertyName: string) => void;
}

export function useExposedInputToggle(): UseExposedInputToggleResult {
  const findNode = useNodes((state) => state.findNode);
  // Edges are read only when the user toggles a placement. Subscribing would
  // re-render every consumer on each edge add/remove/drag.
  const nodeStore = useNodeStoreRef();
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

  /**
   * Ask before removing edges into a property that loses its handle. Returns
   * the edge ids to delete, or null when the user cancels.
   */
  const confirmDisconnect = useCallback(
    (nodeIds: readonly string[], propertyName: string): string[] | null => {
      const edgeIds = nodeStore
        .getState()
        .edges.filter(
          (edge) =>
            nodeIds.includes(edge.target) && edge.targetHandle === propertyName
        )
        .map((edge) => edge.id);
      if (
        edgeIds.length > 0 &&
        !window.confirm(
          `Hide input for "${propertyName}"? The connected edge will be removed.`
        )
      ) {
        return null;
      }
      return edgeIds;
    },
    [nodeStore]
  );

  /** Edge removal and placement on every node land as one undo step. */
  const commitPlacement = useCallback(
    (
      nodeIds: readonly string[],
      propertyName: string,
      placement: ExposedInputPlacement | null,
      edgeIds: readonly string[]
    ): void => {
      runAsOneUndoEntry(nodeStore, () => {
        if (edgeIds.length > 0) {
          deleteEdges([...edgeIds]);
        }
        applyPlacementPatch(nodeIds, propertyName, placement);
      });
    },
    [applyPlacementPatch, deleteEdges, nodeStore]
  );

  /** Cycle placement: off → top handle → bottom labeled → off (inspector arrow). */
  const cycleExposedInputPlacement = useCallback(
    (nodeIds: string | readonly string[], propertyName: string): void => {
      const ids = isString(nodeIds) ? [nodeIds] : nodeIds;
      if (ids.length === 0) {
        return;
      }

      const current = getPlacement(ids[0], propertyName);
      const firstType = findNode(ids[0])?.type;
      const firstMeta = firstType ? getMetadata(firstType) : undefined;
      const allowHandle =
        !firstMeta ||
        canPlaceOnTopHandle(
          firstMeta,
          propertyName,
          rendersExposedInputHandles(firstMeta)
        );
      const next = nextExposedInputPlacement(current, allowHandle);
      let edgeIds: string[] = [];
      if (current !== null && next === null) {
        const confirmed = confirmDisconnect(ids, propertyName);
        if (!confirmed) {
          return;
        }
        edgeIds = confirmed;
      }
      commitPlacement(ids, propertyName, next, edgeIds);
    },
    [commitPlacement, confirmDisconnect, findNode, getMetadata, getPlacement]
  );

  const toggleExposedInput = cycleExposedInputPlacement;

  const toggleExposedInputLabeled = useCallback(
    (nodeIds: string | readonly string[], propertyName: string): void => {
      const ids = isString(nodeIds) ? [nodeIds] : nodeIds;
      if (ids.length === 0) {
        return;
      }

      const placement = getPlacement(ids[0], propertyName);
      if (placement === "labeled") {
        const edgeIds = confirmDisconnect(ids, propertyName);
        if (!edgeIds) {
          return;
        }
        commitPlacement(ids, propertyName, null, edgeIds);
      } else {
        commitPlacement(ids, propertyName, "labeled", []);
      }
    },
    [commitPlacement, confirmDisconnect, getPlacement]
  );

  const setExposedInputPlacement = useCallback(
    (
      nodeIds: string | readonly string[],
      propertyName: string,
      placement: ExposedInputPlacement | null
    ): void => {
      const ids = isString(nodeIds) ? [nodeIds] : nodeIds;
      if (ids.length === 0) {
        return;
      }
      const current = getPlacement(ids[0], propertyName);
      let edgeIds: string[] = [];
      if (current !== null && current !== placement) {
        const confirmed = confirmDisconnect(ids, propertyName);
        if (!confirmed) {
          return;
        }
        edgeIds = confirmed;
      }
      commitPlacement(ids, propertyName, placement, edgeIds);
    },
    [commitPlacement, confirmDisconnect, getPlacement]
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
