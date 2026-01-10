import { create } from "zustand";

interface AppHeaderState {
  helpOpen: boolean;
  helpIndex: number;
  keyboardShortcutsOpen: boolean;

  setHelpOpen: (open: boolean) => void;
  setHelpIndex: (index: number) => void;
  setKeyboardShortcutsOpen: (open: boolean) => void;

  handleOpenHelp: () => void;
  handleCloseHelp: () => void;
  handleOpenKeyboardShortcuts: () => void;
  handleCloseKeyboardShortcuts: () => void;
}

export const useAppHeaderStore = create<AppHeaderState>((set) => ({
  helpIndex: 0,
  helpOpen: false,
  keyboardShortcutsOpen: false,

  setHelpOpen: (open) => set({ helpOpen: open }),
  setHelpIndex: (index) => set({ helpIndex: index }),
  setKeyboardShortcutsOpen: (open) => set({ keyboardShortcutsOpen: open }),

  handleOpenHelp: () => set({ helpOpen: true }),
  handleCloseHelp: () => set({ helpOpen: false }),
  handleOpenKeyboardShortcuts: () => set({ keyboardShortcutsOpen: true }),
  handleCloseKeyboardShortcuts: () => set({ keyboardShortcutsOpen: false })
}));
