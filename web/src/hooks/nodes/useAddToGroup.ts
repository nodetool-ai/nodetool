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
    (nodes: Node<NodeData>[], parentNode?: Node<NodeData> | undefined) => {
      nodes.forEach((node) => {
        if (parentNode && isGroupable(node) && isGroup(parentNode)) {
          if (!node.parentId) {
            updateNode(node.id, {
              position: {
                x: node.position.x - parentNode.position.x,
                y: node.position.y - parentNode.position.y
              },
              parentId: parentNode.id,
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
                x: node.position.x + (parentNode?.position.x || 0),
                y: node.position.y + (parentNode?.position.y || 0)
              },
              parentId: undefined,
              expandParent: false
            });
          }
        }
      });
    },
    [isGroupable, isGroup, updateNode]
  );

  return addToGroup;
}
