/**
 * Visibility of the thread memory rail in chat surfaces. Off by default —
 * the rail is opt-in and the choice persists across sessions.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThreadMemoryPanelState {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useThreadMemoryPanelStore = create<ThreadMemoryPanelState>()(
  persist(
    (set) => ({
      isOpen: false,
      setOpen: (open: boolean) => set({ isOpen: open }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen }))
    }),
    { name: "thread-memory-panel" }
  )
);
