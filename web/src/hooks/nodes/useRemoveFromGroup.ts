import { useCallback } from "react";
import { useNodeStore } from "../../stores/NodeStore";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
export const useRemoveFromGroup = () => {
  const removeFromGroup = useCallback((nodes?: Node<NodeData>[]) => {
    if (nodes && nodes.length) {
      nodes.forEach((node) => {
        if (node && node.parentId) {
          const parentNode = useNodeStore.getState().findNode(node.parentId);
          if (parentNode) {
            const newPosition = {
              x: (parentNode.position.x || 0) + (node.position.x - 5 || 0),
              y: (parentNode.position.y || 0) + (node.position.y - 5 || 0)
            };
            useNodeStore.getState().updateNode(node.id, {
              parentId: undefined,
              expandParent: false,
              position: newPosition
            });
          }
        }
      });
    }
  }, []);

  return removeFromGroup;
};
