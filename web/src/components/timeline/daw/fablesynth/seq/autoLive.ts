// Live automation values for the knobs. The automation editor publishes the
// normalized value each running lane plays right now; every knob that is a
// lane target draws a ring and a dot from it (Serum-style). Values live in a
// plain map and knobs read them on the shared modLive frame pump, so no React
// state changes per frame.

import { useEffect, useRef, type RefObject } from 'react';
import { subscribeModLive } from '../engine/modLive';
import type { MachineId } from './protocol';

interface Live { norm: number; color: string }

const live = new Map<string, Live>();

/** Replace every live value of one machine. An empty list clears the machine. */
export function publishAutoLive(machine: MachineId, entries: { id: string; norm: number; color: string }[]): void {
  for (const k of [...live.keys()]) if (k.startsWith(`${machine}:`)) live.delete(k);
  for (const e of entries) live.set(`${machine}:${e.id}`, { norm: e.norm, color: e.color });
}

const A0 = -135, A1 = 135;
const degOf = (n: number) => A0 + (A1 - A0) * Math.min(1, Math.max(0, n));
function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [40 + r * Math.cos(a), 40 + r * Math.sin(a)];
}
function arc(r: number, from: number, to: number): string {
  if (Math.abs(to - from) < 0.01) to = from + 0.01;
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Refs for the ring path and the dot of one knob. `baseNorm` is the stored
 * knob value; the inner ring spans from it to the automated value.
 */
export function useAutoLive(machine: MachineId, paramId: string, baseNorm: number): {
  ring: RefObject<SVGPathElement>;
  dot: RefObject<SVGCircleElement>;
} {
  const ring = useRef<SVGPathElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const base = useRef(baseNorm);
  base.current = baseNorm;
  useEffect(() => {
    const key = `${machine}:${paramId}`;
    return subscribeModLive(() => {
      const r = ring.current, d = dot.current;
      if (!r || !d) return;
      const v = live.get(key);
      if (!v) {
        if (r.style.opacity !== '0') { r.style.opacity = '0'; d.style.opacity = '0'; }
        return;
      }
      const deg = degOf(v.norm);
      // Inside the value arc, so it never overlaps the outer mod rings.
      r.setAttribute('d', arc(29, degOf(base.current), deg));
      const [x, y] = polar(33, deg);
      d.setAttribute('cx', x.toFixed(2));
      d.setAttribute('cy', y.toFixed(2));
      r.style.color = d.style.color = v.color;
      r.style.opacity = d.style.opacity = '1';
    });
  }, [machine, paramId]);
  return { ring, dot };
}
