import { useCallback } from "react";
import { useReactFlow } from "reactflow";
import { useNodeStore } from "../stores/NodeStore";
import { v4 as uuidv4 } from "uuid";
import { DUPLICATE_SPACING_X } from "../config/constants";

export const useDuplicateNodes = () => {
  const reactFlowInstance = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);

  return useCallback(
    (nodeIds: string[]) => {
      const duplicatedNodesIds: string[] = [];

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      nodeIds.forEach((nodeId) => {
        const node = reactFlowInstance.getNode(nodeId);
        if (node) {
          minX = Math.min(minX, node.position.x);
          maxX = Math.max(maxX, node.position.x);
          minY = Math.min(minY, node.position.y);
          maxY = Math.max(maxY, node.position.y);
        }
      });

      // selection bounds
      const boundsWidth = maxX - minX;
      // const boundsHeight = maxY - minY;

      reactFlowInstance.setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          selected: nodeIds.includes(node.id) ? false : node.selected
        }))
      );

      // duplicate nodes with offset based on bounds
      nodeIds.forEach((nodeId) => {
        const originalNode = reactFlowInstance.getNode(nodeId);
        if (!originalNode) return;

        const newNodeId = uuidv4();
        duplicatedNodesIds.push(newNodeId);

        const newNode = {
          ...originalNode,
          id: newNodeId,
          position: {
            x: originalNode.position.x + boundsWidth + DUPLICATE_SPACING_X,
            y: originalNode.position.y
          },
          selected: true
        };

        addNode(newNode);
      });
    },
    [addNode, reactFlowInstance]
  );
};
