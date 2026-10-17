import { useControlMenu } from './ControlMenu';
// SVG rotary knob. Drag vertically (shift = fine), scroll wheel, double-click
// to reset, arrow keys when focused. Bipolar params sweep from 12 o'clock.
//
// Knobs that map to a modulation destination double as Serum-style mod targets:
// drop a source chip on one to assign it, then drag the colored ring it grows to
// set the depth (right-click the ring to remove it).

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { PARAMS, DEST_OF_PARAM, SOURCE_COLORS, normToValue, valueToNorm, routeBipolar, routeLabel } from '../params';
import { useStore } from '../store';
import { useModsByDest } from '../hooks/useModsByDest';
import { modLive, modNormOffset, subscribeModLive } from '../engine/modLive';
import { useAutoLive } from '../seq/autoLive';

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
const clampAmt = (n: number) => Math.min(1, Math.max(-1, n));
const degOf = (n: number) => A0 + (A1 - A0) * clamp01(n);

export type KnobSize = 'lg' | 'md' | 'sm' | 'xs';

// One modulation ring: an arc from the current value to where this route would
// push it (both ways when bipolar), in its source color. Vertical drag sets the
// depth; right-click removes. `slotNum` is the absolute slot (1..16) the ring
// edits in the fixed mod pool. `onActive` drives the knob's readout.
function ModRing({ slotNum, amt, src, bi, baseNorm, r, focus, onActive }: {
  slotNum: number; amt: number; src: number; bi: boolean; baseNorm: number; r: number;
  focus: number; onActive: (slot: number | null) => void;
}) {
  const updateSlot = useStore((s) => s.updateSlot);
  const clearSlot = useStore((s) => s.clearSlot);
  const ref = useRef<SVGPathElement>(null);
  const drag = useRef<{ y: number; amt: number } | null>(null);

  const d = arcPath(40, 40, r, degOf(bi ? baseNorm - amt : baseNorm), degOf(baseNorm + amt));
  const state = focus === 0 ? '' : focus === src ? ' k-mod-lit' : ' k-mod-dim';

  return (
    <path
      ref={ref}
      className={`k-mod${state}`}
      d={d}
      style={{ color: SOURCE_COLORS[src] }}
      onPointerEnter={() => onActive(slotNum)}
      onPointerLeave={() => { if (!drag.current) onActive(null); }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        drag.current = { y: e.clientY, amt };
        onActive(slotNum);
        ref.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        e.stopPropagation();
        const dy = drag.current.y - e.clientY;
        updateSlot(slotNum, { amt: clampAmt(drag.current.amt + dy * (e.shiftKey ? 0.001 : 0.005)) });
      }}
      onPointerUp={(e) => {
        drag.current = null;
        try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); clearSlot(slotNum); }}
    />
  );
}

interface KnobProps {
  paramId: string;
  size?: KnobSize;
  accent?: string;
  label?: string;
}

