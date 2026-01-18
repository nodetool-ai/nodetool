import { create } from "zustand";

interface PerformancePanelStore {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const usePerformancePanelStore = create<PerformancePanelStore>((set) => ({
  isOpen: false,

  toggle: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  open: () => {
    set({ isOpen: true });
  },

  close: () => {
    set({ isOpen: false });
  }
}));

export default usePerformancePanelStore;
