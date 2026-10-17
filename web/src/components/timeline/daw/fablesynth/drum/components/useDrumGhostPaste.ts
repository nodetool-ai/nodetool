// Ghost-paste mode for the DR-1 step grid — the pad-positional twin of the
// WT-1/BL-1 useSeqGhostPaste. The selection menu's CUT / COPY pick the rect up,
// ghost cells follow the pointer over the grid, and the next click drops them
// (top-left anchored to the hovered step × pad). Escape — or clicking outside
// the grid — cancels; a cancelled CUT mutates nothing since the source is only
// cleared at drop time, inside the same undo entry as the paste. The drop click
// is swallowed in the capture phase so it never toggles the cell underneath.

import { useRef, useState } from 'react';
import type { PadRectCells, PadRectSel } from '../../shared/seqEdit';

interface Ghost {
  data: PadRectCells;
  cut: boolean;
  src: PadRectSel | null; // source rect to clear on drop (CUT only)
  hover: { step: number; pad: number } | null;
}

interface HookOpts {
  onDrop: (data: PadRectCells, atStep: number, atPad: number, clearSrc: PadRectSel | null) => void;
}

export function useDrumGhostPaste({ onDrop }: HookOpts) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const live = useRef<Ghost | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Any grid cell is a drop target — data-abs-step is the step, data-note the
  // pad index (the DR-1 lanes reuse the shared rect-select cell attributes).
  const findCell = (ev: PointerEvent | MouseEvent): Ghost['hover'] => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const cell = el instanceof Element ? el.closest<HTMLElement>('[data-seq-cell]') : null;
    if (!cell) return null;
    return { step: Number(cell.dataset.absStep), pad: Number(cell.dataset.note) };
  };

  const beginGhost = (data: PadRectCells, opts: { cut: boolean; src: PadRectSel | null }) => {
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
    const move = (ev: PointerEvent) => update(findCell(ev));
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const cur = live.current;
      const at = findCell(ev);
      if (cur && at) onDrop(cur.data, at.step, at.pad, cur.cut ? cur.src : null);
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
      if (!keepClickSwallow) window.removeEventListener('click', swallowClick, { capture: true });
      cleanupRef.current = null;
    };
    cleanupRef.current = () => cleanup(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down, { capture: true });
    window.addEventListener('keydown', keydown, { capture: true });
  };

  // Would a ghost cell land on (step, pad) at the current hover?
  const ghostAt = (step: number, pad: number): boolean => {
    if (!ghost?.hover) return false;
    return ghost.data.cells.some(
      (c) => ghost.hover!.step + c.dStep === step && ghost.hover!.pad + c.dPad === pad,
    );
  };

  // Is (step, pad) a picked-up CUT source cell (dimmed until dropped)?
  const isCutSrc = (step: number, pad: number): boolean => {
    if (!ghost?.cut || !ghost.src) return false;
    const stepLo = Math.min(ghost.src.stepFrom, ghost.src.stepTo);
    const padLo = Math.min(ghost.src.padFrom, ghost.src.padTo);
    return ghost.data.cells.some((c) => stepLo + c.dStep === step && padLo + c.dPad === pad);
  };

  return { ghost, beginGhost, ghostAt, isCutSrc };
}
