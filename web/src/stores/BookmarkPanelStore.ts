import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BookmarkPanelState {
  isVisible: boolean;
  setVisibility: (isVisible: boolean) => void;
  toggleVisibility: () => void;
}

export const useBookmarkPanelStore = create<BookmarkPanelState>()(
  persist(
    (set) => ({
      isVisible: false,

      setVisibility: (isVisible: boolean) =>
        set({ isVisible }),

      toggleVisibility: () =>
        set((state) => ({ isVisible: !state.isVisible })),
    }),
    {
      name: "bookmark-panel-storage",
    }
  )
);
