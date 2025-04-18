import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useCreateLoopNode } from "./nodes/useCreateLoopNode";
import { useNodes } from "../contexts/NodeContext";

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
