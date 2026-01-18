/**
 * QuickAccessPanelStore
 *
 * Manages the visibility state of the Quick Access Panel.
 * The panel provides quick access to favorite nodes and recently used nodes.
 */

import { create } from "zustand";

interface QuickAccessPanelStore {
  isOpen: boolean;
  isCollapsed: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useQuickAccessPanelStore = create<QuickAccessPanelStore>((set) => ({
  isOpen: false,
  isCollapsed: false,

  openPanel: () => set({ isOpen: true, isCollapsed: false }),

  closePanel: () => set({ isOpen: false }),

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen, isCollapsed: false })),

  toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),

  setCollapsed: (collapsed: boolean) => set({ isCollapsed: collapsed })
}));

export default useQuickAccessPanelStore;
