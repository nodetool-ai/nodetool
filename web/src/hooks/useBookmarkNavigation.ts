import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodeBookmarks } from "./useNodeBookmarks";
import { useNotificationStore } from "../stores/NotificationStore";

/**
 * Hook for navigating to bookmarked nodes.
 * Should be used within ReactFlowProvider context.
 */
export const useBookmarkNavigation = () => {
  const { getViewport, setViewport } = useReactFlow();
  const nodeBookmarks = useNodeBookmarks();
  const addNotification = useNotificationStore((state) => state.addNotification);

  /**
   * Navigate to a bookmark at the specified slot index.
   */
  const navigateToBookmark = useCallback(
    (index: number, workflowId?: string) => {
      const bookmark = nodeBookmarks.getBookmarkAt(index, workflowId);

      if (!bookmark) {
        addNotification({
          type: "warning",
          content: `No bookmark set at slot ${index}`,
          timeout: 2000
        });
        return false;
      }

      // Navigate to the bookmarked node position
      const viewport = getViewport();
      const targetX = -bookmark.position.x * viewport.zoom + window.innerWidth / 2;
      const targetY = -bookmark.position.y * viewport.zoom + window.innerHeight / 2;

      setViewport(
        {
          x: targetX,
          y: targetY,
          zoom: viewport.zoom
        },
        { duration: 300 }
      );

      addNotification({
        type: "info",
        content: `Navigated to ${bookmark.nodeName}`,
        timeout: 1500
      });

      return true;
    },
    [nodeBookmarks, getViewport, setViewport, addNotification]
  );

  return {
    navigateToBookmark
  };
};

export default useBookmarkNavigation;
