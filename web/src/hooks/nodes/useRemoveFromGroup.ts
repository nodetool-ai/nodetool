import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

export const useRemoveFromGroup = (): ((nodesToRemove?: Node<NodeData>[]) => void) => {
  const { updateNode, findNode } = useNodes(
    useShallow((state) => ({
      updateNode: state.updateNode,
      findNode: state.findNode
    }))
  );

  const removeFromGroup = useCallback(
    (nodesToRemove?: Node<NodeData>[]) => {
      if (!nodesToRemove || nodesToRemove.length === 0) {return;}

      const nodesByParent: Record<string, Node<NodeData>[]> = {};
      nodesToRemove.forEach((node) => {
        if (node.parentId) {
          if (!nodesByParent[node.parentId]) {
            nodesByParent[node.parentId] = [];
          }
          nodesByParent[node.parentId].push(node);
        }
      });

      Object.keys(nodesByParent).forEach((parentId) => {
        const parentNode = findNode(parentId);
        if (!parentNode || parentNode.position === undefined) {
          return;
        }

        const children = nodesByParent[parentId];
        children.forEach((node) => {
          const absolutePosition = {
            x: (parentNode.position.x || 0) + (node.position?.x || 0),
            y: (parentNode.position.y || 0) + (node.position?.y || 0)
          };

          updateNode(node.id, {
            parentId: undefined,
            position: absolutePosition,
            selected: false
          });
        });
      });
    },
    [updateNode, findNode]
  );

  return removeFromGroup;
};
