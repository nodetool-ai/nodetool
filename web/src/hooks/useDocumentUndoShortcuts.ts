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

import { useGlobalCombo } from "../stores/KeyPressedStore";

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
  // allowInInputs: the surface's text fields are store-controlled, so the
  // shortcut must reach the document's own history even while one is focused.
  const bound = { active: active && enabled, allowInInputs: true } as const;
  useGlobalCombo("control+z", onUndo, bound);
  useGlobalCombo("meta+z", onUndo, bound);
  useGlobalCombo("control+shift+z", onRedo, bound);
  useGlobalCombo("meta+shift+z", onRedo, bound);
  useGlobalCombo("control+y", onRedo, bound);
  useGlobalCombo("meta+y", onRedo, bound);
};

export default useDocumentUndoShortcuts;
