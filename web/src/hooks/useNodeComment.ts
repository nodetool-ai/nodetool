import { useCallback } from "react";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";
import { Node } from "@xyflow/react";

interface UseNodeCommentReturn {
  comment: string | undefined;
  updateComment: (nodeId: string, comment: string) => void;
  deleteComment: (nodeId: string) => void;
}

export const useNodeComment = (nodeId: string): UseNodeCommentReturn => {
  const nodes = useNodes((state) => state.nodes);
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const comment = nodes.find((n: Node<NodeData>) => n.id === nodeId)?.data.comment;

  const updateComment = useCallback(
    (id: string, newComment: string) => {
      updateNodeData(id, { comment: newComment || undefined });
    },
    [updateNodeData]
  );

  const deleteComment = useCallback(
    (id: string) => {
      updateNodeData(id, { comment: undefined });
    },
    [updateNodeData]
  );

  return {
    comment,
    updateComment,
    deleteComment,
  };
};

export default useNodeComment;
