import { create } from "zustand";

interface AppHeaderState {
  helpOpen: boolean;
  helpIndex: number;

  setHelpOpen: (open: boolean) => void;
  setHelpIndex: (index: number) => void;

  handleOpenHelp: () => void;
  handleCloseHelp: () => void;
}

export const useAppHeaderStore = create<AppHeaderState>((set, get) => ({
  helpIndex: 0,
  helpOpen: false,

  setHelpOpen: (open) => set({ helpOpen: open }),
  setHelpIndex: (index) => set({ helpIndex: index }),

  handleOpenHelp: () => set({ helpOpen: true }),
  handleCloseHelp: () => set({ helpOpen: false })
}));
