/**
 * NodeBookmarksStore
 *
 * Manages bookmarks for specific node instances within a workflow.
 * Users can bookmark individual nodes to quickly navigate to them in large workflows.
 * Bookmarks are persisted per workflow and restored when the workflow is loaded.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodeBookmark {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  timestamp: number;
}

interface NodeBookmarksStore {
  bookmarks: NodeBookmark[];
  isBookmarked: (nodeId: string) => boolean;
  addBookmark: (nodeId: string, nodeName: string, nodeType: string) => void;
  removeBookmark: (nodeId: string) => void;
  toggleBookmark: (nodeId: string, nodeName: string, nodeType: string) => void;
  clearBookmarks: () => void;
  getBookmarks: () => NodeBookmark[];
  updateBookmarkName: (nodeId: string, nodeName: string) => void;
}

const MAX_BOOKMARKS = 50;

export const useNodeBookmarksStore = create<NodeBookmarksStore>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      isBookmarked: (nodeId: string) => {
        return get().bookmarks.some((b) => b.nodeId === nodeId);
      },

      addBookmark: (nodeId: string, nodeName: string, nodeType: string) => {
        set((state) => {
          if (state.bookmarks.some((b) => b.nodeId === nodeId)) {
            return state;
          }
          const updated = [
            { nodeId, nodeName, nodeType, timestamp: Date.now() },
            ...state.bookmarks
          ];
          return {
            bookmarks: updated.slice(0, MAX_BOOKMARKS)
          };
        });
      },

      removeBookmark: (nodeId: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.nodeId !== nodeId)
        }));
      },

      toggleBookmark: (nodeId: string, nodeName: string, nodeType: string) => {
        set((state) => {
          const existingIndex = state.bookmarks.findIndex(
            (b) => b.nodeId === nodeId
          );
          if (existingIndex !== -1) {
            return {
              bookmarks: state.bookmarks.filter((b) => b.nodeId !== nodeId)
            };
          } else {
            const updated = [
              { nodeId, nodeName, nodeType, timestamp: Date.now() },
              ...state.bookmarks
            ];
            return {
              bookmarks: updated.slice(0, MAX_BOOKMARKS)
            };
          }
        });
      },

      clearBookmarks: () => {
        set({ bookmarks: [] });
      },

      getBookmarks: () => {
        return get().bookmarks;
      },

      updateBookmarkName: (nodeId: string, nodeName: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.nodeId === nodeId ? { ...b, nodeName } : b
          )
        }));
      }
    }),
    {
      name: "nodetool-node-bookmarks",
      version: 1
    }
  )
);

export default useNodeBookmarksStore;
