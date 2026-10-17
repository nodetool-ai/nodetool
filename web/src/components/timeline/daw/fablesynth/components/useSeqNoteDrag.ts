// Shared note-drag gesture for the WT-1 / BL-1 pitch grids: pointerdown on a
// lit cell arms a drag; it becomes one once the pointer reaches a different
// cell (found via elementFromPoint on [data-seq-cell], same pattern only), so
// a plain tap still toggles. Alt = copy, Esc cancels, pointerup commits once.

import { useRef, useState } from 'react';

export interface SeqNoteDrag {
  srcStep: number;
  srcNote: number;
  pattern: number;
  /** Column the pointer grabbed: srcStep for a head grab, later for a body grab. */
  grabStep: number;
  overStep: number;
  overNote: number;
  /** True once the pointer has visited a cell other than the source. */
  active: boolean;
  copy: boolean;
}

export function useSeqNoteDrag(
  onCommit: (from: number, to: number, note: number, copy: boolean, pattern: number, srcNote: number) => void,
) {
  const [drag, setDrag] = useState<SeqNoteDrag | null>(null);
  const suppressClick = useRef(false);

  const startNoteDrag = (e: React.PointerEvent, step: number, note: number, pattern: number, grabStep = step) => {
    suppressClick.current = false;
    // Long notes can be grabbed by their painted body: `step` is the note's
    // origin, `grabStep` the column actually under the pointer. The drag arms
    // relative to the grab point, and the drop keeps the grab offset so the
    // note lands where the grabbed part is released.
    const offset = grabStep - step;
    let cur: SeqNoteDrag = { srcStep: step, srcNote: note, pattern, grabStep, overStep: grabStep, overNote: note, active: false, copy: e.altKey };
    setDrag(cur);
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el instanceof Element ? el.closest<HTMLElement>('[data-seq-cell]') : null;
      if (!cell || Number(cell.dataset.pattern) !== cur.pattern) return;
      const overStep = Number(cell.dataset.step);
      const overNote = Number(cell.dataset.note);
      // Pointermove fires far faster than the cell grid changes. `active` is a
      // latch over the same three inputs, so an unchanged cell (and unchanged
      // Alt) can never flip it: skip the redundant re-render.
      if (overStep === cur.overStep && overNote === cur.overNote && ev.altKey === cur.copy) return;
      cur = {
        ...cur,
        overStep,
        overNote,
        active: cur.active || overStep !== grabStep || overNote !== cur.srcNote,
        copy: ev.altKey,
      };
      setDrag(cur);
    };
    const finish = () => {
      setDrag(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', keydown);
    };
    const up = (ev: PointerEvent) => {
      if (cur.active) {
        // A drag that returns to its source still produces a click there —
        // swallow it. That click (if any) fires synchronously after pointerup,
        // so release the flag on the next tick lest it eat a later real tap.
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 0);
        onCommit(cur.srcStep, Math.max(0, cur.overStep - offset), cur.overNote, ev.altKey, cur.pattern, cur.srcNote);
      }
      finish();
    };
    const keydown = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', keydown);
  };

  /** Call from the cell's onClick: true when the click tail of a drag should be ignored. */
  const consumeDragClick = () => {
    const s = suppressClick.current;
    suppressClick.current = false;
    return s;
  };

  return { drag, startNoteDrag, consumeDragClick };
}
