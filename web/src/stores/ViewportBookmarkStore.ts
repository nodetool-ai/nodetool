import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Represents a saved viewport position in a workflow.
 * Stores the x, y coordinates and zoom level for quick navigation.
 */
export interface ViewportBookmark {
  /** Unique identifier for the bookmark */
  id: string;
  /** User-defined name for the bookmark */
  name: string;
  /** Workflow ID this bookmark belongs to */
  workflowId: string;
  /** X coordinate of the viewport center */
  x: number;
  /** Y coordinate of the viewport center */
  y: number;
  /** Zoom level (1.0 = 100%) */
  zoom: number;
  /** Timestamp when the bookmark was created */
  createdAt: number;
}

interface ViewportBookmarkStore {
  /** Map of workflow IDs to their bookmarks */
  bookmarks: Record<string, ViewportBookmark[]>;

  /** Add a new viewport bookmark for a workflow */
  addBookmark: (
    workflowId: string,
    name: string,
    x: number,
    y: number,
    zoom: number
  ) => void;

  /** Update an existing bookmark */
  updateBookmark: (workflowId: string, bookmarkId: string, updates: Partial<ViewportBookmark>) => void;

  /** Delete a bookmark */
  deleteBookmark: (workflowId: string, bookmarkId: string) => void;

  /** Get all bookmarks for a workflow */
  getBookmarks: (workflowId: string) => ViewportBookmark[];

  /** Delete all bookmarks for a workflow */
  clearWorkflowBookmarks: (workflowId: string) => void;
}

/**
 * Zustand store for managing viewport bookmarks.
 * Bookmarks are persisted to localStorage and organized by workflow ID.
 */
export const useViewportBookmarkStore = create<ViewportBookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarks: {},

      addBookmark: (workflowId: string, name: string, x: number, y: number, zoom: number) => {
        const newBookmark: ViewportBookmark = {
          id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          workflowId,
          x,
          y,
          zoom,
          createdAt: Date.now()
        };

        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: [...(state.bookmarks[workflowId] || []), newBookmark]
          }
        }));
      },

      updateBookmark: (workflowId: string, bookmarkId: string, updates: Partial<ViewportBookmark>) => {
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: (state.bookmarks[workflowId] || []).map((bookmark) =>
              bookmark.id === bookmarkId ? { ...bookmark, ...updates } : bookmark
            )
          }
        }));
      },

      deleteBookmark: (workflowId: string, bookmarkId: string) => {
        set((state) => ({
          bookmarks: {
            ...state.bookmarks,
            [workflowId]: (state.bookmarks[workflowId] || []).filter(
              (bookmark) => bookmark.id !== bookmarkId
            )
          }
        }));
      },

      getBookmarks: (workflowId: string) => {
        return get().bookmarks[workflowId] || [];
      },

      clearWorkflowBookmarks: (workflowId: string) => {
        set((state) => {
          const newBookmarks = { ...state.bookmarks };
          delete newBookmarks[workflowId];
          return { bookmarks: newBookmarks };
        });
      }
    }),
    {
      name: "viewport-bookmark-storage",
      partialize: (state) => ({
        bookmarks: state.bookmarks
      })
    }
  )
);
