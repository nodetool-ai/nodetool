import { create } from "zustand";
import type { Asset } from "./ApiTypes";

export interface FileTab {
  asset: Asset;
}

interface FileTabsState {
  openFileTabs: FileTab[];
  activeFileTabId: string | null;
  openFileTab: (asset: Asset) => void;
  closeFileTab: (assetId: string) => void;
  setActiveFileTab: (assetId: string | null) => void;
  closeAllFileTabs: () => void;
  closeOtherFileTabs: (assetId: string) => void;
}

export const useFileTabsStore = create<FileTabsState>()((set, get) => ({
  openFileTabs: [],
  activeFileTabId: null,

  openFileTab: (asset: Asset) => {
    const existing = get().openFileTabs.find((t) => t.asset.id === asset.id);
    if (!existing) {
      set((state) => ({
        openFileTabs: [...state.openFileTabs, { asset }],
        activeFileTabId: asset.id
      }));
    } else {
      set({ activeFileTabId: asset.id });
    }
  },

  closeFileTab: (assetId: string) => {
    const { openFileTabs, activeFileTabId } = get();
    const newTabs = openFileTabs.filter((t) => t.asset.id !== assetId);
    let newActiveId = activeFileTabId;
    if (activeFileTabId === assetId) {
      if (newTabs.length > 0) {
        const closingIndex = openFileTabs.findIndex(
          (t) => t.asset.id === assetId
        );
        const nextTab =
          newTabs[closingIndex] || newTabs[closingIndex - 1] || newTabs[0];
        newActiveId = nextTab.asset.id;
      } else {
        newActiveId = null;
      }
    }
    set({ openFileTabs: newTabs, activeFileTabId: newActiveId });
  },

  setActiveFileTab: (assetId: string | null) => {
    set({ activeFileTabId: assetId });
  },

  closeAllFileTabs: () => {
    set({ openFileTabs: [], activeFileTabId: null });
  },

  closeOtherFileTabs: (assetId: string) => {
    set((state) => ({
      openFileTabs: state.openFileTabs.filter((t) => t.asset.id === assetId),
      activeFileTabId: assetId
    }));
  }
}));
