/**
 * NodeBookmarksStore manages bookmarked/pinned nodes for quick navigation.
 *
 * Bookmarks are workflow-specific and persist across sessions via localStorage.
 * Each bookmark contains a reference to a node ID and the workflow it belongs to.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Represents a bookmarked node in a workflow.
 */
export interface NodeBookmark {
  /** The unique identifier of the bookmarked node */
  nodeId: string;
  /** The workflow ID this node belongs to */
  workflowId: string;
  /** Optional custom name for the bookmark */
  name?: string;
  /** Timestamp when the bookmark was created */
  createdAt: number;
}

/**
 * State structure for the NodeBookmarksStore.
 */
interface NodeBookmarksState {
  /** Map of workflow IDs to their bookmarks */
  bookmarks: Record<string, NodeBookmark[]>;

  /** Add a node to bookmarks */
  addBookmark: (workflowId: string, nodeId: string, name?: string) => void;
  /** Remove a node from bookmarks */
  removeBookmark: (workflowId: string, nodeId: string) => void;
  /** Check if a node is bookmarked */
  isBookmarked: (workflowId: string, nodeId: string) => boolean;
  /** Get all bookmarks for a workflow */
  getWorkflowBookmarks: (workflowId: string) => NodeBookmark[];
  /** Clear all bookmarks for a workflow */
  clearWorkflowBookmarks: (workflowId: string) => void;
  /** Rename a bookmark */
  renameBookmark: (workflowId: string, nodeId: string, name: string) => void;
}

/**
 * Zustand store for managing node bookmarks.
 *
 * Uses persist middleware to save bookmarks to localStorage.
 * Bookmarks are organized by workflow ID for easy filtering.
 *
 * @example
 * ```tsx
 * const addBookmark = useNodeBookmarksStore(state => state.addBookmark);
 * const isBookmarked = useNodeBookmarksStore(state => state.isBookmarked);
 *
 * // Add a bookmark
 * addBookmark(workflowId, nodeId, "My Important Node");
 *
 * // Check if bookmarked
 * if (isBookmarked(workflowId, nodeId)) {
 *   // ...
 * }
 * ```
 */
export const useNodeBookmarksStore = create<NodeBookmarksState>()(
  persist(
    (set, get) => ({
      bookmarks: {},

      addBookmark: (workflowId: string, nodeId: string, name?: string) => {
        set((state) => {
          const workflowBookmarks = state.bookmarks[workflowId] || [];

          // Check if already bookmarked
          if (workflowBookmarks.some((b) => b.nodeId === nodeId)) {
            return state;
          }

          return {
            bookmarks: {
              ...state.bookmarks,
              [workflowId]: [
                ...workflowBookmarks,
                {
                  nodeId,
                  workflowId,
                  name,
                  createdAt: Date.now()
                }
              ]
            }
          };
        });
      },

      removeBookmark: (workflowId: string, nodeId: string) => {
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: (state.bookmarks[workflowId] || []).filter(
              (b) => b.nodeId !== nodeId
            )
          }
        }));
      },

      isBookmarked: (workflowId: string, nodeId: string) => {
        const workflowBookmarks = get().bookmarks[workflowId] || [];
        return workflowBookmarks.some((b) => b.nodeId === nodeId);
      },

      getWorkflowBookmarks: (workflowId: string) => {
        return get().bookmarks[workflowId] || [];
      },

      clearWorkflowBookmarks: (workflowId: string) => {
        set((state) => {
          const newBookmarks = { ...state.bookmarks };
          delete newBookmarks[workflowId];
          return { bookmarks: newBookmarks };
        });
      },

      renameBookmark: (workflowId: string, nodeId: string, name: string) => {
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: (state.bookmarks[workflowId] || []).map((b) =>
              b.nodeId === nodeId ? { ...b, name } : b
            )
          }
        }));
      }
    }),
    {
      name: "nodetool-node-bookmarks-storage",
      version: 1
    }
  )
);
