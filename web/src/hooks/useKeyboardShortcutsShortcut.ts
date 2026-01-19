import { useCallback, useMemo } from "react";
import { useCombo } from "../stores/KeyPressedStore";
import { useKeyboardShortcutsDialogStore } from "../stores/KeyboardShortcutsDialogStore";
import { isMac } from "../utils/platform";

export const useKeyboardShortcutsShortcut = () => {
  const open = useKeyboardShortcutsDialogStore((state) => state.open);

  const handleOpenShortcuts = useCallback(() => {
    open();
  }, [open]);

  const combo = useMemo(() => (isMac() ? ["meta", "/"] : ["control", "/"]), []);

  // Register the shortcut
  useCombo(combo, handleOpenShortcuts, true);
};
