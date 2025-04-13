import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useIsGroupable } from "./useIsGroupable";
import { useNodes } from "../../contexts/NodeContext";

export function useAddToGroup() {
  const { isGroupable, isGroup } = useIsGroupable();
  const { updateNode } = useNodes((state) => ({
    updateNode: state.updateNode
  }));
  const addToGroup = useCallback(
    (nodes: Node<NodeData>[], parentNode?: Node<NodeData> | undefined) => {
      nodes.forEach((node) => {
        if (parentNode && isGroupable(node) && isGroup(parentNode)) {
          if (!node.parentId) {
            setTimeout(() => {
              updateNode(node.id, {
                position: {
                  x: node.position.x - parentNode.position.x,
                  y: node.position.y - parentNode.position.y
                },
                parentId: parentNode.id,
                expandParent: true
              });
            }, 100);
          }
        }
      });
    },
    [isGroupable, isGroup, updateNode]
  );

  return addToGroup;
}
