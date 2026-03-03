import { useEffect, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodeBookmarks } from "./useNodeBookmarks";
import { useBookmarkNavigation } from "./useBookmarkNavigation";
import { useNotificationStore } from "../stores/NotificationStore";

/**
 * Hook to handle keyboard shortcuts for node bookmarks.
 *
 * Shortcuts:
 * - Ctrl+Shift+1-9: Set bookmark at slot 1-9 for selected node
 * - Alt+1-9: Navigate to bookmark at slot 1-9
 *
 * This hook should be used within a ReactFlowProvider context.
 */
export const useBookmarkShortcuts = () => {
  const { getNodes } = useReactFlow();
  const nodeBookmarks = useNodeBookmarks();
  const { navigateToBookmark } = useBookmarkNavigation();
  const addNotification = useNotificationStore((state) => state.addNotification);

  // Set bookmark for selected node at specified index
  const setBookmarkForSelected = useCallback(
    (index: number) => {
      const nodes = getNodes();
      const selectedNodes = nodes.filter((n) => n.selected);

      if (selectedNodes.length === 0) {
        addNotification({
          type: "warning",
          content: "No node selected. Select a node to bookmark.",
          timeout: 2000
        });
        return;
      }

      if (selectedNodes.length > 1) {
        addNotification({
          type: "warning",
          content: "Select only one node to bookmark.",
          timeout: 2000
        });
        return;
      }

      const node = selectedNodes[0];
      const workflowId = nodeBookmarks.getWorkflowId();
      nodeBookmarks.addNodeBookmark(node.id, index, workflowId);

      addNotification({
        type: "success",
        content: `Bookmark ${index} set`,
        timeout: 1500
      });
    },
    [getNodes, nodeBookmarks, addNotification]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+1-9 (set bookmark)
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key >= "1" &&
        event.key <= "9"
      ) {
        event.preventDefault();
        const index = parseInt(event.key, 10);
        setBookmarkForSelected(index);
        return;
      }

      // Check for Alt+1-9 (navigate to bookmark)
      if (event.altKey && event.key >= "1" && event.key <= "9") {
        event.preventDefault();
        const index = parseInt(event.key, 10);
        const workflowId = nodeBookmarks.getWorkflowId();
        navigateToBookmark(index, workflowId);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setBookmarkForSelected, navigateToBookmark, nodeBookmarks]);
};

export default useBookmarkShortcuts;
