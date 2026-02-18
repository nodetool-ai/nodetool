/**
 * WorkflowBookmarksStore
 *
 * Manages bookmarks for nodes within a workflow. Bookmarks allow users to
 * mark important nodes and quickly navigate back to them using keyboard
 * shortcuts (0-9) or the bookmarks panel.
 *
 * Features:
 * - Add/remove bookmarks with optional labels
 * - Numbered bookmarks (0-9) for quick keyboard access
 * - Bookmark navigation with zoom to node
 * - Persistent storage per workflow
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * A single bookmark entry
 */
export interface WorkflowBookmark {
  /** The ID of the bookmarked node */
  nodeId: string;
  /** Optional custom label for the bookmark */
  label: string;
  /** Number index (0-9) for quick keyboard access */
  index: number;
  /** Timestamp when bookmark was created */
  createdAt: number;
}

/**
 * The workflow bookmarks state structure
 */
interface WorkflowBookmarksState {
  /** Map of workflow ID to bookmarks array */
  bookmarks: Record<string, WorkflowBookmark[]>;
}

/**
 * The workflow bookmarks actions
 */
interface WorkflowBookmarksActions {
  /** Add a bookmark for a node in the current workflow */
  addBookmark: (workflowId: string, nodeId: string, label?: string) => void;
  /** Remove a bookmark from a workflow */
  removeBookmark: (workflowId: string, nodeId: string) => void;
  /** Remove all bookmarks for a workflow */
  clearWorkflowBookmarks: (workflowId: string) => void;
  /** Set the label for a bookmark */
  setBookmarkLabel: (
    workflowId: string,
    nodeId: string,
    label: string
  ) => void;
  /** Get all bookmarks for a workflow */
  getWorkflowBookmarks: (workflowId: string) => WorkflowBookmark[];
  /** Get a bookmark by node ID */
  getBookmark: (
    workflowId: string,
    nodeId: string
  ) => WorkflowBookmark | undefined;
  /** Get a numbered bookmark (0-9) */
  getNumberedBookmark: (
    workflowId: string,
    index: number
  ) => WorkflowBookmark | undefined;
  /** Check if a node is bookmarked */
  isNodeBookmarked: (workflowId: string, nodeId: string) => boolean;
}

/**
 * Creates the workflow bookmarks store with persistence
 */
type WorkflowBookmarksStore = WorkflowBookmarksState &
  WorkflowBookmarksActions;

const MAX_BOOKMARKS_PER_WORKFLOW = 10;

const getNextAvailableIndex = (
  bookmarks: WorkflowBookmark[]
): number => {
  // Find the first available index (0-9)
  for (let i = 0; i < MAX_BOOKMARKS_PER_WORKFLOW; i++) {
    if (!bookmarks.find((b) => b.index === i)) {
      return i;
    }
  }
  // If all indices are taken, return -1
  return -1;
};

export const useWorkflowBookmarksStore = create<WorkflowBookmarksStore>()(
  persist(
    (set, get) => ({
      bookmarks: {},

      addBookmark: (workflowId, nodeId, label) => {
        const { bookmarks } = get();
        const workflowBookmarks = bookmarks[workflowId] || [];
        const existingBookmark = workflowBookmarks.find(
          (b) => b.nodeId === nodeId
        );

        // If node is already bookmarked, just update the label
        if (existingBookmark) {
          if (label !== undefined) {
            set({
              bookmarks: {
                ...bookmarks,
                [workflowId]: workflowBookmarks.map((b) =>
                  b.nodeId === nodeId ? { ...b, label } : b
                )
              }
            });
          }
          return;
        }

        // Check if we've reached the max number of bookmarks
        if (workflowBookmarks.length >= MAX_BOOKMARKS_PER_WORKFLOW) {
          console.warn(
            `Maximum number of bookmarks (${MAX_BOOKMARKS_PER_WORKFLOW}) reached for workflow ${workflowId}`
          );
          return;
        }

        const index = getNextAvailableIndex(workflowBookmarks);
        if (index === -1) {
          console.warn("No available bookmark index");
          return;
        }

        const newBookmark: WorkflowBookmark = {
          nodeId,
          label: label || `Bookmark ${index}`,
          index,
          createdAt: Date.now()
        };

        set({
          bookmarks: {
            ...bookmarks,
            [workflowId]: [...workflowBookmarks, newBookmark]
          }
        });
      },

      removeBookmark: (workflowId, nodeId) => {
        const { bookmarks } = get();
        const workflowBookmarks = bookmarks[workflowId] || [];
        set({
          bookmarks: {
            ...bookmarks,
            [workflowId]: workflowBookmarks.filter((b) => b.nodeId !== nodeId)
          }
        });
      },

      clearWorkflowBookmarks: (workflowId) => {
        const { bookmarks } = get();
        const newBookmarks = { ...bookmarks };
        delete newBookmarks[workflowId];
        set({ bookmarks: newBookmarks });
      },

      setBookmarkLabel: (workflowId, nodeId, label) => {
        const { bookmarks } = get();
        const workflowBookmarks = bookmarks[workflowId] || [];
        set({
          bookmarks: {
            ...bookmarks,
            [workflowId]: workflowBookmarks.map((b) =>
              b.nodeId === nodeId ? { ...b, label } : b
            )
          }
        });
      },

      getWorkflowBookmarks: (workflowId) => {
        const { bookmarks } = get();
        return (bookmarks[workflowId] || []).sort((a, b) => a.index - b.index);
      },

      getBookmark: (workflowId, nodeId) => {
        const { bookmarks } = get();
        const workflowBookmarks = bookmarks[workflowId] || [];
        return workflowBookmarks.find((b) => b.nodeId === nodeId);
      },

      getNumberedBookmark: (workflowId, index) => {
        const { bookmarks } = get();
        const workflowBookmarks = bookmarks[workflowId] || [];
        return workflowBookmarks.find((b) => b.index === index);
      },

      isNodeBookmarked: (workflowId, nodeId) => {
        const { bookmarks } = get();
        const workflowBookmarks = bookmarks[workflowId] || [];
        return workflowBookmarks.some((b) => b.nodeId === nodeId);
      }
    }),
    {
      name: "nodetool-workflow-bookmarks-storage",
      version: 1
    }
  )
);
