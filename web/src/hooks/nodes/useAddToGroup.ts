import { useCallback, useContext } from "react";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useIsGroupable } from "./useIsGroupable";
import { useNodes, NodeContext } from "../../contexts/NodeContext";
import { getGroupBounds } from "./getGroupBounds";

export function useAddToGroup() {
  const { isGroupable, isGroup } = useIsGroupable();
  const { updateNode } = useNodes((state) => ({
    updateNode: state.updateNode
  }));
  const nodeContext = useContext(NodeContext);

  const addToGroup = useCallback(
    (nodesToAdd: Node<NodeData>[], parentNode?: Node<NodeData> | undefined) => {
      if (!nodesToAdd) { return; }
      
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
          }
        }
      });

      setTimeout(() => {
        if (parentNode && nodeContext) {
          const currentNodes = nodeContext.getState().nodes;
          const newBounds = getGroupBounds(currentNodes, parentNode, 25, 50);

          if (newBounds) {
            updateNode(parentNode.id, {
              width: newBounds.width,
              height: newBounds.height
            });
          }
        }
      }, 10);
    },
    [isGroupable, isGroup, updateNode, nodeContext]
  );

  return addToGroup;
}
