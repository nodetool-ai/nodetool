/**
 * useCanvasBookmarks hook for managing canvas bookmarks in the workflow editor.
 */

import { useCallback, useMemo } from "react";
import { useReactFlow, Viewport } from "@xyflow/react";
import useBookmarkStore, { CanvasBookmark } from "../stores/BookmarkStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../stores/NotificationStore";

interface UseCanvasBookmarksReturn {
  bookmarks: CanvasBookmark[];
  activeBookmarkId: string | null;
  addBookmark: (name: string) => void;
  removeBookmark: (bookmarkId: string) => void;
  updateBookmark: (
    bookmarkId: string,
    updates: Partial<Pick<CanvasBookmark, "name" | "viewport">>
  ) => void;
  jumpToBookmark: (bookmarkId: string) => void;
  saveBookmarkPosition: (bookmarkId: string) => void;
  clearAllBookmarks: () => void;
  isBookmarkActive: (bookmarkId: string) => boolean;
}

export const useCanvasBookmarks = (): UseCanvasBookmarksReturn => {
  const { getViewport, setViewport } = useReactFlow();
  const workflowManager = useWorkflowManager((state) => ({
    getCurrentWorkflow: state.getCurrentWorkflow,
  }));
  const addNotification = useNotificationStore((state) => state.addNotification);

  const {
    activeBookmarkId,
    addBookmark: storeAddBookmark,
    removeBookmark: storeRemoveBookmark,
    updateBookmark: storeUpdateBookmark,
    setActiveBookmark,
    clearBookmarks: storeClearBookmarks,
    getBookmarks,
  } = useBookmarkStore();

  const currentWorkflow = workflowManager.getCurrentWorkflow();
  const workflowId = currentWorkflow?.id || "";

  const workflowBookmarks = useMemo(() => {
    if (!workflowId) {return [];}
    const store = useBookmarkStore.getState();
    return store.getBookmarks(workflowId);
  }, [workflowId]);

  const handleAddBookmark = useCallback(
    (name: string) => {
      if (!workflowId) {
        addNotification({
          content: "Cannot add bookmark: no workflow active",
          type: "error",
          alert: true,
        });
        return;
      }

      const viewport = getViewport();
      const id = storeAddBookmark(workflowId, name, viewport);

      addNotification({
        content: `Bookmark "${name}" saved`,
        type: "success",
        alert: false,
      });

      return id;
    },
    [workflowId, getViewport, storeAddBookmark, addNotification]
  );

  const handleRemoveBookmark = useCallback(
    (bookmarkId: string) => {
      if (!workflowId) {return;}

      const currentBookmarks = getBookmarks(workflowId);
      const bookmark = currentBookmarks.find((b) => b.id === bookmarkId);
      storeRemoveBookmark(workflowId, bookmarkId);

      addNotification({
        content: `Bookmark "${bookmark?.name || "Unknown"}" removed`,
        type: "success",
        alert: false,
      });
    },
    [workflowId, getBookmarks, storeRemoveBookmark, addNotification]
  );

  const handleUpdateBookmark = useCallback(
    (
      bookmarkId: string,
      updates: Partial<Pick<CanvasBookmark, "name" | "viewport">>
    ) => {
      if (!workflowId) {return;}
      storeUpdateBookmark(workflowId, bookmarkId, updates);
    },
    [workflowId, storeUpdateBookmark]
  );

  const handleJumpToBookmark = useCallback(
    (bookmarkId: string) => {
      const bookmark = workflowBookmarks.find((b) => b.id === bookmarkId);
      if (bookmark) {
        setViewport(bookmark.viewport);
        setActiveBookmark(bookmarkId);

        addNotification({
          content: `Jumped to bookmark "${bookmark.name}"`,
          type: "success",
          alert: false,
        });

        setTimeout(() => setActiveBookmark(null), 2000);
      }
    },
    [workflowBookmarks, setViewport, setActiveBookmark, addNotification]
  );

  const handleSaveBookmarkPosition = useCallback(
    (bookmarkId: string) => {
      if (!workflowId) {return;}

      const viewport = getViewport();
      storeUpdateBookmark(workflowId, bookmarkId, { viewport });

      const currentBookmarks = getBookmarks(workflowId);
      const bookmark = currentBookmarks.find((b) => b.id === bookmarkId);
      addNotification({
        content: `Position updated for bookmark "${bookmark?.name || "Unknown"}"`,
        type: "success",
        alert: false,
      });
    },
    [workflowId, getViewport, storeUpdateBookmark, getBookmarks, addNotification]
  );

  const handleClearAllBookmarks = useCallback(() => {
    if (!workflowId) {return;}
    storeClearBookmarks(workflowId);

    addNotification({
      content: "All bookmarks cleared",
      type: "success",
      alert: false,
    });
  }, [workflowId, storeClearBookmarks, addNotification]);

  const isBookmarkActive = useCallback(
    (bookmarkId: string) => activeBookmarkId === bookmarkId,
    [activeBookmarkId]
  );

  return {
    bookmarks: workflowBookmarks,
    activeBookmarkId,
    addBookmark: handleAddBookmark,
    removeBookmark: handleRemoveBookmark,
    updateBookmark: handleUpdateBookmark,
    jumpToBookmark: handleJumpToBookmark,
    saveBookmarkPosition: handleSaveBookmarkPosition,
    clearAllBookmarks: handleClearAllBookmarks,
    isBookmarkActive,
  };
};
