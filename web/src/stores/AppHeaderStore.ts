import { create } from "zustand";

interface AppHeaderState {
  helpOpen: boolean;
  helpIndex: number;

  setHelpOpen: (open: boolean) => void;
  setHelpIndex: (index: number) => void;

  handleOpenHelp: () => void;
  handleCloseHelp: () => void;
  handleOpenHelpAtShortcuts: () => void;
}

export const useAppHeaderStore = create<AppHeaderState>((set) => ({
  helpIndex: 0,
  helpOpen: false,

  setHelpOpen: (open) => set({ helpOpen: open }),
  setHelpIndex: (index) => set({ helpIndex: index }),

  handleOpenHelp: () => set({ helpOpen: true, helpIndex: 0 }),
  handleCloseHelp: () => set({ helpOpen: false }),
  handleOpenHelpAtShortcuts: () => set({ helpOpen: true, helpIndex: 0 })
}));
