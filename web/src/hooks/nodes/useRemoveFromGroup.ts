import { useCallback } from "react";
import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
export const useRemoveFromGroup = () => {
  const updateNode = useNodeStore((state) => state.updateNode);
  const { getNode } = useReactFlow();

  const removeFromGroup = useCallback(
    (nodes?: Node<NodeData>[]) => {
      if (nodes && nodes.length) {
        nodes.forEach((node) => {
          if (node && node.parentId) {
            const parentNode = getNode(node.parentId);
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
    },
    [getNode, updateNode]
  );

  return removeFromGroup;
};
