import { useCallback } from "react";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

export const useRemoveFromGroup = () => {
  const { setNodes } = useNodes((state) => ({
    setNodes: state.setNodes
  }));
  const removeFromGroup = useCallback(
    (nodesToRemove?: Node<NodeData>[]) => {
      if (nodesToRemove) {
        setNodes((nodes) =>
          nodes.map((node) => {
            if (nodesToRemove.some((n) => n.id === node.id)) {
              return { ...node, parentId: undefined };
            }
            return node;
          })
        );
      }
    },
    [setNodes]
  );

  return removeFromGroup;
};
