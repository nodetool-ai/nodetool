import { useCallback } from "react";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

export const useRemoveFromGroup = () => {
  const { updateNode } = useNodes((state) => ({
    updateNode: state.updateNode
  }));
  const removeFromGroup = useCallback(
    (nodesToRemove?: Node<NodeData>[]) => {
      if (nodesToRemove) {
        nodesToRemove.forEach((node) => {
          setTimeout(() => {
            updateNode(node.id, {
              parentId: undefined
            });
          }, 100);
        });
      }
    },
    [updateNode]
  );

  return removeFromGroup;
};
