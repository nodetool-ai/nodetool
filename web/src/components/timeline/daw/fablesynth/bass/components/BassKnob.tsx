import { useControlMenu } from '../../components/ControlMenu';
import type * as React from 'react';
import { useEffect, useRef } from 'react';
import { normToValue, valueToNorm } from '../../params';
import { BASS_PARAMS } from '../params';
import { useBassStore } from '../store';
import { useAutoLive } from '../../seq/autoLive';

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
const degOf = (n: number) => A0 + (A1 - A0) * clamp01(n);

export type BassKnobSize = 'lg' | 'md' | 'sm' | 'xs';

interface BassKnobProps {
  paramId: string;
  size?: BassKnobSize;
  accent?: string;
  label?: string;
}

export function BassKnob({ paramId, size = 'md', accent, label }: BassKnobProps) {
  const controlMenu = useControlMenu('BL1', paramId);
  const def = BASS_PARAMS[paramId];
  const value = useBassStore((s) => s.params[paramId]);
  const setParam = useBassStore((s) => s.setParam);

  const bipolar = (def.min as number) < 0;
  const norm = clamp01(valueToNorm(def, value));

  const autoLive = useAutoLive('BL1', paramId, norm);
  const elRef = useRef<HTMLDivElement>(null);
  const normRef = useRef(norm);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) normRef.current = norm;
  }, [norm]);

  const nudge = (deltaNorm: number) => {
    normRef.current = clamp01(normRef.current + deltaNorm);
    setParam(paramId, normToValue(def, normRef.current));
  };

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.03));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // nudge deliberately reads the latest value through normRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId]);

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

  const deg = degOf(norm);
  let arcD: string;
  if (bipolar) {
    const mid = valueToNorm(def, 0);
    arcD = arcPath(40, 40, 33, degOf(mid), deg);
  } else {
    arcD = arcPath(40, 40, 33, A0, deg);
  }
  const text = def.fmt ? def.fmt(value) : value.toFixed(2);
  const labelText = label ?? def.label ?? '';

  return (
    <div
      ref={elRef}
      onContextMenu={controlMenu.onContextMenu}
      className={`knob knob-${size}`}
      data-accent={accent}
      tabIndex={0}
      role="slider"
      aria-label={label || def.label || def.id}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      aria-valuetext={text}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => setParam(paramId, def.def)}
      onKeyDown={onKeyDown}
    >
      <svg viewBox="0 0 80 80">
        <circle className="k-body" cx="40" cy="40" r="26" />
        <path className="k-track" d={arcPath(40, 40, 33, A0, A1)} />
        <path className="k-arc" d={arcD} />
        <path ref={autoLive.ring} className="k-auto" d="" style={{ opacity: 0 }} />
        <circle ref={autoLive.dot} className="k-auto-dot" r="3.2" style={{ opacity: 0 }} />
        <line className="k-ptr" x1="40" y1="40" x2="40" y2="17" transform={`rotate(${deg} 40 40)`} />
      </svg>
      <div className="k-label">{labelText}</div>
      <div className="k-value">{text}</div>
      {controlMenu.menu}
    </div>
  );
}
