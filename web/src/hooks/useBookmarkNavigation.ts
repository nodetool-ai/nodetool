/**
 * useBookmarkNavigation
 *
 * Custom hook for keyboard navigation between bookmarked nodes.
 * Allows users to cycle through bookmarks using keyboard shortcuts.
 */

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodeBookmarksStore } from "../stores/NodeBookmarksStore";

interface UseBookmarkNavigationOptions {
  enabled?: boolean;
  onNavigateError?: () => void;
}

export const useBookmarkNavigation = ({
  enabled = true,
  onNavigateError
}: UseBookmarkNavigationOptions = {}) => {
  const bookmarks = useNodeBookmarksStore((state) => state.bookmarks);
  const reactFlowInstance = useReactFlow();

  const navigateToBookmark = useCallback((index: number) => {
    if (!enabled || bookmarks.length === 0) {
      onNavigateError?.();
      return false;
    }

    // Wrap index to stay within bounds
    const wrappedIndex = ((index % bookmarks.length) + bookmarks.length) % bookmarks.length;
    const bookmark = bookmarks[wrappedIndex];

    if (bookmark) {
      const node = reactFlowInstance.getNode(bookmark.nodeId);
      if (node) {
        reactFlowInstance.setCenter(
          node.position.x + (node.width?.valueOf() ?? 200) / 2,
          node.position.y + (node.height?.valueOf() ?? 100) / 2,
          { zoom: 1, duration: 300 }
        );

        reactFlowInstance.setNodes((nodes) =>
          nodes.map((n) => ({
            ...n,
            selected: n.id === bookmark.nodeId
          }))
        );
        return true;
      }
    }

    onNavigateError?.();
    return false;
  }, [bookmarks, enabled, reactFlowInstance, onNavigateError]);

  const navigateToNextBookmark = useCallback(() => {
    // Find currently selected node and go to the next bookmark
    const selectedNode = reactFlowInstance.getNodes().find(n => n.selected);
    let currentIndex = -1;
    
    if (selectedNode) {
      currentIndex = bookmarks.findIndex(b => b.nodeId === selectedNode.id);
    }
    
    return navigateToBookmark(currentIndex + 1);
  }, [reactFlowInstance, bookmarks, navigateToBookmark]);

  const navigateToPrevBookmark = useCallback(() => {
    // Find currently selected node and go to the previous bookmark
    const selectedNode = reactFlowInstance.getNodes().find(n => n.selected);
    let currentIndex = bookmarks.length; // Start from end if nothing selected
    
    if (selectedNode) {
      currentIndex = bookmarks.findIndex(b => b.nodeId === selectedNode.id);
    }
    
    return navigateToBookmark(currentIndex - 1);
  }, [reactFlowInstance, bookmarks, navigateToBookmark]);

  return {
    bookmarks,
    navigateToBookmark,
    navigateToNextBookmark,
    navigateToPrevBookmark,
    hasNextBookmark: bookmarks.length > 0,
    hasPrevBookmark: bookmarks.length > 0
  };
};

export default useBookmarkNavigation;
