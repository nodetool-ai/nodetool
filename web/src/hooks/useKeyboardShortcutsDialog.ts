/**
 * useKeyboardShortcutsDialog
 *
 * Hook for handling keyboard shortcut to open the keyboard shortcuts dialog.
 * Registers the "/" key shortcut to toggle the dialog.
 */

import { useCombo } from "../stores/KeyPressedStore";
import { useKeyboardShortcutsStore } from "../stores/KeyboardShortcutsStore";

export function useKeyboardShortcutsDialog(): void {
  const { toggleDialog } = useKeyboardShortcutsStore();

  // Register "/" key to open the keyboard shortcuts dialog
  useCombo(["/"], () => {
    toggleDialog();
  });
}
