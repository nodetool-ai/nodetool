import { create } from "zustand";

interface CollectionsManagerState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const useCollectionsManagerStore = create<CollectionsManagerState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen })
}));
