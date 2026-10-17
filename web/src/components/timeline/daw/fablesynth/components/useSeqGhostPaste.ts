// Ghost-paste mode for the WT-1 / BL-1 note grids: the menu's CUT / COPY pick
// the selection up, ghost cells follow the pointer over the grid — any bar,
// not just the current edit bar — and the next click drops them there
// (top-left anchored, transposing to the hovered lane). Escape — or clicking
// outside the grid — cancels; a cancelled CUT mutates nothing since the
// source is only cleared at drop time, inside the same undo entry as the
// paste. The drop click is swallowed in the capture phase so it never
// reaches the cells' own toggle handlers.

import { useRef, useState } from 'react';
import type { RectCells, RectSel } from '../shared/seqEdit';

interface Ghost {
  data: RectCells;
  cut: boolean;
  src: RectSel | null; // source rect (absolute steps) to clear on drop (CUT only)
  hover: { step: number; note: number } | null;
}

interface HookOpts {
  onDrop: (data: RectCells, atStep: number, dNote: number, clearSrc: RectSel | null) => void;
}

export function useSeqGhostPaste({ onDrop }: HookOpts) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const live = useRef<Ghost | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Any grid cell is a drop target — steps are absolute timeline steps, so
  // a drop can land on any bar and straddle a boundary.
  const findCell = (ev: PointerEvent | MouseEvent): Ghost['hover'] => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const cell = el instanceof Element ? el.closest<HTMLElement>('[data-seq-cell]') : null;
    if (!cell) return null;
    return { step: Number(cell.dataset.absStep), note: Number(cell.dataset.note) };
  };

  const beginGhost = (data: RectCells, opts: { cut: boolean; src: RectSel | null }) => {
    if (!data.cells.length) return;
    cleanupRef.current?.();
    const state: Ghost = { data, cut: opts.cut, src: opts.src, hover: null };
    live.current = state;
    setGhost(state);

    const update = (hover: Ghost['hover']) => {
      live.current = { ...state, hover };
      setGhost(live.current);
    };
    const finish = (viaPointerDown: boolean) => {
      cleanup(viaPointerDown);
      live.current = null;
      setGhost(null);
    };
    const move = (ev: PointerEvent) => {
      const at = findCell(ev);
      // The ghost only redraws when it changes lane or column, so drop the
      // moves that stay inside the cell already hovered.
      const prev = live.current?.hover ?? null;
      if (at === null ? prev === null : prev !== null && prev.step === at.step && prev.note === at.note) return;
      update(at);
    };
    // The drop (or an outside-the-grid cancel) commits on pointerdown; the
    // paired click is swallowed once in the capture phase so the cell
    // underneath never toggles.
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const cur = live.current;
      const at = findCell(ev);
      if (cur && at) onDrop(cur.data, at.step, at.note - cur.data.noteHi, cur.cut ? cur.src : null);
      window.addEventListener('click', swallowClick, { capture: true });
      finish(true);
    };
    const swallowClick = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      window.removeEventListener('click', swallowClick, { capture: true });
    };
    const keydown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      finish(false);
    };
    const cleanup = (keepClickSwallow: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down, { capture: true });
      window.removeEventListener('keydown', keydown, { capture: true });
      // An Escape cancel must not eat the user's next unrelated click; only
      // the click paired with the drop pointerdown stays swallowed.
      if (!keepClickSwallow) window.removeEventListener('click', swallowClick, { capture: true });
      cleanupRef.current = null;
    };
    cleanupRef.current = () => cleanup(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down, { capture: true });
    window.addEventListener('keydown', keydown, { capture: true });
  };

  // Would a ghost note land on (absolute step, note) at the current hover?
  const ghostAt = (step: number, note: number): boolean => {
    if (!ghost?.hover) return false;
    const dNote = ghost.hover.note - ghost.data.noteHi;
    return ghost.data.cells.some(
      (c) => ghost.hover!.step + c.dStep === step && (c.bytes[1] & 0x7f) + dNote === note,
    );
  };

  // Is (absolute step, note) a picked-up CUT source cell (dimmed until dropped)?
  const isCutSrc = (step: number, note: number): boolean => {
    if (!ghost?.cut || !ghost.src) return false;
    const lo = Math.min(ghost.src.stepFrom, ghost.src.stepTo);
    return ghost.data.cells.some((c) => lo + c.dStep === step && (c.bytes[1] & 0x7f) === note);
  };

  return { ghost, beginGhost, ghostAt, isCutSrc };
}
