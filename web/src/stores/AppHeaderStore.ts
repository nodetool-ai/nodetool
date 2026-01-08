import { create } from "zustand";

interface AppHeaderState {
  helpOpen: boolean;
  helpIndex: number;
  shortcutsDialogOpen: boolean;

  setHelpOpen: (open: boolean) => void;
  setHelpIndex: (index: number) => void;
  setShortcutsDialogOpen: (open: boolean) => void;

  handleOpenHelp: () => void;
  handleCloseHelp: () => void;
  handleOpenShortcutsDialog: () => void;
  handleCloseShortcutsDialog: () => void;
}

export const useAppHeaderStore = create<AppHeaderState>((set, get) => ({
  helpIndex: 0,
  helpOpen: false,
  shortcutsDialogOpen: false,

  setHelpOpen: (open) => set({ helpOpen: open }),
  setHelpIndex: (index) => set({ helpIndex: index }),
  setShortcutsDialogOpen: (open) => set({ shortcutsDialogOpen: open }),

  handleOpenHelp: () => set({ helpOpen: true }),
  handleCloseHelp: () => set({ helpOpen: false }),
  handleOpenShortcutsDialog: () => set({ shortcutsDialogOpen: true }),
  handleCloseShortcutsDialog: () => set({ shortcutsDialogOpen: false })
}));