export function Knob({ paramId, size = 'md', accent, label }: KnobProps) {
  const controlMenu = useControlMenu('WT1', paramId);
  const def = PARAMS[paramId];
  const value = useStore((s) => s.params[paramId]);
  const setParam = useStore((s) => s.setParam);

  const dest = DEST_OF_PARAM[paramId];
  const addRoute = useStore((s) => s.addRoute);
  const modDrag = useStore((s) => s.modDrag);
  const myMods = useModsByDest(dest);
  const dropActive = dest && modDrag > 0;
  const modFocus = useStore((s) => s.modFocus);
  const [activeRing, setActiveRing] = useState<number | null>(null);
  const ring = myMods.find((m) => m.slot === activeRing);

  const bipolar = (def.min as number) < 0;
  const norm = clamp01(valueToNorm(def, value));

  const autoLive = useAutoLive('WT1', paramId, norm);
  const elRef = useRef<HTMLDivElement>(null);
  const normRef = useRef(norm);
  const draggingRef = useRef(false);

  // Live modulation dot: rides the shared modLive rAF pump and writes SVG
  // attributes directly — telemetry never touches React state (16 modulated
  // knobs at ~23 Hz would otherwise re-render the whole panel tree).
  const liveRef = useRef<SVGCircleElement>(null);
  const liveNormRef = useRef(norm);
  liveNormRef.current = norm;
  const hasMods = myMods.length > 0;
  useEffect(() => {
    if (!hasMods || !dest) return;
    return subscribeModLive(() => {
      const el = liveRef.current;
      if (!el) return;
      if (!modLive.active) { el.style.opacity = '0'; return; }
      const mn = clamp01(liveNormRef.current + modNormOffset(def, modLive.sums[dest]));
      const [x, y] = polar(40, 40, 33, degOf(mn));
      el.setAttribute('cx', x.toFixed(2));
      el.setAttribute('cy', y.toFixed(2));
      el.style.opacity = '1';
    });
  }, [hasMods, dest, def]);

  // Keep the working norm in sync with external changes (presets, etc.)
  useEffect(() => {
    if (!draggingRef.current) normRef.current = norm;
  }, [norm]);

  const nudge = (deltaNorm: number) => {
    normRef.current = clamp01(normRef.current + deltaNorm);
    setParam(paramId, normToValue(def, normRef.current));
  };

  // Non-passive wheel so preventDefault works.
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

  const lastYRef = useRef(0);
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
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.005 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { nudge(step); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { nudge(-step); e.preventDefault(); }
  };

  const deg = A0 + (A1 - A0) * norm;
  let arcD: string;
  if (bipolar) {
    const mid = valueToNorm(def, 0);
    const midDeg = A0 + (A1 - A0) * mid;
    arcD = arcPath(40, 40, 33, midDeg, deg);
  } else {
    arcD = arcPath(40, 40, 33, A0, deg);
  }
  const valueText = def.fmt ? def.fmt(value) : value.toFixed(2);
  const ringBi = ring ? routeBipolar(ring.src, ring.pol) : false;
  const text = ring ? routeLabel(ring.src, ring.amt, ringBi) : valueText;
  const labelText = label ?? def.label ?? '';

  return (
    <div
      ref={elRef}
      onContextMenu={controlMenu.onContextMenu}
      className={`knob knob-${size}${dest ? ' knob-mod' : ''}${dropActive ? ' mod-target' : ''}${myMods.length ? ' has-mod' : ''}${ring ? ' ring-active' : ''}`}
      data-accent={accent}
      tabIndex={0}
      role="slider"
      aria-label={label || def.label || def.id}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => setParam(paramId, def.def)}
      onKeyDown={onKeyDown}
      onDragOver={dest ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } : undefined}
      onDrop={dest ? (e) => {
        e.preventDefault();
        const src = parseInt(e.dataTransfer.getData('mod-src') || '0', 10);
        if (src) addRoute(src, dest);
      } : undefined}
    >
      <svg viewBox="0 0 80 80">
        <circle className="k-body" cx="40" cy="40" r="26" />
        <path className="k-track" d={arcPath(40, 40, 33, A0, A1)} />
        <path className="k-arc" d={arcD} />
        {myMods.map((m, k) => (
          <ModRing key={m.slot} slotNum={m.slot} amt={m.amt} src={m.src} bi={routeBipolar(m.src, m.pol)}
            baseNorm={norm} r={38 + k * 3.4} focus={modFocus} onActive={setActiveRing} />
        ))}
        <path ref={autoLive.ring} className="k-auto" d="" style={{ opacity: 0 }} />
        <circle ref={autoLive.dot} className="k-auto-dot" r="3.2" style={{ opacity: 0 }} />
        <line className="k-ptr" x1="40" y1="40" x2="40" y2="17" transform={`rotate(${deg} 40 40)`} />
        {myMods.length > 0 && (
          <circle ref={liveRef} className="k-live" r="3.4" style={{ color: SOURCE_COLORS[myMods[0].src] }} />
        )}
      </svg>
      <div className="k-label">{labelText}</div>
      <div className="k-value" style={ring ? { color: SOURCE_COLORS[ring.src] } : undefined}>{text}</div>
      {controlMenu.menu}
    </div>
  );
}
