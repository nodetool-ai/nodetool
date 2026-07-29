import { useCallback } from "react";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import { getCollapseTogglePatches } from "../../stores/collapseNodeLayout";

/**
 * Toggles the collapsed (header-only) state of one or more nodes, applying the
 * layout patches that preserve the expanded body height on re-expand.
 *
 * When multiple ids are given, the first node's next collapsed state drives the
 * whole batch so a mixed selection ends up uniform instead of flip-flopping.
 * Called with no ids, it toggles the current selection.
 */
export const useToggleCollapse = (): ((nodeIds?: string[]) => void) => {
  const nodeStore = useNodeStoreRef();

  return useCallback(
    (nodeIds?: string[]) => {
      const { getSelectedNodes, findNode, updateNodeData, updateNode } =
        nodeStore.getState();

      const targets =
        nodeIds && nodeIds.length > 0
          ? nodeIds.map((id) => findNode(id)).filter((n) => n != null)
          : getSelectedNodes();

      if (targets.length === 0) {
        return;
      }

      const next = !targets[0].data.collapsed;
      for (const node of targets) {
        const { data: dataPatch, node: nodePatch } = getCollapseTogglePatches(
          node,
          next
        );
        updateNodeData(node.id, dataPatch);
        updateNode(node.id, nodePatch);
      }
    },
    [nodeStore]
  );
};
