import { useCallback } from "react";
import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "@xyflow/react";

export const useRemoveFromGroup = () => {
  const findNode = useNodeStore((state) => state.findNode);
  const updateNode = useNodeStore((state) => state.updateNode);
  const { getNode } = useReactFlow();

  const removeFromGroup = useCallback(
    (selectedNodeIds: string[]) => {
      if (selectedNodeIds?.length) {
        selectedNodeIds.forEach((id) => {
          const node = findNode(id);
          if (node && node.parentId) {
            const parentNode = getNode(node.parentId);
            if (parentNode) {
              const newPosition = {
                x: (parentNode.position.x || 0) + (node.position.x - 10 || 0),
                y: (parentNode.position.y || 0) + (node.position.y - 10 || 0)
              };
              updateNode(node.id, {
                parentId: undefined,
                position: newPosition
              });
            }
          }
        });
      }
    },
    [findNode, getNode, updateNode]
  );

  return removeFromGroup;
};
