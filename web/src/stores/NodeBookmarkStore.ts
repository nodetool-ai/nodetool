import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodeBookmark {
  nodeId: string;
  label: string;
  nodeType: string;
  createdAt: number;
}

interface WorkflowBookmarks {
  [workflowId: string]: NodeBookmark[];
}

interface NodeBookmarkState {
  bookmarksByWorkflow: WorkflowBookmarks;
  toggleBookmark: (
    workflowId: string,
    nodeId: string,
    label: string,
    nodeType: string
  ) => void;
  removeBookmark: (workflowId: string, nodeId: string) => void;
  getBookmarks: (workflowId: string) => NodeBookmark[];
  isBookmarked: (workflowId: string, nodeId: string) => boolean;
  clearWorkflowBookmarks: (workflowId: string) => void;
}

export const useNodeBookmarkStore = create<NodeBookmarkState>()(
  persist(
    (set, get) => ({
      bookmarksByWorkflow: {},

      toggleBookmark: (
        workflowId: string,
        nodeId: string,
        label: string,
        nodeType: string
      ) => {
        set((state) => {
          const currentBookmarks = state.bookmarksByWorkflow[workflowId] || [];
          const existingIndex = currentBookmarks.findIndex(
            (b) => b.nodeId === nodeId
          );

          let newBookmarks: NodeBookmark[];
          if (existingIndex >= 0) {
            newBookmarks = currentBookmarks.filter((b) => b.nodeId !== nodeId);
          } else {
            newBookmarks = [
              ...currentBookmarks,
              {
                nodeId,
                label,
                nodeType,
                createdAt: Date.now()
              }
            ];
          }

          return {
            bookmarksByWorkflow: {
              ...state.bookmarksByWorkflow,
              [workflowId]: newBookmarks
            }
          };
        });
      },

      removeBookmark: (workflowId: string, nodeId: string) => {
        set((state) => {
          const currentBookmarks = state.bookmarksByWorkflow[workflowId] || [];
          const newBookmarks = currentBookmarks.filter(
            (b) => b.nodeId !== nodeId
          );

          return {
            bookmarksByWorkflow: {
              ...state.bookmarksByWorkflow,
              [workflowId]: newBookmarks
            }
          };
        });
      },

      getBookmarks: (workflowId: string) => {
        return get().bookmarksByWorkflow[workflowId] || [];
      },

      isBookmarked: (workflowId: string, nodeId: string) => {
        const bookmarks = get().bookmarksByWorkflow[workflowId] || [];
        return bookmarks.some((b) => b.nodeId === nodeId);
      },

      clearWorkflowBookmarks: (workflowId: string) => {
        set((state) => {
          const newBookmarks = { ...state.bookmarksByWorkflow };
          delete newBookmarks[workflowId];
          return { bookmarksByWorkflow: newBookmarks };
        });
      }
    }),
    {
      name: "node-bookmarks",
      version: 1
    }
  )
);
