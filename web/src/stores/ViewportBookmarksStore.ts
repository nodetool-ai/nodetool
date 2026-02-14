/**
 * ViewportBookmarksStore manages saved viewport positions and zoom levels for workflows.
 *
 * Users can create bookmarks to quickly navigate between different areas of large workflows.
 * Bookmarks persist per-workflow and include position (x, y) and zoom level.
 *
 * Features:
 * - Create, rename, and delete bookmarks
 * - Navigate to saved viewport positions
 * - Automatic bookmark cleanup when workflow is closed
 * - Unique name enforcement
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Represents a saved viewport state with position and zoom.
 */
export interface ViewportBookmark {
  /** Unique identifier for the bookmark */
  id: string;
  /** User-defined name for the bookmark */
  name: string;
  /** X coordinate of viewport center */
  x: number;
  /** Y coordinate of viewport center */
  y: number;
  /** Zoom level (1.0 = 100%) */
  zoom: number;
  /** Timestamp when bookmark was created (ISO 8601 string) */
  createdAt: string;
}

/**
 * Maps workflow IDs to their array of bookmarks.
 */
interface BookmarksState {
  /** All bookmarks indexed by workflow ID */
  bookmarks: Record<string, ViewportBookmark[]>;

  /** Get all bookmarks for a specific workflow */
  getBookmarks: (workflowId: string) => ViewportBookmark[];

  /** Add a new bookmark for the given workflow */
  addBookmark: (
    workflowId: string,
    name: string,
    x: number,
    y: number,
    zoom: number
  ) => ViewportBookmark;

  /** Update an existing bookmark's name */
  updateBookmark: (
    workflowId: string,
    bookmarkId: string,
    name: string
  ) => void;

  /** Delete a bookmark */
  deleteBookmark: (workflowId: string, bookmarkId: string) => void;

  /** Delete all bookmarks for a workflow (called when workflow is deleted) */
  deleteWorkflowBookmarks: (workflowId: string) => void;

  /** Check if a bookmark name already exists for a workflow */
  bookmarkNameExists: (workflowId: string, name: string) => boolean;
}

/**
 * Generates a unique ID for a new bookmark.
 */
const generateBookmarkId = (): string => {
  return `bookmark_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Zustand store for viewport bookmarks.
 *
 * Uses persist middleware to save bookmarks to localStorage.
 */
const useViewportBookmarksStore = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarks: {},

      getBookmarks: (workflowId: string) => {
        const state = get();
        return state.bookmarks[workflowId] || [];
      },

      addBookmark: (
        workflowId: string,
        name: string,
        x: number,
        y: number,
        zoom: number
      ) => {
        const state = get();
        const workflowBookmarks = state.bookmarks[workflowId] || [];

        // Check for duplicate names
        const nameExists = workflowBookmarks.some(
          (bookmark) => bookmark.name === name
        );
        if (nameExists) {
          throw new Error(`Bookmark "${name}" already exists`);
        }

        const newBookmark: ViewportBookmark = {
          id: generateBookmarkId(),
          name,
          x,
          y,
          zoom,
          createdAt: new Date().toISOString()
        };

        set({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: [...workflowBookmarks, newBookmark]
          }
        });

        return newBookmark;
      },

      updateBookmark: (
        workflowId: string,
        bookmarkId: string,
        name: string
      ) => {
        const state = get();
        const workflowBookmarks = state.bookmarks[workflowId] || [];

        // Check for duplicate names (excluding the bookmark being updated)
        const nameExists = workflowBookmarks.some(
          (bookmark) => bookmark.id !== bookmarkId && bookmark.name === name
        );
        if (nameExists) {
          throw new Error(`Bookmark "${name}" already exists`);
        }

        const updatedBookmarks = workflowBookmarks.map((bookmark) =>
          bookmark.id === bookmarkId
            ? { ...bookmark, name }
            : bookmark
        );

        set({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: updatedBookmarks
          }
        });
      },

      deleteBookmark: (workflowId: string, bookmarkId: string) => {
        const state = get();
        const workflowBookmarks = state.bookmarks[workflowId] || [];

        // Check if bookmark exists in this workflow before deleting
        const bookmarkExists = workflowBookmarks.some(
          (bookmark) => bookmark.id === bookmarkId
        );

        if (!bookmarkExists) {
          // Bookmark doesn't exist or belongs to different workflow - silently succeed
          return;
        }

        const filteredBookmarks = workflowBookmarks.filter(
          (bookmark) => bookmark.id !== bookmarkId
        );

        set({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: filteredBookmarks
          }
        });
      },

      deleteWorkflowBookmarks: (workflowId: string) => {
        const state = get();
        const { [workflowId]: _, ...remainingBookmarks } = state.bookmarks;

        set({ bookmarks: remainingBookmarks });
      },

      bookmarkNameExists: (workflowId: string, name: string) => {
        const state = get();
        const workflowBookmarks = state.bookmarks[workflowId] || [];
        return workflowBookmarks.some((bookmark) => bookmark.name === name);
      }
    }),
    {
      name: "nodetool-viewport-bookmarks",
      // Only persist the bookmarks data
      partialize: (state) => ({ bookmarks: state.bookmarks })
    }
  )
);

export default useViewportBookmarksStore;
