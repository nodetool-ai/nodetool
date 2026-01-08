import { useEffect } from "react";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../stores/KeyPressedStore";
import { useAppHeaderStore } from "../stores/AppHeaderStore";

export const useGlobalShortcuts = () => {
  const { handleOpenShortcutsDialog } = useAppHeaderStore();

  useEffect(() => {
    const shortcutId = "showShortcutsDialog";

    registerComboCallback(shortcutId, {
      callback: () => {
        handleOpenShortcutsDialog();
      },
      preventDefault: true,
      active: true
    });

    return () => {
      unregisterComboCallback(shortcutId);
    };
  }, [handleOpenShortcutsDialog]);
};

export const useKeyboardShortcutListener = () => {
  const { handleOpenShortcutsDialog } = useAppHeaderStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Element;
      if (
        event.key === "?" &&
        !target.matches("input, textarea, [contenteditable]")
      ) {
        event.preventDefault();
        handleOpenShortcutsDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleOpenShortcutsDialog]);
};
