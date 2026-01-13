import { create } from "zustand";
import { persist } from "zustand/middleware";

interface NodeBookmark {
  nodeId: string;
  label?: string;
  createdAt: number;
}

interface NodeBookmarkStore {
  bookmarks: Record<string, NodeBookmark[]>;
  toggleBookmark: (workflowId: string, nodeId: string, label?: string) => void;
  addBookmark: (workflowId: string, nodeId: string, label?: string) => void;
  removeBookmark: (workflowId: string, nodeId: string) => void;
  isBookmarked: (workflowId: string, nodeId: string) => boolean;
  getBookmarks: (workflowId: string) => NodeBookmark[];
  updateBookmarkLabel: (workflowId: string, nodeId: string, label: string) => void;
  clearBookmarks: (workflowId: string) => void;
}

const useNodeBookmarkStore = create<NodeBookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarks: {},

      toggleBookmark: (workflowId: string, nodeId: string, label?: string) => {
        const isCurrentlyBookmarked = get().isBookmarked(workflowId, nodeId);
        if (isCurrentlyBookmarked) {
          get().removeBookmark(workflowId, nodeId);
        } else {
          get().addBookmark(workflowId, nodeId, label);
        }
      },

      addBookmark: (workflowId: string, nodeId: string, label?: string) => {
        const currentBookmarks = get().bookmarks[workflowId] || [];
        if (currentBookmarks.some((b) => b.nodeId === nodeId)) {
          return;
        }
        set({
          bookmarks: {
            ...get().bookmarks,
            [workflowId]: [
              ...currentBookmarks,
              { nodeId, label, createdAt: Date.now() }
            ]
          }
        });
      },

      removeBookmark: (workflowId: string, nodeId: string) => {
        const currentBookmarks = get().bookmarks[workflowId] || [];
        set({
          bookmarks: {
            ...get().bookmarks,
            [workflowId]: currentBookmarks.filter((b) => b.nodeId !== nodeId)
          }
        });
      },

      isBookmarked: (workflowId: string, nodeId: string) => {
        const workflowBookmarks = get().bookmarks[workflowId] || [];
        return workflowBookmarks.some((b) => b.nodeId === nodeId);
      },

      getBookmarks: (workflowId: string) => {
        return get().bookmarks[workflowId] || [];
      },

      updateBookmarkLabel: (
        workflowId: string,
        nodeId: string,
        label: string
      ) => {
        const currentBookmarks = get().bookmarks[workflowId] || [];
        set({
          bookmarks: {
            ...get().bookmarks,
            [workflowId]: currentBookmarks.map((b) =>
              b.nodeId === nodeId ? { ...b, label } : b
            )
          }
        });
      },

      clearBookmarks: (workflowId: string) => {
        const newBookmarks = { ...get().bookmarks };
        delete newBookmarks[workflowId];
        set({ bookmarks: newBookmarks });
      }
    }),
    {
      name: "node-bookmarks"
    }
  )
);

export default useNodeBookmarkStore;
