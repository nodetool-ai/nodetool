/**
 * KeyboardShortcutsDialogStore
 *
 * Manages the state of the keyboard shortcuts reference dialog.
 * Allows opening/closing the dialog from anywhere in the application.
 */

import { create } from "zustand";

interface KeyboardShortcutsDialogStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useKeyboardShortcutsDialogStore = create<KeyboardShortcutsDialogStore>(
  (set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((state) => ({ isOpen: !state.isOpen }))
  })
);

export default useKeyboardShortcutsDialogStore;
