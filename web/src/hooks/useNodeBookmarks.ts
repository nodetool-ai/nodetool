/**
 * useNodeBookmarks
 *
 * Custom hook for managing node bookmarks functionality.
 * Provides methods to toggle bookmarks and navigate between bookmarked nodes.
 */

import { useCallback, useMemo } from "react";
import { useReactFlow, Node } from "@xyflow/react";
import { useNodeBookmarksStore } from "../stores/NodeBookmarksStore";
import useMetadataStore from "../stores/MetadataStore";
import type { NodeData } from "../stores/NodeData";

export interface UseNodeBookmarksOptions {
  workflowId: string;
}

import type { NodeBookmark } from "../stores/NodeBookmarksStore";

export interface UseNodeBookmarksOptions {
  workflowId: string;
}

export interface UseNodeBookmarksReturn {
  /** Check if a node is bookmarked */
  isBookmarked: (nodeId: string) => boolean;
  /** Toggle bookmark status for a node */
  toggleBookmark: (nodeId: string) => void;
  /** Add a bookmark for a node */
  addBookmark: (nodeId: string) => void;
  /** Remove a bookmark for a node */
  removeBookmark: (nodeId: string) => void;
  /** Navigate to a bookmarked node */
  navigateToBookmark: (nodeId: string) => void;
  /** Get all bookmarks for current workflow */
  workflowBookmarks: NodeBookmark[];
  /** Get bookmark info for display */
  getBookmarkInfo: (nodeId: string) => { label: string; nodeType: string } | null;
}

/**
 * Hook for managing node bookmarks within a workflow.
 *
 * @param options - Configuration options
 * @param options.workflowId - The current workflow ID
 *
 * @example
 * ```tsx
 * const { isBookmarked, toggleBookmark } = useNodeBookmarks({ workflowId: "my-workflow" });
 *
 * <IconButton onClick={() => toggleBookmark(nodeId)}>
 *   {isBookmarked(nodeId) ? <BookmarkIcon /> : <BookmarkBorderIcon />}
 * </IconButton>
 * ```
 */
export function useNodeBookmarks(
  options: UseNodeBookmarksOptions
): UseNodeBookmarksReturn {
  const { workflowId } = options;
  const { getNode, setCenter } = useReactFlow();

  const {
    isBookmarked: checkIsBookmarked,
    toggleBookmark: storeToggleBookmark,
    addBookmark: storeAddBookmark,
    removeBookmark: storeRemoveBookmark,
    getWorkflowBookmarks
  } = useNodeBookmarksStore();

  const isBookmarked = useCallback(
    (nodeId: string) => {
      return checkIsBookmarked(nodeId, workflowId);
    },
    [checkIsBookmarked, workflowId]
  );

  const getNodeInfo = useCallback((node: Node<NodeData>) => {
    const nodeType = node.type || "unknown";
    const metadata = useMetadataStore.getState().getMetadata(nodeType);
    return {
      label: metadata?.title || nodeType,
      nodeType
    };
  }, []);

  const toggleBookmark = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node) {
        return;
      }

      const info = getNodeInfo(node as Node<NodeData>);
      storeToggleBookmark(
        nodeId,
        workflowId,
        node.position,
        info.label
      );
    },
    [getNode, getNodeInfo, storeToggleBookmark, workflowId]
  );

  const addBookmark = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node) {
        return;
      }

      const info = getNodeInfo(node as Node<NodeData>);
      storeAddBookmark(
        nodeId,
        workflowId,
        node.position,
        info.label
      );
    },
    [getNode, getNodeInfo, storeAddBookmark, workflowId]
  );

  const removeBookmark = useCallback(
    (nodeId: string) => {
      storeRemoveBookmark(nodeId, workflowId);
    },
    [storeRemoveBookmark, workflowId]
  );

  const navigateToBookmark = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (node) {
        setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 300 });
      }
    },
    [getNode, setCenter]
  );

  const getBookmarkInfo = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node) {
        return null;
      }

      return getNodeInfo(node as Node<NodeData>);
    },
    [getNode, getNodeInfo]
  );

  const workflowBookmarks = useMemo(() => {
    return getWorkflowBookmarks(workflowId);
  }, [getWorkflowBookmarks, workflowId]);

  return {
    isBookmarked,
    toggleBookmark,
    addBookmark,
    removeBookmark,
    navigateToBookmark,
    workflowBookmarks,
    getBookmarkInfo
  };
}

export default useNodeBookmarks;
