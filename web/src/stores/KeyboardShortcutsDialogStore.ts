import { create } from "zustand";

interface KeyboardShortcutsDialogState {
  isOpen: boolean;
  initialCategory: "all" | "editor" | "panel" | "assets" | "workflow";

  open: (category?: "all" | "editor" | "panel" | "assets" | "workflow") => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Zustand store for managing the Keyboard Shortcuts Dialog state.
 * Provides global control over dialog visibility and initial category filter.
 * 
 * @example
 * // Open dialog with default "all" category
 * useKeyboardShortcutsDialogStore.getState().open();
 * 
 * @example
 * // Open dialog with specific category
 * useKeyboardShortcutsDialogStore.getState().open("editor");
 * 
 * @example
 * // In component
 * const { isOpen, close, open } = useKeyboardShortcutsDialogStore();
 */
export const useKeyboardShortcutsDialogStore = create<KeyboardShortcutsDialogState>(
  (set) => ({
    isOpen: false,
    initialCategory: "all",

    open: (category = "all") =>
      set({
        isOpen: true,
        initialCategory: category
      }),

    close: () =>
      set({
        isOpen: false
      }),

    toggle: () =>
      set((state) => ({
        isOpen: !state.isOpen
      }))
  })
);
