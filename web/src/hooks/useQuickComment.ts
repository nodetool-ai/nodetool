import { useCallback } from "react";
import { useReactFlow, XYPosition } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { COMMENT_NODE_METADATA } from "../utils/nodeUtils";

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const randomValue = (Math.random() * 16) | 0;
    const hexValue = char === "x" ? randomValue : (randomValue & 3) | 8;
    return hexValue.toString(16);
  });
}

export const useQuickComment = () => {
  const { screenToFlowPosition } = useReactFlow();
  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }));

  const handleAddComment = useCallback(
    (position?: XYPosition) => {
      let flowPosition: XYPosition;

      if (position) {
        flowPosition = screenToFlowPosition(position);
      } else {
        flowPosition = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
      }

      const commentId = `comment_${uuidv4()}`;
      const newNode = createNode(
        COMMENT_NODE_METADATA,
        flowPosition,
        { id: commentId, title: "Comment" }
      );

      addNode(newNode);

      return commentId;
    },
    [screenToFlowPosition, createNode, addNode]
  );

  return { handleAddComment };
};

export default useQuickComment;
