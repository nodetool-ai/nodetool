// WT-1 step-sequencer edit verbs (docs/editing-concept.md): copy/cut/paste/
// duplicate/delete/select-all/clear-selection/undo/redo. Guarded like
// useComputerKeys — ignore form targets, and claim only modifier combos plus
// the handful of plain keys (Delete/Backspace/Escape) that don't collide with
// note-playing (KeyZ/KeyX/letter-row keys stay free).

import { useEffect } from 'react';
import { useStore } from '../store';

function isFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (target.getAttribute('role') === 'slider') return true;
  return false;
}

export function useSeqEditKeys() {
  const copySteps = useStore((s) => s.copySteps);
  const cutSteps = useStore((s) => s.cutSteps);
  const pasteSteps = useStore((s) => s.pasteSteps);
  const duplicateSteps = useStore((s) => s.duplicateSteps);
  const deleteSteps = useStore((s) => s.deleteSteps);
  const selectAllSteps = useStore((s) => s.selectAllSteps);
  const clearStepSel = useStore((s) => s.clearStepSel);
  const undoSeq = useStore((s) => s.undoSeq);
  const redoSeq = useStore((s) => s.redoSeq);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (useStore.getState().arpMode && !useStore.getState().hosted) return;
      if (isFormTarget(e.target)) return;
      if (e.repeat) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        switch (e.code) {
          case 'KeyC': e.preventDefault(); copySteps(); return;
          case 'KeyX': e.preventDefault(); cutSteps(); return;
          case 'KeyV': e.preventDefault(); pasteSteps(); return;
          case 'KeyD': e.preventDefault(); duplicateSteps(); return;
          case 'KeyA': e.preventDefault(); selectAllSteps(); return;
          case 'KeyZ':
            e.preventDefault();
            if (e.shiftKey) redoSeq(); else undoSeq();
            return;
          default: return;
        }
      }
      if (e.code === 'Delete' || e.code === 'Backspace') { deleteSteps(); return; }
      if (e.code === 'Escape') { clearStepSel(); return; }
    };

    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [copySteps, cutSteps, pasteSteps, duplicateSteps, deleteSteps, selectAllSteps, clearStepSel, undoSeq, redoSeq]);
}
