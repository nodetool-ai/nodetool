import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { COMMENT_NODE_METADATA } from "../utils/nodeUtils";
import { getMousePosition } from "../utils/MousePosition";

export const useAddComment = () => {
  const reactFlowInstance = useReactFlow();
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));

  const addComment = useCallback(() => {
    if (!reactFlowInstance) {
      return;
    }

    const mousePos = getMousePosition();
    const position = reactFlowInstance.screenToFlowPosition(mousePos);

    const newNode = createNode(COMMENT_NODE_METADATA, position);
    newNode.width = 200;
    newNode.height = 120;
    newNode.style = { width: 200, height: 120 };
    addNode(newNode);
  }, [reactFlowInstance, createNode, addNode]);

  return addComment;
};
