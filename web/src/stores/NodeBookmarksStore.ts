/**
 * NodeBookmarksStore
 *
 * Manages bookmarks for nodes within workflows, allowing users to quickly
 * navigate to important nodes in complex workflows. Bookmarks are stored
 * per workflow and persist across sessions via localStorage.
 *
 * Features:
 * - Add/remove bookmarks for specific nodes
 * - Navigate to bookmarked nodes (focus + fit viewport)
 * - List all bookmarks for current workflow
 * - Clear all bookmarks for current workflow
 * - Automatic cleanup when nodes are deleted
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodeBookmark {
  /** Unique identifier for the node */
  nodeId: string;
  /** Workflow this bookmark belongs to */
  workflowId: string;
  /** Custom label (optional, defaults to node label) */
  label?: string;
  /** Timestamp when bookmark was created */
  timestamp: number;
  /** Node position for quick navigation */
  position: { x: number; y: number };
}

interface NodeBookmarksStore {
  /** All bookmarks across all workflows */
  bookmarks: NodeBookmark[];

  /** Add a bookmark for a node */
  addBookmark: (nodeId: string, workflowId: string, position: { x: number; y: number }, label?: string) => void;

  /** Remove a bookmark for a node */
  removeBookmark: (nodeId: string, workflowId: string) => void;

  /** Toggle bookmark status (add if not bookmarked, remove if bookmarked) */
  toggleBookmark: (nodeId: string, workflowId: string, position: { x: number; y: number }, label?: string) => void;

  /** Check if a node is bookmarked in the current workflow */
  isBookmarked: (nodeId: string, workflowId: string) => boolean;

  /** Get all bookmarks for a specific workflow */
  getWorkflowBookmarks: (workflowId: string) => NodeBookmark[];

  /** Update bookmark label */
  updateBookmarkLabel: (nodeId: string, workflowId: string, label: string) => void;

  /** Clear all bookmarks for a specific workflow */
  clearWorkflowBookmarks: (workflowId: string) => void;

  /** Clean up bookmarks for deleted nodes (call when nodes are deleted) */
  cleanupBookmarks: (nodeIds: string[], workflowId: string) => void;
}

const MAX_BOOKMARKS_PER_WORKFLOW = 50;

export const useNodeBookmarksStore = create<NodeBookmarksStore>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addBookmark: (nodeId: string, workflowId: string, position: { x: number; y: number }, label?: string) => {
        set((state) => {
          // Check if already bookmarked
          if (state.bookmarks.some((b) => b.nodeId === nodeId && b.workflowId === workflowId)) {
            return state;
          }

          // Check workflow limit
          const workflowBookmarks = state.bookmarks.filter((b) => b.workflowId === workflowId);
          if (workflowBookmarks.length >= MAX_BOOKMARKS_PER_WORKFLOW) {
            return state;
          }

          return {
            bookmarks: [
              ...state.bookmarks,
              {
                nodeId,
                workflowId,
                label,
                timestamp: Date.now(),
                position
              }
            ]
          };
        });
      },

      removeBookmark: (nodeId: string, workflowId: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => !(b.nodeId === nodeId && b.workflowId === workflowId))
        }));
      },

      toggleBookmark: (nodeId: string, workflowId: string, position: { x: number; y: number }, label?: string) => {
        set((state) => {
          const existingIndex = state.bookmarks.findIndex(
            (b) => b.nodeId === nodeId && b.workflowId === workflowId
          );

          if (existingIndex !== -1) {
            // Remove bookmark
            return {
              bookmarks: state.bookmarks.filter((b) => !(b.nodeId === nodeId && b.workflowId === workflowId))
            };
          } else {
            // Add bookmark
            const workflowBookmarks = state.bookmarks.filter((b) => b.workflowId === workflowId);
            if (workflowBookmarks.length >= MAX_BOOKMARKS_PER_WORKFLOW) {
              return state;
            }

            return {
              bookmarks: [
                ...state.bookmarks,
                {
                  nodeId,
                  workflowId,
                  label,
                  timestamp: Date.now(),
                  position
                }
              ]
            };
          }
        });
      },

      isBookmarked: (nodeId: string, workflowId: string) => {
        return get().bookmarks.some((b) => b.nodeId === nodeId && b.workflowId === workflowId);
      },

      getWorkflowBookmarks: (workflowId: string) => {
        return get().bookmarks.filter((b) => b.workflowId === workflowId);
      },

      updateBookmarkLabel: (nodeId: string, workflowId: string, label: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.nodeId === nodeId && b.workflowId === workflowId
              ? { ...b, label }
              : b
          )
        }));
      },

      clearWorkflowBookmarks: (workflowId: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.workflowId !== workflowId)
        }));
      },

      cleanupBookmarks: (nodeIds: string[], workflowId: string) => {
        const validNodeIds = new Set(nodeIds);
        set((state) => ({
          bookmarks: state.bookmarks.filter(
            (b) => b.workflowId !== workflowId || validNodeIds.has(b.nodeId)
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
