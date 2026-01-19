/**
 * Manages the application header state.
 *
 * Controls the top header bar including help dialog visibility and
 * help content navigation. Used by AppHeader component to manage
 * user assistance features.
 *
 * Features:
 * - Help dialog open/close state
 * - Help content index for multi-page help
 * - Keyboard-accessible help navigation
 *
 * @example
 * ```typescript
 * import { useAppHeaderStore } from './AppHeaderStore';
 *
 * const store = useAppHeaderStore();
 * store.handleOpenHelp();
 * store.setHelpIndex(2);
 * ```
 */
import { create } from "zustand";

interface AppHeaderState {
  helpOpen: boolean;
  helpIndex: number;

  setHelpOpen: (open: boolean) => void;
  setHelpIndex: (index: number) => void;

  handleOpenHelp: () => void;
  handleCloseHelp: () => void;
}

export const useAppHeaderStore = create<AppHeaderState>((set) => ({
  helpIndex: 0,
  helpOpen: false,

  setHelpOpen: (open) => set({ helpOpen: open }),
  setHelpIndex: (index) => set({ helpIndex: index }),

  handleOpenHelp: () => set({ helpOpen: true }),
  handleCloseHelp: () => set({ helpOpen: false })
}));
