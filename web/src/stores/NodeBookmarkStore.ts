import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BookmarkedNode {
  nodeId: string;
  nodeType: string;
  label: string;
  timestamp: number;
}

interface WorkflowBookmarks {
  [workflowId: string]: BookmarkedNode[];
}

interface NodeBookmarkStore {
  bookmarks: WorkflowBookmarks;
  toggleBookmark: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    label: string
  ) => void;
  isBookmarked: (workflowId: string, nodeId: string) => boolean;
  getBookmarks: (workflowId: string) => BookmarkedNode[];
  removeBookmark: (workflowId: string, nodeId: string) => void;
  clearWorkflowBookmarks: (workflowId: string) => void;
  updateBookmarkLabel: (
    workflowId: string,
    nodeId: string,
    label: string
  ) => void;
}

export const useNodeBookmarkStore = create<NodeBookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarks: {},

      toggleBookmark: (
        workflowId: string,
        nodeId: string,
        nodeType: string,
        label: string
      ) => {
        const state = get();
        const workflowBookmarks = state.bookmarks[workflowId] || [];
        const existingIndex = workflowBookmarks.findIndex(
          (b) => b.nodeId === nodeId
        );

        if (existingIndex >= 0) {
          const updated = workflowBookmarks.filter((b) => b.nodeId !== nodeId);
          set({
            bookmarks: {
              ...state.bookmarks,
              [workflowId]: updated
            }
          });
        } else {
          const newBookmark: BookmarkedNode = {
            nodeId,
            nodeType,
            label,
            timestamp: Date.now()
          };
          set({
            bookmarks: {
              ...state.bookmarks,
              [workflowId]: [...workflowBookmarks, newBookmark]
            }
          });
        }
      },

      isBookmarked: (workflowId: string, nodeId: string) => {
        const workflowBookmarks = get().bookmarks[workflowId] || [];
        return workflowBookmarks.some((b) => b.nodeId === nodeId);
      },

      getBookmarks: (workflowId: string) => {
        return get().bookmarks[workflowId] || [];
      },

      removeBookmark: (workflowId: string, nodeId: string) => {
        const state = get();
        const workflowBookmarks = state.bookmarks[workflowId] || [];
        set({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: workflowBookmarks.filter((b) => b.nodeId !== nodeId)
          }
        });
      },

      clearWorkflowBookmarks: (workflowId: string) => {
        const state = get();
        const { [workflowId]: _, ...rest } = state.bookmarks;
        set({ bookmarks: rest });
      },

      updateBookmarkLabel: (
        workflowId: string,
        nodeId: string,
        label: string
      ) => {
        const state = get();
        const workflowBookmarks = state.bookmarks[workflowId] || [];
        set({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: workflowBookmarks.map((b) =>
              b.nodeId === nodeId ? { ...b, label } : b
            )
          }
        });
      }
    }),
    {
      name: "node-bookmarks"
    }
  )
);
