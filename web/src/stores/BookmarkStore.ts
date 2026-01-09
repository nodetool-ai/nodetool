/**
 * BookmarkStore manages canvas bookmarks for workflow navigation.
 *
 * Responsibilities:
 * - Store named viewport positions (x, y, zoom) for each workflow
 * - Provide CRUD operations for bookmarks
 * - Persist bookmarks with the workflow via NodeStore
 */

import { create } from "zustand";
import { Viewport } from "@xyflow/react";
import { produce } from "immer";

export interface CanvasBookmark {
  id: string;
  name: string;
  viewport: Viewport;
  createdAt: number;
}

export interface BookmarkStoreState {
  bookmarks: Record<string, CanvasBookmark[]>;
  activeBookmarkId: string | null;
  addBookmark: (workflowId: string, name: string, viewport: Viewport) => string;
  removeBookmark: (workflowId: string, bookmarkId: string) => void;
  updateBookmark: (
    workflowId: string,
    bookmarkId: string,
    updates: Partial<Pick<CanvasBookmark, "name" | "viewport">>
  ) => void;
  setBookmarks: (workflowId: string, bookmarks: CanvasBookmark[]) => void;
  getBookmarks: (workflowId: string) => CanvasBookmark[];
  setActiveBookmark: (bookmarkId: string | null) => void;
  clearBookmarks: (workflowId: string) => void;
}

const useBookmarkStore = create<BookmarkStoreState>((set, get) => ({
  bookmarks: {},
  activeBookmarkId: null,

  addBookmark: (workflowId: string, name: string, viewport: Viewport) => {
    const id = `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newBookmark: CanvasBookmark = {
      id,
      name,
      viewport: { ...viewport },
      createdAt: Date.now(),
    };

    set(
      produce((state: BookmarkStoreState) => {
        if (!state.bookmarks[workflowId]) {
          state.bookmarks[workflowId] = [];
        }
        state.bookmarks[workflowId].push(newBookmark);
      })
    );

    return id;
  },

  removeBookmark: (workflowId: string, bookmarkId: string) => {
    set(
      produce((state: BookmarkStoreState) => {
        if (state.bookmarks[workflowId]) {
          state.bookmarks[workflowId] = state.bookmarks[workflowId].filter(
            (b) => b.id !== bookmarkId
          );
        }
      })
    );
  },

  updateBookmark: (
    workflowId: string,
    bookmarkId: string,
    updates: Partial<Pick<CanvasBookmark, "name" | "viewport">>
  ) => {
    set(
      produce((state: BookmarkStoreState) => {
        if (state.bookmarks[workflowId]) {
          const bookmark = state.bookmarks[workflowId].find(
            (b) => b.id === bookmarkId
          );
          if (bookmark) {
            if (updates.name !== undefined) {
              bookmark.name = updates.name;
            }
            if (updates.viewport !== undefined) {
              bookmark.viewport = { ...updates.viewport };
            }
          }
        }
      })
    );
  },

  setBookmarks: (workflowId: string, bookmarks: CanvasBookmark[]) => {
    set(
      produce((state: BookmarkStoreState) => {
        state.bookmarks[workflowId] = bookmarks;
      })
    );
  },

  getBookmarks: (workflowId: string) => {
    return get().bookmarks[workflowId] || [];
  },

  setActiveBookmark: (bookmarkId: string | null) => {
    set({ activeBookmarkId: bookmarkId });
  },

  clearBookmarks: (workflowId: string) => {
    set(
      produce((state: BookmarkStoreState) => {
        delete state.bookmarks[workflowId];
      })
    );
  },
}));

export default useBookmarkStore;
