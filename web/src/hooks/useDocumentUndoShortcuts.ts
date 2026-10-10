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
 * A text field that is not the document's (outside `root` when given, or in a
 * dialog such as the Cmd+K menu) keeps its own undo.
 *
 * With `menuHeading`, Undo and Redo are also listed in the Cmd+K menu under
 * that heading while the shortcuts are bound.
 */

import { useMemo } from "react";
import { useGlobalCombo } from "../stores/KeyPressedStore";
import type { ContextCommand } from "../stores/CommandMenuStore";
import { isEditableElement } from "../utils/browser";
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
  /** The surface's root element; text fields outside it keep their own undo. */
  root?: () => HTMLElement | null | undefined;
}

const ownsUndo = (
  event: KeyboardEvent | undefined,
  root: Options["root"]
): boolean => {
  const target =
    event?.target instanceof Element ? event.target : document.activeElement;
  if (!isEditableElement(target)) {
    return true;
  }
  const rootElement = root?.();
  if (rootElement) {
    return rootElement.contains(target);
  }
  return target.closest('[role="dialog"]') === null;
};

export const useDocumentUndoShortcuts = ({
  active,
  enabled = true,
  onUndo,
  onRedo,
  menuHeading,
  root
}: Options): void => {
  // allowInInputs: the surface's text fields are store-controlled, so the
  // shortcut must reach the document's own history even while one is focused.
  // preventDefault is applied only when the document takes the shortcut.
  const bound = {
    active: active && enabled,
    allowInInputs: true,
    preventDefault: false
  } as const;
  const undo = (event?: KeyboardEvent) => {
    if (ownsUndo(event, root)) {
      event?.preventDefault();
      onUndo();
    }
  };
  const redo = (event?: KeyboardEvent) => {
    if (ownsUndo(event, root)) {
      event?.preventDefault();
      onRedo();
    }
  };
  useGlobalCombo("control+z", undo, bound);
  useGlobalCombo("meta+z", undo, bound);
  useGlobalCombo("control+shift+z", redo, bound);
  useGlobalCombo("meta+shift+z", redo, bound);
  useGlobalCombo("control+y", redo, bound);
  useGlobalCombo("meta+y", redo, bound);

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
