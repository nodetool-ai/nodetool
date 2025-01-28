import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { useNodeStore } from "../../stores/NodeStore";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { NodeData } from "../../stores/NodeData";
import { useIsGroupable } from "./useIsGroupable";

export function useAddToGroup() {
  const { isKeyPressed } = useKeyPressedStore();
  const spaceKeyPressed = isKeyPressed(" ");
  const { isGroupable, isGroup } = useIsGroupable();
  const addToGroup = useCallback(
    (nodes: Node<NodeData>[], lastParentNode?: Node | undefined) => {
      const hoveredNodes = useNodeStore.getState().hoveredNodes;
      const updateNode = useNodeStore.getState().updateNode;
      const parentId = hoveredNodes[0];
      const parentNode = useNodeStore.getState().findNode(parentId);
      nodes.forEach((node) => {
        if (
          parentNode &&
          hoveredNodes.length > 0 &&
          isGroupable(node) &&
          isGroup(parentNode)
        ) {
          if (!node.parentId && !spaceKeyPressed) {
            updateNode(node.id, {
              position: {
                x: node.position.x - parentNode.position.x,
                y: node.position.y - parentNode.position.y
              },
              parentId: parentId,
              expandParent: true
            });
          }
          if (node.parentId && !spaceKeyPressed) {
            // already in group
            updateNode(node.id, {
              expandParent: true
            });
          }
        } else {
          // not hovered over group node
          if (node.parentId) {
            // remove from group and adjust position
            updateNode(node.id, {
              position: {
                x: node.position.x + (lastParentNode?.position.x || 0),
                y: node.position.y + (lastParentNode?.position.y || 0)
              },
              parentId: undefined,
              expandParent: false
            });
          }
        }
      });

      useNodeStore.getState().setHoveredNodes([]);
    },
    [isGroupable, isGroup, spaceKeyPressed]
  );

  return addToGroup;
}
