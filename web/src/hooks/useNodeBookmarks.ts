import { useCallback, useState } from "react";
import { useNodeBookmarkStore } from "../stores/NodeBookmarkStore";
import { useNodes } from "../contexts/NodeContext";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useMetadataStore from "../stores/MetadataStore";
import { useNotificationStore } from "../stores/NotificationStore";

interface UseNodeBookmarksReturn {
  toggleBookmarkForSelected: () => void;
  showBookmarksPanel: boolean;
  setShowBookmarksPanel: (show: boolean) => void;
  toggleBookmarksPanel: () => void;
  workflowId: string | null;
  bookmarkCount: number;
}

export const useNodeBookmarks = (): UseNodeBookmarksReturn => {
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);

  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const toggleBookmark = useNodeBookmarkStore((state) => state.toggleBookmark);
  const isBookmarked = useNodeBookmarkStore((state) => state.isBookmarked);
  const getBookmarks = useNodeBookmarkStore((state) => state.getBookmarks);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const bookmarkCount = currentWorkflowId
    ? getBookmarks(currentWorkflowId).length
    : 0;

  const toggleBookmarkForSelected = useCallback(() => {
    if (!currentWorkflowId) {
      return;
    }

    if (selectedNodes.length === 0) {
      addNotification({
        content: "Select a node to bookmark",
        type: "info",
        alert: true
      });
      return;
    }

    let addedCount = 0;
    let removedCount = 0;

    selectedNodes.forEach((node) => {
      const nodeType = node.type || "unknown";
      const metadata = useMetadataStore.getState().getMetadata(nodeType);
      const label = metadata?.title || nodeType;

      const wasBookmarked = isBookmarked(currentWorkflowId, node.id);
      toggleBookmark(currentWorkflowId, node.id, label, nodeType);

      if (wasBookmarked) {
        removedCount++;
      } else {
        addedCount++;
      }
    });

    if (addedCount > 0 && removedCount === 0) {
      addNotification({
        content:
          addedCount === 1
            ? "Node bookmarked"
            : `${addedCount} nodes bookmarked`,
        type: "success",
        alert: true
      });
    } else if (removedCount > 0 && addedCount === 0) {
      addNotification({
        content:
          removedCount === 1
            ? "Bookmark removed"
            : `${removedCount} bookmarks removed`,
        type: "info",
        alert: true
      });
    } else if (addedCount > 0 && removedCount > 0) {
      addNotification({
        content: `${addedCount} bookmarked, ${removedCount} unbookmarked`,
        type: "info",
        alert: true
      });
    }
  }, [
    currentWorkflowId,
    selectedNodes,
    toggleBookmark,
    isBookmarked,
    addNotification
  ]);

  const toggleBookmarksPanel = useCallback(() => {
    setShowBookmarksPanel((prev) => !prev);
  }, []);

  return {
    toggleBookmarkForSelected,
    showBookmarksPanel,
    setShowBookmarksPanel,
    toggleBookmarksPanel,
    workflowId: currentWorkflowId,
    bookmarkCount
  };
};
