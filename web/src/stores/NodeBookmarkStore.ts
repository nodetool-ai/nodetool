/**
 * NodeBookmarkStore
 *
 * Manages bookmarks for specific node instances within a workflow.
 * Unlike FavoriteNodesStore (which bookmarks node types), this store
 * bookmarks specific node instances with their positions.
 *
 * Features:
 * - Bookmark up to 9 nodes per workflow (numbered 1-9)
 * - Navigate between bookmarks using Alt+1-9
 * - Quick access to important nodes in large workflows
 * - Bookmarks are workflow-specific (stored per workflow ID)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodeBookmark {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  position: { x: number; y: number };
  index: number; // 1-9, the bookmark slot number
  timestamp: number;
}

interface NodeBookmarkState {
  // Map of workflowId to bookmarks array
  bookmarks: Record<string, NodeBookmark[]>;

  // Actions
  setBookmark: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeName: string,
    position: { x: number; y: number },
    index: number
  ) => void;

  removeBookmark: (workflowId: string, index: number) => void;
  removeBookmarkByNodeId: (workflowId: string, nodeId: string) => void;

  getBookmark: (workflowId: string, index: number) => NodeBookmark | undefined;
  getBookmarksForWorkflow: (workflowId: string) => NodeBookmark[];
  hasBookmarkAt: (workflowId: string, index: number) => boolean;
  getBookmarkForNode: (workflowId: string, nodeId: string) => NodeBookmark | undefined;

  clearWorkflowBookmarks: (workflowId: string) => void;
  clearAllBookmarks: () => void;
}

const MAX_BOOKMARKS = 9;

export const useNodeBookmarkStore = create<NodeBookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: {},

      setBookmark: (
        workflowId: string,
        nodeId: string,
        nodeType: string,
        nodeName: string,
        position: { x: number; y: number },
        index: number
      ) => {
        if (index < 1 || index > MAX_BOOKMARKS) {
          console.warn(`Bookmark index must be between 1 and ${MAX_BOOKMARKS}`);
          return;
        }

        set((state) => {
          const workflowBookmarks = state.bookmarks[workflowId] || [];
          // Remove any existing bookmark for this node
          const filtered = workflowBookmarks.filter((b) => b.nodeId !== nodeId);
          // Remove any existing bookmark at this index
          const withoutIndex = filtered.filter((b) => b.index !== index);

          const newBookmark: NodeBookmark = {
            nodeId,
            nodeType,
            nodeName,
            position,
            index,
            timestamp: Date.now()
          };

          return {
            bookmarks: {
              ...state.bookmarks,
              [workflowId]: [...withoutIndex, newBookmark]
            }
          };
        });
      },

      removeBookmark: (workflowId: string, index: number) => {
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]:
              state.bookmarks[workflowId]?.filter((b) => b.index !== index) || []
          }
        }));
      },

      removeBookmarkByNodeId: (workflowId: string, nodeId: string) => {
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]:
              state.bookmarks[workflowId]?.filter((b) => b.nodeId !== nodeId) || []
          }
        }));
      },

      getBookmark: (workflowId: string, index: number) => {
        return get().bookmarks[workflowId]?.find((b) => b.index === index);
      },

      getBookmarksForWorkflow: (workflowId: string) => {
        return get().bookmarks[workflowId] || [];
      },

      hasBookmarkAt: (workflowId: string, index: number) => {
        return get().bookmarks[workflowId]?.some((b) => b.index === index) || false;
      },

      getBookmarkForNode: (workflowId: string, nodeId: string) => {
        return get().bookmarks[workflowId]?.find((b) => b.nodeId === nodeId);
      },

      clearWorkflowBookmarks: (workflowId: string) => {
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: []
          }
        }));
      },

      clearAllBookmarks: () => {
        set({ bookmarks: {} });
      }
    }),
    {
      name: "nodetool-node-bookmarks",
      version: 1
    }
  )
);

export default useNodeBookmarkStore;
