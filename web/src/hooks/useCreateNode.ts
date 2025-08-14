import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";

// This hook encapsulates the logic for creating a new node in the graph.
// It handles translating screen coordinates to ReactFlow coordinates and

export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
) => {
  const { clickPosition, closeNodeMenu } = useNodeMenuStore((state) => ({
    clickPosition: state.clickPosition,
    closeNodeMenu: state.closeNodeMenu
  }));
  const reactFlowInstance = useReactFlow();
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));

  const handleCreateNode = useCallback(
    // Create a node at the last click position or at the provided center
    // position. Loop nodes are expanded into a group with input and output
    // child nodes handled by `createLoopNode`.
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) return;

      const position = centerPosition ?? clickPosition;
      const rfPos = reactFlowInstance.screenToFlowPosition(position);

      const newNode = createNode(metadata, rfPos);
      addNode(newNode);
      
      // Close the node menu after creating a node
      closeNodeMenu();
    },
    [reactFlowInstance, centerPosition, clickPosition, createNode, addNode, closeNodeMenu]
  );

  return handleCreateNode;
};
