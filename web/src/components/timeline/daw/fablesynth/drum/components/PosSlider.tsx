import type * as React from 'react';
import { useEffect, useRef } from 'react';
import { normToValue, valueToNorm } from '../../params';
import { DRUM_PARAMS } from '../params';
import { useDrumStore } from '../store';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

interface PosSliderProps {
  paramId: string;
  accent: 'a' | 'b';
}

export function PosSlider({ paramId, accent }: PosSliderProps) {
  const def = DRUM_PARAMS[paramId];
  const value = useDrumStore((s) => s.params[paramId]);
  const setParam = useDrumStore((s) => s.setParam);
  const norm = clamp01(valueToNorm(def, value));
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const normRef = useRef(norm);
  const dragRef = useRef<{ y: number; norm: number } | null>(null);

  useEffect(() => {
    if (!dragRef.current) normRef.current = norm;
  }, [norm]);

  const setNorm = (next: number) => {
    normRef.current = clamp01(next);
    setParam(paramId, normToValue(def, normRef.current));
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const amount = event.shiftKey ? 0.006 : 0.03;
      setNorm(normRef.current + (event.deltaY < 0 ? amount : -amount));
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
    // setNorm deliberately reads the latest value through normRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = { y: event.clientY, norm: normRef.current };
    rootRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;
    const scale = event.shiftKey ? 0.2 : 1;
    setNorm(drag.norm + ((drag.y - event.clientY) / track.getBoundingClientRect().height) * scale);
  };
  const onPointerEnd = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { rootRef.current?.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const amount = event.shiftKey ? 0.004 : 0.02;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      setNorm(normRef.current + amount);
      event.preventDefault();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      setNorm(normRef.current - amount);
      event.preventDefault();
    }
  };

  const pct = norm * 100;
  return (
    <div
      ref={rootRef}
      className="dr-pos-slider"
      data-accent={accent}
      role="slider"
      tabIndex={0}
      aria-label="wavetable position"
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={Number(value.toFixed(3))}
      aria-valuetext={def.fmt ? def.fmt(value) : value.toFixed(2)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <div className="dr-pos-track" ref={trackRef}>
        <div className="dr-pos-fill" style={{ height: `${pct}%` }} />
        <div className="dr-pos-handle" style={{ bottom: `${pct}%` }} />
      </div>
      <span className="dr-pos-label">POS</span>
    </div>
  );
}
