import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface DrawNote {
  absoluteStep: number;
  note: number;
  duration: number;
}

/** Preview locally, then write one note on release so drawing is one undo step. */
export function useSeqNoteDraw(onCommit: (note: DrawNote) => void) {
  const [drawing, setDrawing] = useState<DrawNote | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const resetClick = () => { suppressClick.current = false; };
    window.addEventListener('pointerdown', resetClick, true);
    return () => {
      cleanup.current?.();
      window.removeEventListener('pointerdown', resetClick, true);
    };
  }, []);

  const startNoteDraw = (event: ReactPointerEvent<HTMLElement>, absoluteStep: number, note: number, totalSteps: number) => {
    if (event.button !== 0) return;
    cleanup.current?.();
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pitch = rect.width + 5; // shared sequencer column gap
    const pointerId = event.pointerId;
    let current = { absoluteStep, note, duration: 1 };
    setDrawing(current);
    const update = (e: PointerEvent) => {
      const duration = Math.max(1, Math.min(63, totalSteps - absoluteStep,
        Math.floor((e.clientX - rect.left) / pitch) + 1));
      if (duration !== current.duration) {
        current = { ...current, duration };
        setDrawing(current);
      }
    };
    const move = (e: PointerEvent) => { if (e.pointerId === pointerId) update(e); };
    const finish = (released = false) => {
      suppressClick.current = true;
      if (released) setTimeout(() => { suppressClick.current = false; }, 0);
      cleanup.current?.();
      setDrawing(null);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      update(e);
      onCommit(current);
      finish(true);
    };
    const cancel = () => finish();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    const pointerCancel = (e: PointerEvent) => { if (e.pointerId === pointerId) finish(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      cleanup.current = null;
    };
  };

  return { drawing, startNoteDraw, consumeDrawClick: () => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  } };
}
