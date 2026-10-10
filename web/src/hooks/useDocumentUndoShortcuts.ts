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
 *
 * With `menuHeading`, Undo and Redo are also listed in the Cmd+K menu under
 * that heading while the shortcuts are bound.
 */

import { useMemo } from "react";
import { useGlobalCombo } from "../stores/KeyPressedStore";
import type { ContextCommand } from "../stores/CommandMenuStore";
import { isMac } from "../utils/platform";
import { useContextCommands } from "./useContextCommands";

interface Options {
  /** True when this surface's tab is the focused one. */
  active: boolean;
  /** False in read-only/view mode, where there is nothing to undo. */
  enabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Heading of the command menu group that lists Undo and Redo. */
  menuHeading?: string;
}

export const useDocumentUndoShortcuts = ({
  active,
  enabled = true,
  onUndo,
  onRedo,
  menuHeading
}: Options): void => {
  // allowInInputs: the surface's text fields are store-controlled, so the
  // shortcut must reach the document's own history even while one is focused.
  const bound = { active: active && enabled, allowInInputs: true } as const;
  useGlobalCombo("control+z", onUndo, bound);
  useGlobalCombo("meta+z", onUndo, bound);
  useGlobalCombo("control+shift+z", onRedo, bound);
  useGlobalCombo("meta+shift+z", onRedo, bound);
  useGlobalCombo("control+y", onRedo, bound);
  useGlobalCombo("meta+y", onRedo, bound);

  const commands = useMemo<ContextCommand[]>(() => {
    if (!menuHeading) {
      return [];
    }
    const mac = isMac();
    return [
      { id: "undo", label: "Undo", run: onUndo, shortcut: mac ? "⌘Z" : "Ctrl+Z" },
      {
        id: "redo",
        label: "Redo",
        run: onRedo,
        shortcut: mac ? "⌘⇧Z" : "Ctrl+Shift+Z"
      }
    ];
  }, [menuHeading, onUndo, onRedo]);
  useContextCommands(menuHeading ?? "", commands, bound.active);
};

export default useDocumentUndoShortcuts;
