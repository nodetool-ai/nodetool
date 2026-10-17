// On-screen piano keyboard. Mouse/touch with Y-position velocity; glissando
// while held. Held state (incl. computer-key / MIDI notes) comes from the store.

import type * as React from 'react';
import { useRef } from 'react';
import { useStore } from '../store';

const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11];

interface KeyboardProps {
  low?: number;
  high?: number;
  onNote: (note: number, vel: number) => void;
}

interface KeyLayout {
  note: number;
  black: boolean;
  left: number;
  width: number;
  label?: string;
}

function buildLayout(low: number, high: number): KeyLayout[] {
  const whites: number[] = [];
  for (let n = low; n <= high; n++) {
    if (WHITE_SEMIS.includes(n % 12)) whites.push(n);
  }
  const ww = 100 / whites.length;
  const keys: KeyLayout[] = [];

  whites.forEach((n, i) => {
    keys.push({
      note: n,
      black: false,
      left: i * ww,
      width: ww,
      label: n % 12 === 0 ? 'C' + (n / 12 - 1) : undefined,
    });
  });

  let wi = 0;
  for (let n = low; n <= high; n++) {
    const s = n % 12;
    if (WHITE_SEMIS.includes(s)) { wi++; continue; }
    const bw = ww * 0.62;
    keys.push({ note: n, black: true, left: wi * ww - bw / 2, width: bw });
  }
  return keys;
}

export function Keyboard({ low = 36, high = 84, onNote }: KeyboardProps) {
  const activeNotes = useStore((s) => s.activeNotes);
  const setActive = useStore((s) => s.setActive);
  const elRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef(new Map<number, HTMLElement>());
  const pointersRef = useRef(new Map<number, number>());

  const layout = buildLayout(low, high);

  const noteAt = (e: React.PointerEvent): number | null => {
    const t = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!t || !t.dataset || !t.dataset.note) return null;
    return parseInt(t.dataset.note, 10);
  };

  const velAt = (e: React.PointerEvent, note: number): number => {
    const k = keysRef.current.get(note);
    if (!k) return 0.8;
    const r = k.getBoundingClientRect();
    return Math.min(1, Math.max(0.25, (e.clientY - r.top) / r.height + 0.15));
  };

  const down = (e: React.PointerEvent) => {
    const n = noteAt(e);
    if (n == null) return;
    e.preventDefault();
    try { elRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointersRef.current.set(e.pointerId, n);
    onNote(n, velAt(e, n));
    setActive(n, true);
  };

  const move = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const prev = pointersRef.current.get(e.pointerId)!;
    const n = noteAt(e);
    if (n == null || n === prev) return;
    onNote(prev, 0);
    setActive(prev, false);
    pointersRef.current.set(e.pointerId, n);
    onNote(n, velAt(e, n));
    setActive(n, true);
  };

  const up = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const n = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.delete(e.pointerId);
    onNote(n, 0);
    setActive(n, false);
  };

  return (
    <div
      id="keyboard"
      className="kb"
      ref={elRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={(e) => { if (!e.buttons) up(e); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {layout.map((k) => (
        <div
          key={k.note}
          ref={(el) => { if (el) keysRef.current.set(k.note, el); }}
          className={`kb-key ${k.black ? 'kb-black' : 'kb-white'}${activeNotes.has(k.note) ? ' held' : ''}`}
          data-note={k.note}
          style={{ left: `${k.left}%`, width: `${k.width}%` }}
        >
          {k.label ? <span className="kb-oct">{k.label}</span> : null}
        </div>
      ))}
    </div>
  );
}
