// Minimal interactive knob for SQ-4 — same look as the WT-1/BL-1 knobs
// (shared .knob styles from index.css) but driven by a plain 0..1 value
// instead of a synth parameter table.

import type * as React from 'react';
import { useEffect, useRef } from 'react';

const A0 = -135, A1 = 135;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  if (Math.abs(to - from) < 0.01) to = from + 0.01;
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface SeqKnobProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  label: string;
  size?: 'md' | 'sm' | 'xs';
  defaultValue?: number;
}

export function SeqKnob({ value, onChange, label, size = 'md', defaultValue = 0.5 }: SeqKnobProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const valueRef = useRef(value);
  if (!draggingRef.current) valueRef.current = value;

  const nudge = (d: number) => {
    valueRef.current = clamp01(valueRef.current + d);
    onChange(valueRef.current);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    lastYRef.current = e.clientY;
    elRef.current?.setPointerCapture(e.pointerId);
    elRef.current?.classList.add('dragging');
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dy = lastYRef.current - e.clientY;
    lastYRef.current = e.clientY;
    nudge(dy * (e.shiftKey ? 0.0008 : 0.005));
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    elRef.current?.classList.remove('dragging');
    try { elRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  // Non-passive wheel so preventDefault works (same pattern as Knob.tsx) —
  // React's synthetic onWheel is passive, which would let the page scroll
  // under the pointer instead of nudging the value.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.03));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.005 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { nudge(step); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { nudge(-step); e.preventDefault(); }
  };

  const deg = A0 + (A1 - A0) * clamp01(value);
  const pct = Math.round(value * 100);

  return (
    <div
      ref={elRef}
      className={`knob knob-${size}`}
      data-accent="n"
      tabIndex={0}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={onKeyDown}
    >
      <svg viewBox="0 0 80 80">
        <circle className="k-body" cx="40" cy="40" r="26" />
        <path className="k-track" d={arcPath(40, 40, 33, A0, A1)} />
        <path className="k-arc" d={arcPath(40, 40, 33, A0, deg)} />
        <line className="k-ptr" x1="40" y1="40" x2="40" y2="17" transform={`rotate(${deg} 40 40)`} />
      </svg>
      <div className="k-label">{label}</div>
      <div className="k-value">{pct}</div>
    </div>
  );
}
