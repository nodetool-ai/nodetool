/**
 * useWorkflowBookmarks Hook
 *
 * Provides workflow bookmark functionality including adding, removing,
 * and navigating to bookmarked nodes. Includes keyboard shortcuts for
 * quick access (0-9).
 *
 * @example
 * ```tsx
 * const { bookmarks, addBookmark, removeBookmark, navigateToBookmark } = useWorkflowBookmarks();
 *
 * // Add current node to bookmarks
 * addBookmark(nodeId, "My important node");
 *
 * // Navigate to bookmark by index
 * navigateToBookmark(0); // Goes to bookmark 0
 * ```
 */

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  useWorkflowBookmarksStore,
  type WorkflowBookmark
} from "../stores/WorkflowBookmarksStore";
import { useNodes } from "../contexts/NodeContext";
import type { Node } from "@xyflow/react";

/**
 * Options for the workflow bookmarks hook
 */
export interface UseWorkflowBookmarksOptions {
  /** The current workflow ID */
  workflowId: string | undefined;
  /** Optional callback when a bookmark is added */
  onBookmarkAdded?: (bookmark: WorkflowBookmark) => void;
  /** Optional callback when a bookmark is removed */
  onBookmarkRemoved?: (nodeId: string) => void;
}

/**
 * Return type for useWorkflowBookmarks hook
 */
export interface UseWorkflowBookmarksReturn {
  /** All bookmarks for the current workflow */
  bookmarks: WorkflowBookmark[];
  /** Add a bookmark for a node */
  addBookmark: (nodeId: string, label?: string) => void;
  /** Remove a bookmark */
  removeBookmark: (nodeId: string) => void;
  /** Update bookmark label */
  updateBookmarkLabel: (nodeId: string, label: string) => void;
  /** Check if a node is bookmarked */
  isNodeBookmarked: (nodeId: string) => boolean;
  /** Navigate to a bookmark by index (0-9) */
  navigateToBookmark: (index: number) => void;
  /** Navigate to a specific node */
  navigateToNode: (nodeId: string) => void;
  /** Clear all bookmarks for the current workflow */
  clearAllBookmarks: () => void;
  /** Get a bookmark by index */
  getBookmarkByIndex: (index: number) => WorkflowBookmark | undefined;
}

/**
 * Hook for managing workflow bookmarks
 *
 * @param options - Configuration options for the hook
 * @returns Bookmark management functions and state
 */
export const useWorkflowBookmarks = (
  options: UseWorkflowBookmarksOptions
): UseWorkflowBookmarksReturn => {
  const { workflowId, onBookmarkAdded, onBookmarkRemoved } = options;
  const reactFlowInstance = useReactFlow();
  const nodes = useNodes((state: unknown) => (state as { nodes: Node[] }).nodes);

  // Get bookmarks for current workflow
  const bookmarks = useWorkflowBookmarksStore(
    (state) =>
      workflowId ? state.getWorkflowBookmarks(workflowId) : []
  );

  const addBookmark = useCallback(
    (nodeId: string, label?: string) => {
      if (!workflowId) {
        return;
      }

      const { addBookmark: storeAddBookmark, getBookmark } =
        useWorkflowBookmarksStore.getState();

      // Check if already bookmarked
      const existing = getBookmark(workflowId, nodeId);
      if (existing) {
        // Just update label if provided
        if (label !== undefined) {
          useWorkflowBookmarksStore.getState().setBookmarkLabel(
            workflowId,
            nodeId,
            label
          );
        }
        return;
      }

      storeAddBookmark(workflowId, nodeId, label);

      // Trigger callback
      const newBookmark = useWorkflowBookmarksStore.getState().getBookmark(
        workflowId,
        nodeId
      );
      if (newBookmark && onBookmarkAdded) {
        onBookmarkAdded(newBookmark);
      }
    },
    [workflowId, onBookmarkAdded]
  );

  const removeBookmark = useCallback(
    (nodeId: string) => {
      if (!workflowId) {
        return;
      }

      useWorkflowBookmarksStore.getState().removeBookmark(workflowId, nodeId);

      if (onBookmarkRemoved) {
        onBookmarkRemoved(nodeId);
      }
    },
    [workflowId, onBookmarkRemoved]
  );

  const updateBookmarkLabel = useCallback(
    (nodeId: string, label: string) => {
      if (!workflowId) {
        return;
      }

      useWorkflowBookmarksStore.getState().setBookmarkLabel(
        workflowId,
        nodeId,
        label
      );
    },
    [workflowId]
  );

  const isNodeBookmarked = useCallback(
    (nodeId: string) => {
      if (!workflowId) {
        return false;
      }
      return useWorkflowBookmarksStore.getState().isNodeBookmarked(
        workflowId,
        nodeId
      );
    },
    [workflowId]
  );

  const navigateToNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {
        return;
      }

      // Select the node
      useNodes((state: unknown) => {
        const s = state as { setSelectedNodes: (nodeIds: string[]) => void };
        s.setSelectedNodes([nodeId]);
        return undefined;
      });

      // Zoom to the node with some padding
      reactFlowInstance.setCenter(
        node.position.x + (node.width?.valueOf() ?? 200) / 2,
        node.position.y + (node.height?.valueOf() ?? 100) / 2,
        { zoom: 1, duration: 300 }
      );
    },
    [nodes, reactFlowInstance]
  );

  const navigateToBookmark = useCallback(
    (index: number) => {
      if (!workflowId) {
        return;
      }

      const bookmark = useWorkflowBookmarksStore.getState().getNumberedBookmark(
        workflowId,
        index
      );

      if (bookmark) {
        navigateToNode(bookmark.nodeId);
      }
    },
    [workflowId, navigateToNode]
  );

  const clearAllBookmarks = useCallback(() => {
    if (!workflowId) {
      return;
    }

    useWorkflowBookmarksStore.getState().clearWorkflowBookmarks(workflowId);
  }, [workflowId]);

  const getBookmarkByIndex = useCallback(
    (index: number) => {
      if (!workflowId) {
        return undefined;
      }

      return useWorkflowBookmarksStore.getState().getNumberedBookmark(
        workflowId,
        index
      );
    },
    [workflowId]
  );

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    updateBookmarkLabel,
    isNodeBookmarked,
    navigateToBookmark,
    navigateToNode,
    clearAllBookmarks,
    getBookmarkByIndex
  };
};
