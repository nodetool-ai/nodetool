/**
 * useDocumentUndoShortcuts
 *
 * Wires Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z / Ctrl+Y (redo) for a
 * singleton-store editor surface (script, storyboard). Only the active tab's
 * surface listens — every open surface stays mounted, so the `active` guard
 * keeps the shortcut bound to the focused document.
 *
 * The surface's text fields are store-controlled, so the browser's native
 * input undo can't reach them; intercepting the shortcut even while a field is
 * focused routes it to the document's own history, which is the source of truth.
 */

import { useEffect } from "react";

interface Options {
  /** True when this surface's tab is the focused one. */
  active: boolean;
  /** False in read-only/view mode, where there is nothing to undo. */
  enabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const useDocumentUndoShortcuts = ({
  active,
  enabled = true,
  onUndo,
  onRedo
}: Options): void => {
  useEffect(() => {
    if (!active || !enabled) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!e.metaKey && !e.ctrlKey) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, enabled, onUndo, onRedo]);
};

export default useDocumentUndoShortcuts;
