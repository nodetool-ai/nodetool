import { useCallback } from "react";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

export const useRemoveFromGroup = () => {
  const { findNode, updateNode } = useNodes((state) => ({
    findNode: state.findNode,
    updateNode: state.updateNode
  }));
  const removeFromGroup = useCallback((nodes?: Node<NodeData>[]) => {
    if (nodes && nodes.length) {
      nodes.forEach((node) => {
        if (node && node.parentId) {
          const parentNode = findNode(node.parentId);
          if (parentNode) {
            const newPosition = {
              x: (parentNode.position.x || 0) + (node.position.x - 5 || 0),
              y: (parentNode.position.y || 0) + (node.position.y - 5 || 0)
            };
            updateNode(node.id, {
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
