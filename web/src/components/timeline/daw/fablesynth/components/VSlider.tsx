import { useControlMenu } from './ControlMenu';
// Vertical slider used for wavetable position, with a "ghost" marker that
// tracks the live modulated position coming back from the DSP thread. It is also
// a Serum-style mod target: drop a source chip to assign it, and the colored
// depth band it grows can be dragged (right-click to remove).

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PARAMS, DEST_OF_PARAM, SOURCE_COLORS, normToValue, valueToNorm, routeBipolar, routeLabel } from '../params';
import { useStore } from '../store';
import { useModsByDest } from '../hooks/useModsByDest';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampAmt = (n: number) => Math.min(1, Math.max(-1, n));

interface VSliderProps {
  paramId: string;
  accent?: string;
  ghost: number; // live modulated position 0..1, -1 = hidden
}

// A draggable modulation-depth band beside the track, rising from the current value. `slotNum` is
// the absolute slot (1..16) the band edits in the fixed mod pool.
function PosModBand({ slotNum, amt, src, bi, baseNorm, lane, focus, onActive }: {
  slotNum: number; amt: number; src: number; bi: boolean; baseNorm: number; lane: number;
  focus: number; onActive: (slot: number | null) => void;
}) {
  const updateSlot = useStore((s) => s.updateSlot);
  const clearSlot = useStore((s) => s.clearSlot);
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; amt: number } | null>(null);

  const top = clamp01(baseNorm + amt);
  const from = bi ? clamp01(baseNorm - amt) : baseNorm;
  const lo = Math.min(from, top);
  const hi = Math.max(from, top);
  const state = focus === 0 ? '' : focus === src ? ' vs-mod-lit' : ' vs-mod-dim';

  return (
    <div
      ref={elRef}
      className={`vs-mod${state}`}
      style={{ bottom: `${lo * 100}%`, height: `max(2px, ${(hi - lo) * 100}%)`, ['--src' as string]: SOURCE_COLORS[src], ['--lane' as string]: lane }}
      onPointerEnter={() => onActive(slotNum)}
      onPointerLeave={() => { if (!drag.current) onActive(null); }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        drag.current = { y: e.clientY, amt };
        onActive(slotNum);
        elRef.current?.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        e.stopPropagation();
        const dy = drag.current.y - e.clientY;
        updateSlot(slotNum, { amt: clampAmt(drag.current.amt + dy * (e.shiftKey ? 0.0008 : 0.004)) });
      }}
      onPointerUp={(e) => {
        drag.current = null;
        try { elRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); clearSlot(slotNum); }}
    />
  );
}

export function VSlider({ paramId, accent, ghost }: VSliderProps) {
  const { t } = useTranslation();
  const controlMenu = useControlMenu('WT1', paramId);
  const def = PARAMS[paramId];
  const value = useStore((s) => s.params[paramId]);
  const setParam = useStore((s) => s.setParam);
  const norm = clamp01(valueToNorm(def, value));

  const dest = DEST_OF_PARAM[paramId];
  const addRoute = useStore((s) => s.addRoute);
  const modDrag = useStore((s) => s.modDrag);
  const myMods = useModsByDest(dest);
  const dropActive = dest && modDrag > 0;
  const modFocus = useStore((s) => s.modFocus);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const band = myMods.find((m) => m.slot === activeBand);

  const elRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const normRef = useRef(norm);
  useEffect(() => { if (!draggingRef.current) normRef.current = norm; }, [norm]);

  const setNorm = (n: number) => {
    normRef.current = clamp01(n);
    setParam(paramId, normToValue(def, normRef.current));
  };

  const moveTo = (clientY: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    setNorm(1 - (clientY - r.top) / r.height);
  };

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setNorm(normRef.current + (e.deltaY < 0 ? 0.03 : -0.03));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    draggingRef.current = true;
    elRef.current?.setPointerCapture(e.pointerId);
    moveTo(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (draggingRef.current) moveTo(e.clientY); };
  const onPointerEnd = () => { draggingRef.current = false; };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') { setNorm(normRef.current + 0.02); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { setNorm(normRef.current - 0.02); e.preventDefault(); }
  };

  const pct = norm * 100;

  return (
    <div
      ref={elRef}
      onContextMenu={controlMenu.onContextMenu}
      className={`vslider${dest ? ' vslider-mod' : ''}${dropActive ? ' mod-target' : ''}`}
      data-accent={accent}
      tabIndex={0}
      role="slider"
      aria-label={t('i18n-next44-fablesynth-controls.vSlider.wavetablePosition')}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={Number(value.toFixed(3))}
      aria-valuetext={def.fmt ? def.fmt(value) : value.toFixed(2)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onDragOver={dest ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } : undefined}
      onDrop={dest ? (e) => {
        e.preventDefault();
        const src = parseInt(e.dataTransfer.getData('mod-src') || '0', 10);
        if (src) addRoute(src, dest);
      } : undefined}
    >
      <div className="vs-track" ref={trackRef}>
        <div className="vs-fill" style={{ height: `${pct}%` }} />
        {myMods.map((m, k) => (
          <PosModBand key={m.slot} slotNum={m.slot} amt={m.amt} src={m.src} bi={routeBipolar(m.src, m.pol)}
            baseNorm={norm} lane={k} focus={modFocus} onActive={setActiveBand} />
        ))}
        <div
          className="vs-ghost"
          style={ghost < 0 ? { opacity: 0 } : { opacity: 1, bottom: `${ghost * 100}%` }}
        />
        <div className="vs-handle" style={{ bottom: `${pct}%` }} />
      </div>
      <div className="vs-label" style={band ? { color: SOURCE_COLORS[band.src] } : undefined}>
        {band ? routeLabel(band.src, band.amt, routeBipolar(band.src, band.pol)) : t('i18n-next44-fablesynth-controls.vSlider.position')}
      </div>
      {controlMenu.menu}
    </div>
  );
}
