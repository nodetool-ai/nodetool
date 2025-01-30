import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useIsGroupable } from "./useIsGroupable";
import { useNodes } from "../../contexts/NodeContext";

export function useAddToGroup() {
  const { isGroupable, isGroup } = useIsGroupable();
  const { hoveredNodes, updateNode, setHoveredNodes, findNode } = useNodes(
    (state) => ({
      hoveredNodes: state.hoveredNodes,
      updateNode: state.updateNode,
      setHoveredNodes: state.setHoveredNodes,
      findNode: state.findNode
    })
  );
  const addToGroup = useCallback(
    (nodes: Node<NodeData>[], lastParentNode?: Node | undefined) => {
      const parentId = hoveredNodes[0];
      const parentNode = findNode(parentId);
      nodes.forEach((node) => {
        if (
          parentNode &&
          hoveredNodes.length > 0 &&
          isGroupable(node) &&
          isGroup(parentNode)
        ) {
          if (!node.parentId) {
            updateNode(node.id, {
              position: {
                x: node.position.x - parentNode.position.x,
                y: node.position.y - parentNode.position.y
              },
              parentId: parentId,
              expandParent: true
            });
          }
          if (node.parentId) {
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

      setHoveredNodes([]);
    },
    [isGroupable, isGroup]
  );

  return addToGroup;
}
