import { useCallback, useContext } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useIsGroupable } from "./useIsGroupable";
import { useNodes, NodeContext } from "../../contexts/NodeContext";
import { getGroupBounds } from "./getGroupBounds";

export function useAddToGroup(): (nodesToAdd: Node<NodeData>[], parentNode?: Node<NodeData>) => void {
  const { isGroupable, isGroup } = useIsGroupable();
  const updateNode = useNodes((state) => state.updateNode);
  const nodeContext = useContext(NodeContext);

  const addToGroup = useCallback(
    (nodesToAdd: Node<NodeData>[], parentNode?: Node<NodeData> | undefined) => {
      if (!nodesToAdd) { return; }

      let reparented = false;
      nodesToAdd.forEach((node) => {
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
            reparented = true;
          }
        }
      });
      if (!reparented) {
        return;
      }

      setTimeout(() => {
        if (parentNode && nodeContext) {
          const { nodes: currentNodes, findNode } = nodeContext.getState();
          const newBounds = getGroupBounds(currentNodes, parentNode, 25, 50);
          const group = findNode(parentNode.id);
          if (!newBounds || !group) {
            return;
          }
          // Grow the group to fit its children, never shrink it.
          const width = Math.max(
            newBounds.width,
            group.width ?? group.measured?.width ?? 0
          );
          const height = Math.max(
            newBounds.height,
            group.height ?? group.measured?.height ?? 0
          );
          if (width !== group.width || height !== group.height) {
            updateNode(parentNode.id, { width, height });
          }
        }
      }, 10);
    },
    [isGroupable, isGroup, updateNode, nodeContext]
  );

  return addToGroup;
}
