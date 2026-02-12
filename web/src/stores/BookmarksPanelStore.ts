/**
 * BookmarksPanelStore
 *
 * Manages the visibility state of the Bookmarks panel.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BookmarksPanelStore {
  showBookmarksPanel: boolean;
  toggleBookmarksPanel: () => void;
  setShowBookmarksPanel: (show: boolean) => void;
}

export const useBookmarksPanelStore = create<BookmarksPanelStore>()(
  persist(
    (set) => ({
      showBookmarksPanel: false,
      toggleBookmarksPanel: () => {
        set((state) => ({ showBookmarksPanel: !state.showBookmarksPanel }));
      },
      setShowBookmarksPanel: (show: boolean) => {
        set({ showBookmarksPanel: show });
      }
    }),
    {
      name: "nodetool-bookmarks-panel",
      version: 1
    }
  )
);

export default useBookmarksPanelStore;
