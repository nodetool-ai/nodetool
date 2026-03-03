/**
 * KeyboardShortcutsStore
 *
 * Manages the state of the keyboard shortcuts help dialog.
 * Provides actions to open/close the dialog and query its current state.
 */

import { create } from "zustand";

interface KeyboardShortcutsStore {
  /** Whether the keyboard shortcuts dialog is currently open */
  isDialogOpen: boolean;
  /** Opens the keyboard shortcuts dialog */
  openDialog: () => void;
  /** Closes the keyboard shortcuts dialog */
  closeDialog: () => void;
  /** Toggles the keyboard shortcuts dialog open/closed state */
  toggleDialog: () => void;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsStore>()(
  (set) => ({
    isDialogOpen: false,

    openDialog: () => {
      set({ isDialogOpen: true });
    },

    closeDialog: () => {
      set({ isDialogOpen: false });
    },

    toggleDialog: () => {
      set((state) => ({ isDialogOpen: !state.isDialogOpen }));
    }
  })
);
