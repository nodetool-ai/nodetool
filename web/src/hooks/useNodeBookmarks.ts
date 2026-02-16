import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodeBookmarkStore } from "../stores/NodeBookmarkStore";
import { Node } from "@xyflow/react";
import type { NodeData } from "../stores/NodeData";

/**
 * Hook for managing node bookmarks within a workflow.
 * Provides functions to add/remove bookmarks and navigate to bookmarked nodes.
 */
export const useNodeBookmarks = () => {
  const { getNode } = useReactFlow();
  const setBookmark = useNodeBookmarkStore((state) => state.setBookmark);
  const removeBookmarkByNodeId = useNodeBookmarkStore(
    (state) => state.removeBookmarkByNodeId
  );
  const getBookmarkForNode = useNodeBookmarkStore(
    (state) => state.getBookmarkForNode
  );
  const getBookmark = useNodeBookmarkStore((state) => state.getBookmark);
  const getBookmarksForWorkflow = useNodeBookmarkStore(
    (state) => state.getBookmarksForWorkflow
  );

  // Get workflowId from URL params or use a default
  // In practice, this should be obtained from the WorkflowManagerContext
  const getWorkflowId = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("workflow") || "default";
  }, []);

  /**
   * Sets a bookmark for the given node at the specified slot index.
   */
  const addNodeBookmark = useCallback(
    (nodeId: string, index: number, workflowId?: string) => {
      const node = getNode(nodeId) as Node<NodeData> | undefined;
      if (!node) {
        return;
      }

      const actualWorkflowId = workflowId || getWorkflowId();
      const nodeName =
        node.data?.title ||
        node.type ||
        "Untitled Node";

      setBookmark(
        actualWorkflowId,
        nodeId,
        node.type || "unknown",
        nodeName,
        { x: node.position.x, y: node.position.y },
        index
      );
    },
    [getNode, setBookmark, getWorkflowId]
  );

  /**
   * Removes the bookmark for the given node.
   */
  const removeNodeBookmark = useCallback(
    (nodeId: string, workflowId?: string) => {
      const actualWorkflowId = workflowId || getWorkflowId();
      removeBookmarkByNodeId(actualWorkflowId, nodeId);
    },
    [removeBookmarkByNodeId, getWorkflowId]
  );

  /**
   * Checks if a node has a bookmark and returns the bookmark if it exists.
   */
  const getNodeBookmark = useCallback(
    (nodeId: string, workflowId?: string) => {
      const actualWorkflowId = workflowId || getWorkflowId();
      return getBookmarkForNode(actualWorkflowId, nodeId);
    },
    [getBookmarkForNode, getWorkflowId]
  );

  /**
   * Gets a bookmark at the specified slot index.
   */
  const getBookmarkAt = useCallback(
    (index: number, workflowId?: string) => {
      const actualWorkflowId = workflowId || getWorkflowId();
      return getBookmark(actualWorkflowId, index);
    },
    [getBookmark, getWorkflowId]
  );

  /**
   * Gets all bookmarks for the current workflow.
   */
  const getAllBookmarks = useCallback(
    (workflowId?: string) => {
      const actualWorkflowId = workflowId || getWorkflowId();
      return getBookmarksForWorkflow(actualWorkflowId);
    },
    [getBookmarksForWorkflow, getWorkflowId]
  );

  return {
    addNodeBookmark,
    removeNodeBookmark,
    getNodeBookmark,
    getBookmarkAt,
    getAllBookmarks,
    getWorkflowId
  };
};

export default useNodeBookmarks;
