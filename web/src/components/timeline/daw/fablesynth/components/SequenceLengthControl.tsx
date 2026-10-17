import { useEffect, useRef, useState } from 'react';
import { MAX_SEQUENCE_BARS, MIN_SEQUENCE_BARS } from '../sequenceLength';

const DRAG_THRESHOLD = 4;

interface SequenceLengthControlProps {
  editBar: number;
  length: number;
  availableBars?: number;
  playingBar?: number | null;
  onEditBar: (bar: number) => void;
  onLengthChange: (length: number) => void;
  // Optional: pointer-drag a bar chip onto another to move (swap) the pattern
  // between them; Alt-drag copies instead. Omit to keep chips click-only.
  onMovePattern?: (from: number, to: number, opts: { copy: boolean }) => void;
}

export function SequenceLengthControl({
  editBar,
  length,
  availableBars = MAX_SEQUENCE_BARS,
  playingBar = null,
  onEditBar,
  onLengthChange,
  onMovePattern,
}: SequenceLengthControlProps) {
  const barCount = Math.min(MAX_SEQUENCE_BARS, Math.max(MIN_SEQUENCE_BARS, length));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragOrigin = useRef<{ index: number; x: number; y: number } | null>(null);
  const dragging = useRef(false);

  const beginDrag = (index: number, event: { clientX: number; clientY: number; pointerId: number; currentTarget: HTMLElement }) => {
    if (!onMovePattern) return;
    dragOrigin.current = { index, x: event.clientX, y: event.clientY };
    dragging.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: { clientX: number; clientY: number }) => {
    const origin = dragOrigin.current;
    if (!origin || !onMovePattern) return;
    if (!dragging.current) {
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragging.current = true;
      setDragFrom(origin.index);
    }
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const chip = el instanceof Element ? el.closest<HTMLElement>('[data-bar-chip]') : null;
    const target = chip ? Number(chip.dataset.barChip) : null;
    setDropTarget(target !== null && target !== origin.index ? target : null);
  };

  // Escape cancels an in-progress chip drag without triggering a move.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dragOrigin.current) return;
      dragOrigin.current = null;
      dragging.current = false;
      setDragFrom(null);
      setDropTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const endDrag = (event: { altKey: boolean }) => {
    if (dragging.current && dragOrigin.current && dropTarget !== null && onMovePattern) {
      onMovePattern(dragOrigin.current.index, dropTarget, { copy: event.altKey });
    }
    dragOrigin.current = null;
    dragging.current = false;
    setDragFrom(null);
    setDropTarget(null);
  };

  return (
    <div className="seq-bars-control">
      <span className="seq-bars-label">BAR</span>
      <div className="seq-bars" role="group" aria-label="Bar to edit">
        {Array.from({ length: MAX_SEQUENCE_BARS }, (_, index) => (
          <button
            className={`seq-bar${editBar === index ? ' active' : ''}${index < barCount ? ' included' : ''}${barCount > 1 && playingBar === index ? ' playing' : ''}${dragFrom === index ? ' dragging' : ''}${dropTarget === index ? ' drop-target' : ''}`}
            type="button"
            data-bar-chip={index}
            disabled={index >= availableBars}
            aria-label={`Edit bar ${index + 1}${index < barCount ? ', included in sequence' : ''}${barCount > 1 && playingBar === index ? ', currently playing' : ''}`}
            aria-pressed={editBar === index}
            key={index}
            onClick={() => { if (!dragging.current) onEditBar(index); }}
            onPointerDown={(event) => beginDrag(index, event)}
            onPointerMove={moveDrag}
            onPointerUp={(event) => {
              endDrag(event);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <span className="seq-bars-label seq-length-label">LENGTH</span>
      <div className="seq-length" role="group" aria-label="Sequence length">
        <button
          type="button"
          aria-label="Shorten sequence"
          disabled={barCount === MIN_SEQUENCE_BARS}
          onClick={() => onLengthChange(barCount - 1)}
        >
          −
        </button>
        <output aria-live="polite">{barCount} {barCount === 1 ? 'BAR' : 'BARS'}</output>
        <button
          type="button"
          aria-label="Lengthen sequence"
          disabled={barCount === MAX_SEQUENCE_BARS}
          onClick={() => onLengthChange(barCount + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
