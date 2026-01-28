import { create } from "zustand";

interface WorkspaceManagerState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const useWorkspaceManagerStore = create<WorkspaceManagerState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen })
}));
