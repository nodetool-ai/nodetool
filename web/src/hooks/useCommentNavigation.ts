import { useCallback, useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";

interface CommentNavigationResult {
  commentIds: string[];
  currentIndex: number;
  navigateToNextComment: () => void;
  navigateToPreviousComment: () => void;
  openFindComments: () => void;
}

export const useCommentNavigation = (): CommentNavigationResult => {
  const { nodes } = useNodes((state) => ({ nodes: state.nodes }));
  const { setCenter } = useReactFlow();

  const commentIds = useMemo(() => {
    return nodes
      .filter((node) => node.type === "nodetool.workflows.base_node.Comment")
      .map((node) => node.id);
  }, [nodes]);

  const currentIndex = useMemo(() => {
    return 0;
  }, []);

  const navigateToNextComment = useCallback(() => {
    if (commentIds.length === 0) {
      return;
    }
    const nextIndex = (currentIndex + 1) % commentIds.length;
    const commentNode = nodes.find((n) => n.id === commentIds[nextIndex]);
    if (commentNode) {
      setCenter(
        commentNode.position.x + (commentNode.width || 200) / 2,
        commentNode.position.y + (commentNode.height || 120) / 2,
        { zoom: 1, duration: 300 }
      );
    }
  }, [commentIds, currentIndex, nodes, setCenter]);

  const navigateToPreviousComment = useCallback(() => {
    if (commentIds.length === 0) {
      return;
    }
    const prevIndex = currentIndex === 0 ? commentIds.length - 1 : currentIndex - 1;
    const commentNode = nodes.find((n) => n.id === commentIds[prevIndex]);
    if (commentNode) {
      setCenter(
        commentNode.position.x + (commentNode.width || 200) / 2,
        commentNode.position.y + (commentNode.height || 120) / 2,
        { zoom: 1, duration: 300 }
      );
    }
  }, [commentIds, currentIndex, nodes, setCenter]);

  const openFindComments = useCallback(() => {
    console.log("Find comments dialog - to be implemented");
  }, []);

  return {
    commentIds,
    currentIndex,
    navigateToNextComment,
    navigateToPreviousComment,
    openFindComments
  };
};
