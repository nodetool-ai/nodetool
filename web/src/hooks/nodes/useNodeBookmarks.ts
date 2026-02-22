/**
 * useNodeBookmarks Hook
 *
 * Provides bookmark functionality for use in the node context menu.
 * Handles adding/removing bookmarks for individual nodes.
 *
 * @example
 * ```tsx
 * const { addBookmark, removeBookmark, isNodeBookmarked } = useNodeBookmarks();
 * ```
 */

import { useCallback } from "react";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflowBookmarksStore } from "../../stores/WorkflowBookmarksStore";
import type { WorkflowBookmark } from "../../stores/WorkflowBookmarksStore";

/**
 * Return type for useNodeBookmarks hook
 */
export interface UseNodeBookmarksReturn {
  /** Add a bookmark for the specified node */
  addBookmark: (nodeId: string, label?: string) => void;
  /** Remove a bookmark for the specified node */
  removeBookmark: (nodeId: string) => void;
  /** Toggle bookmark status (add if not bookmarked, remove if bookmarked) */
  toggleBookmark: (nodeId: string, label?: string) => void;
  /** Check if a node is bookmarked */
  isNodeBookmarked: (nodeId: string) => boolean;
  /** Get the bookmark for a node (if exists) */
  getBookmark: (nodeId: string) => WorkflowBookmark | undefined;
}

/**
 * Hook for managing bookmarks on individual nodes
 * Useful for node context menu integration
 *
 * @returns Bookmark management functions
 */
export const useNodeBookmarks = (): UseNodeBookmarksReturn => {
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);

  const addBookmark = useCallback(
    (nodeId: string, label?: string) => {
      if (!currentWorkflowId) {
        console.warn("No current workflow ID - cannot add bookmark");
        return;
      }

      const nodeName = label; // In full implementation, this would be derived from node data
      useWorkflowBookmarksStore.getState().addBookmark(
        currentWorkflowId,
        nodeId,
        nodeName
      );
    },
    [currentWorkflowId]
  );

  const removeBookmark = useCallback(
    (nodeId: string) => {
      if (!currentWorkflowId) {
        return;
      }

      useWorkflowBookmarksStore.getState().removeBookmark(
        currentWorkflowId,
        nodeId
      );
    },
    [currentWorkflowId]
  );

  const toggleBookmark = useCallback(
    (nodeId: string, label?: string) => {
      if (!currentWorkflowId) {
        return;
      }

      const isBookmarked = useWorkflowBookmarksStore
        .getState()
        .isNodeBookmarked(currentWorkflowId, nodeId);

      if (isBookmarked) {
        removeBookmark(nodeId);
      } else {
        addBookmark(nodeId, label);
      }
    },
    [currentWorkflowId, addBookmark, removeBookmark]
  );

  const isNodeBookmarked = useCallback(
    (nodeId: string) => {
      if (!currentWorkflowId) {
        return false;
      }

      return useWorkflowBookmarksStore.getState().isNodeBookmarked(
        currentWorkflowId,
        nodeId
      );
    },
    [currentWorkflowId]
  );

  const getBookmark = useCallback(
    (nodeId: string) => {
      if (!currentWorkflowId) {
        return undefined;
      }

      return useWorkflowBookmarksStore.getState().getBookmark(
        currentWorkflowId,
        nodeId
      );
    },
    [currentWorkflowId]
  );

  return {
    addBookmark,
    removeBookmark,
    toggleBookmark,
    isNodeBookmarked,
    getBookmark
  };
};
