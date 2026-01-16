/**
 * BookmarkStore
 *
 * Manages workflow bookmarks for quick navigation to important views.
 * Each bookmark stores a viewport position (x, y, zoom) and an optional name.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Viewport } from "@xyflow/react";

export interface WorkflowBookmark {
  id: string;
  name: string;
  viewport: Viewport;
  createdAt: number;
  color?: string;
}

export interface BookmarkNavigateInfo {
  bookmarkId: string;
  direction: "next" | "prev";
}

interface BookmarkStore {
  bookmarks: WorkflowBookmark[];
  currentBookmarkId: string | null;
  addBookmark: (name: string, viewport: Viewport, color?: string) => string;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, updates: Partial<Pick<WorkflowBookmark, "name" | "viewport" | "color">>) => void;
  getBookmark: (id: string) => WorkflowBookmark | undefined;
  getAllBookmarks: () => WorkflowBookmark[];
  getNextBookmark: (currentId: string) => WorkflowBookmark | undefined;
  getPrevBookmark: (currentId: string) => WorkflowBookmark | undefined;
  setCurrentBookmark: (id: string | null) => void;
  clearBookmarks: () => void;
  navigateToBookmark: (direction: "next" | "prev") => WorkflowBookmark | null;
}

const MAX_BOOKMARKS = 20;
const BOOKMARK_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899"
];

export const useBookmarkStore = create<BookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      currentBookmarkId: null,

      addBookmark: (name: string, viewport: Viewport, color?: string) => {
        const id = crypto.randomUUID();
        const bookmarkColor = color ?? BOOKMARK_COLORS[get().bookmarks.length % BOOKMARK_COLORS.length];

        set((state) => {
          const newBookmark: WorkflowBookmark = {
            id,
            name,
            viewport,
            createdAt: Date.now(),
            color: bookmarkColor
          };

          const updatedBookmarks = [...state.bookmarks, newBookmark];

          return {
            bookmarks: updatedBookmarks.slice(-MAX_BOOKMARKS),
            currentBookmarkId: id
          };
        });

        return id;
      },

      removeBookmark: (id: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
          currentBookmarkId: state.currentBookmarkId === id ? null : state.currentBookmarkId
        }));
      },

      updateBookmark: (id: string, updates: Partial<Pick<WorkflowBookmark, "name" | "viewport" | "color">>) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          )
        }));
      },

      getBookmark: (id: string) => {
        return get().bookmarks.find((b) => b.id === id);
      },

      getAllBookmarks: () => {
        return get().bookmarks;
      },

      getNextBookmark: (currentId: string) => {
        const bookmarks = get().bookmarks;
        const currentIndex = bookmarks.findIndex((b) => b.id === currentId);
        if (currentIndex === -1) {
          return bookmarks.length > 0 ? bookmarks[0] : undefined;
        }
        const nextIndex = (currentIndex + 1) % bookmarks.length;
        return bookmarks[nextIndex];
      },

      getPrevBookmark: (currentId: string) => {
        const bookmarks = get().bookmarks;
        const currentIndex = bookmarks.findIndex((b) => b.id === currentId);
        if (currentIndex === -1) {
          return bookmarks.length > 0 ? bookmarks[bookmarks.length - 1] : undefined;
        }
        const prevIndex = (currentIndex - 1 + bookmarks.length) % bookmarks.length;
        return bookmarks[prevIndex];
      },

      setCurrentBookmark: (id: string | null) => {
        set({ currentBookmarkId: id });
      },

      clearBookmarks: () => {
        set({ bookmarks: [], currentBookmarkId: null });
      },

      navigateToBookmark: (direction: "next" | "prev") => {
        const { bookmarks, currentBookmarkId } = get();
        if (bookmarks.length === 0) {
          return null;
        }

        let targetBookmark: WorkflowBookmark | undefined;

        if (currentBookmarkId === null) {
          targetBookmark = direction === "next" ? bookmarks[0] : bookmarks[bookmarks.length - 1];
        } else {
          targetBookmark = direction === "next"
            ? get().getNextBookmark(currentBookmarkId)
            : get().getPrevBookmark(currentBookmarkId);
        }

        if (targetBookmark) {
          set({ currentBookmarkId: targetBookmark.id });
          return targetBookmark;
        }

        return null;
      }
    }),
    {
      name: "nodetool-workflow-bookmarks",
      version: 1
    }
  )
);

export default useBookmarkStore;
