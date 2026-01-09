/**
 * useBookmarkShortcuts hook for managing bookmark-related keyboard shortcuts.
 */

import { useCallback, useState } from "react";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../stores/KeyPressedStore";
import { NODE_EDITOR_SHORTCUTS } from "../config/shortcuts";
import { useBookmarkPanelStore } from "../stores/BookmarkPanelStore";
import { useCanvasBookmarks } from "./useCanvasBookmarks";
import { isMac } from "../utils/platform";

const ControlOrMeta = isMac() ? "Meta" : "Control";

export const useBookmarkShortcuts = (active: boolean) => {
  const toggleBookmarkPanel = useBookmarkPanelStore(
    (state) => state.toggleVisibility
  );
  const [newBookmarkDialogOpen, setNewBookmarkDialogOpen] = useState(false);
  const [newBookmarkName, setNewBookmarkName] = useState("");
  const { addBookmark } = useCanvasBookmarks();

  const handleToggleBookmarks = useCallback(() => {
    if (active) {
      toggleBookmarkPanel();
    }
  }, [active, toggleBookmarkPanel]);

  const handleAddBookmark = useCallback(() => {
    if (active) {
      setNewBookmarkDialogOpen(true);
      setNewBookmarkName("");
    }
  }, [active]);

  const handleConfirmAddBookmark = useCallback(() => {
    if (newBookmarkName.trim()) {
      addBookmark(newBookmarkName.trim());
      setNewBookmarkDialogOpen(false);
      setNewBookmarkName("");
    }
  }, [newBookmarkName, addBookmark]);

  const handleCancelAddBookmark = useCallback(() => {
    setNewBookmarkDialogOpen(false);
    setNewBookmarkName("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (newBookmarkDialogOpen) {
        if (e.key === "Enter") {
          handleConfirmAddBookmark();
        } else if (e.key === "Escape") {
          handleCancelAddBookmark();
        }
      }
    },
    [newBookmarkDialogOpen, handleConfirmAddBookmark, handleCancelAddBookmark]
  );

  // Register keyboard shortcuts
  const toggleShortcut = NODE_EDITOR_SHORTCUTS.find(
    (s) => s.slug === "toggleBookmarks"
  );
  const addShortcut = NODE_EDITOR_SHORTCUTS.find(
    (s) => s.slug === "addBookmark"
  );

  const toggleCombo = toggleShortcut
    ? toggleShortcut.keyCombo.map((k) =>
        k === "Control" ? ControlOrMeta : k
      )
    : ["Control", "B"];

  const addCombo = addShortcut
    ? addShortcut.keyCombo.map((k) =>
        k === "Control" ? ControlOrMeta : k
      )
    : ["Control", "Shift", "B"];

  // Register useEffect
  const registerShortcuts = useCallback(() => {
    const registered: string[] = [];

    if (active) {
      const toggleKey = toggleCombo.join("+").toLowerCase();
      registerComboCallback(toggleKey, {
        callback: handleToggleBookmarks,
        preventDefault: true,
        active: true,
      });
      registered.push(toggleKey);

      const addKey = addCombo.join("+").toLowerCase();
      registerComboCallback(addKey, {
        callback: handleAddBookmark,
        preventDefault: true,
        active: true,
      });
      registered.push(addKey);
    }

    return () => {
      registered.forEach((combo) => unregisterComboCallback(combo));
    };
  }, [active, toggleCombo, addCombo, handleToggleBookmarks, handleAddBookmark]);

  return {
    newBookmarkDialogOpen,
    newBookmarkName,
    setNewBookmarkName,
    handleConfirmAddBookmark,
    handleCancelAddBookmark,
    handleKeyDown,
    registerShortcuts,
  };
};
