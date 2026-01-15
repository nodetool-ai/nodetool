/**
 * NodeBookmarkStore
 *
 * Tracks bookmarked nodes within workflows for quick identification.
 * Bookmarks are stored per-workflow and persisted to localStorage.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BookmarkedNode {
  nodeId: string;
  workflowId: string;
  timestamp: number;
}

interface NodeBookmarkStore {
  bookmarks: BookmarkedNode[];
  addBookmark: (nodeId: string, workflowId: string) => void;
  removeBookmark: (nodeId: string, workflowId: string) => void;
  isBookmarked: (nodeId: string, workflowId: string) => boolean;
  toggleBookmark: (nodeId: string, workflowId: string) => void;
  getWorkflowBookmarks: (workflowId: string) => BookmarkedNode[];
  clearWorkflowBookmarks: (workflowId: string) => void;
  clearAllBookmarks: () => void;
}

export const useNodeBookmarkStore = create<NodeBookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addBookmark: (nodeId: string, workflowId: string) => {
        set((state) => {
          const isAlreadyBookmarked = state.bookmarks.some(
            (b) => b.nodeId === nodeId && b.workflowId === workflowId
          );
          if (isAlreadyBookmarked) {
            return state;
          }
          const updated = [
            ...state.bookmarks,
            { nodeId, workflowId, timestamp: Date.now() }
          ];
          return { bookmarks: updated };
        });
      },

      removeBookmark: (nodeId: string, workflowId: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter(
            (b) => !(b.nodeId === nodeId && b.workflowId === workflowId)
          )
        }));
      },

      isBookmarked: (nodeId: string, workflowId: string) => {
        return get().bookmarks.some(
          (b) => b.nodeId === nodeId && b.workflowId === workflowId
        );
      },

      toggleBookmark: (nodeId: string, workflowId: string) => {
        if (get().isBookmarked(nodeId, workflowId)) {
          get().removeBookmark(nodeId, workflowId);
        } else {
          get().addBookmark(nodeId, workflowId);
        }
      },

      getWorkflowBookmarks: (workflowId: string) => {
        return get().bookmarks.filter((b) => b.workflowId === workflowId);
      },

      clearWorkflowBookmarks: (workflowId: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.workflowId !== workflowId)
        }));
      },

      clearAllBookmarks: () => {
        set({ bookmarks: [] });
      }
    }),
    {
      name: "nodetool-node-bookmarks",
      version: 1
    }
  )
);

export default useNodeBookmarkStore;
