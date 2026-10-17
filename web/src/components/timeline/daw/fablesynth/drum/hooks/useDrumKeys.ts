import { useEffect } from 'react';
import { useDrumStore } from '../store';

const KEYMAP: Record<string, number> = {
  Digit1: 12, Digit2: 13, Digit3: 14, Digit4: 15,
  KeyQ: 8, KeyW: 9, KeyE: 10, KeyR: 11,
  KeyA: 4, KeyS: 5, KeyD: 6, KeyF: 7,
  KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3,
};

// input/textarea/select/[contenteditable]/[role=slider] keep their own key
// handling — plain keys (including the pad-trigger KEYMAP above) never fire
// while one of those is focused.
function isFormTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && !!target.closest('input, textarea, select, [contenteditable], [role="slider"], [data-sequence-controls]');
}

export function useDrumKeys() {
  const triggerPad = useDrumStore((s) => s.triggerPad);
  const stop = useDrumStore((s) => s.stop);
  const copySelection = useDrumStore((s) => s.copySelection);
  const cutSelection = useDrumStore((s) => s.cutSelection);
  const pasteSelection = useDrumStore((s) => s.pasteSelection);
  const duplicateSelection = useDrumStore((s) => s.duplicateSelection);
  const deleteSelection = useDrumStore((s) => s.deleteSelection);
  const selectAllSteps = useDrumStore((s) => s.selectAllSteps);
  const clearStepSel = useDrumStore((s) => s.clearStepSel);
  const undo = useDrumStore((s) => s.undo);
  const redo = useDrumStore((s) => s.redo);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (isFormTarget(e.target)) return;

      // Verb table: only modifier combos are claimed here so plain keys stay
      // free for the pad KEYMAP below (note-playing takes priority).
      if (e.metaKey || e.ctrlKey) {
        if (e.repeat) return;
        switch (e.code) {
          case 'KeyC': e.preventDefault(); copySelection(); return;
          case 'KeyX': e.preventDefault(); cutSelection(); return;
          case 'KeyV': e.preventDefault(); pasteSelection(); return;
          case 'KeyD': e.preventDefault(); duplicateSelection(); return;
          case 'KeyA': e.preventDefault(); selectAllSteps(); return;
          case 'KeyZ':
            e.preventDefault();
            if (e.shiftKey) redo(); else undo();
            return;
          default: return;
        }
      }

      if (e.repeat || e.altKey) return;

      if (e.code === 'Delete' || e.code === 'Backspace') { deleteSelection(); return; }

      if (e.code === 'Escape') {
        // Esc clears an active selection first; with nothing selected it
        // falls back to the original panic/stop behavior.
        if (useDrumStore.getState().rectSel) { clearStepSel(); return; }
        stop();
        return;
      }

      const padIndex = KEYMAP[e.code];
      if (padIndex !== undefined) triggerPad(padIndex, 0.85);
    };

    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [
    stop, triggerPad, copySelection, cutSelection, pasteSelection,
    duplicateSelection, deleteSelection, selectAllSteps, clearStepSel, undo, redo,
  ]);
}
