import { useEffect } from "react";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../stores/KeyPressedStore";
import { useAppHeaderStore } from "../stores/AppHeaderStore";

export const useGlobalShortcuts = () => {
  const { handleOpenHelpAtShortcuts } = useAppHeaderStore();

  useEffect(() => {
    const shortcutId = "showShortcutsDialog";

    registerComboCallback(shortcutId, {
      callback: () => {
        handleOpenHelpAtShortcuts();
      },
      preventDefault: true,
      active: true
    });

    return () => {
      unregisterComboCallback(shortcutId);
    };
  }, [handleOpenHelpAtShortcuts]);
};

export const useKeyboardShortcutListener = () => {
  const { handleOpenHelpAtShortcuts } = useAppHeaderStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Element;
      if (
        event.key === "?" &&
        !target.matches("input, textarea, [contenteditable]")
      ) {
        event.preventDefault();
        handleOpenHelpAtShortcuts();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleOpenHelpAtShortcuts]);
};
