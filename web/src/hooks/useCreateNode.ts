import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useCreateLoopNode } from "./nodes/useCreateLoopNode";
import { useNodes } from "../contexts/NodeContext";

// This hook encapsulates the logic for creating a new node in the graph.
// It handles translating screen coordinates to ReactFlow coordinates and
// delegates loop node creation to `useCreateLoopNode`.

export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
) => {
  const clickPosition = useNodeMenuStore((state) => state.clickPosition);
  const reactFlowInstance = useReactFlow();
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));

  const LOOP_NODE_TYPE = "nodetool.group.Loop";

  const createLoopNode = useCreateLoopNode();

  const handleCreateNode = useCallback(
    // Create a node at the last click position or at the provided center
    // position. Loop nodes are expanded into a group with input and output
    // child nodes handled by `createLoopNode`.
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) return;

      const position = centerPosition ?? clickPosition;
      const rfPos = reactFlowInstance.screenToFlowPosition(position);

      if (metadata.node_type === LOOP_NODE_TYPE) {
        createLoopNode(metadata, rfPos);
      } else {
        const newNode = createNode(metadata, rfPos);
        addNode(newNode);
      }
    },
    [
      reactFlowInstance,
      centerPosition,
      clickPosition,
      createLoopNode,
      createNode,
      addNode
    ]
  );

  return handleCreateNode;
};
