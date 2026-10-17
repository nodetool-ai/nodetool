import { useRef, type CSSProperties, type PointerEvent } from 'react';

const COLUMN_GAP = 5;

interface NoteLengthHandleProps {
  prefix: 'ns' | 'bl';
  absoluteStep: number;
  totalSteps: number;
  duration: number;
  onChange: (duration: number) => void;
  /** Dim the painted body while the note is being dragged away. */
  muted?: boolean;
}

export function NoteLengthHandle({ prefix, absoluteStep, totalSteps, duration, onChange, muted }: NoteLengthHandleProps) {
  const last = useRef(duration);
  const max = Math.min(63, totalSteps - absoluteStep);
  const length = Math.min(max, Math.max(1, duration));

  const resize = (event: PointerEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const grid = event.currentTarget.closest(prefix === 'ns' ? '.ns-grid' : '.bl-seq-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const pitch = (rect.width + COLUMN_GAP) / totalSteps;
    const next = Math.min(max, Math.max(1, Math.ceil((event.clientX - rect.left + COLUMN_GAP / 2) / pitch) - absoluteStep));
    if (next === last.current) return;
    last.current = next;
    onChange(next);
  };

  const nudge = (delta: number) => {
    const next = Math.min(max, Math.max(1, length + delta));
    last.current = next;
    onChange(next);
  };

  const style = { width: `calc(${length * 100}% + ${(length - 1) * COLUMN_GAP}px)` } as CSSProperties;

  return (
    <span className={`${prefix}-note-paint${muted ? ' muted' : ''}`} style={style}>
      <span
        className={`${prefix}-note-handle`}
        role="slider"
        tabIndex={0}
        aria-label={`Note length, ${length} ${length === 1 ? 'step' : 'steps'}`}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={length}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          last.current = length;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={resize}
        onPointerUp={(event) => {
          resize(event);
          event.stopPropagation();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); nudge(1); }
        }}
      />
    </span>
  );
}
