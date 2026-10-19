import type * as React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { normToValue, valueToNorm } from '../../params';
import { DRUM_PARAMS } from '../params';
import { useDrumStore } from '../dr1Store';
import { useWheelGesture } from './useWheelGesture';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

interface PosSliderProps {
  paramId: string;
  accent: 'a' | 'b';
}

export function PosSlider({ paramId, accent }: PosSliderProps) {
  const { t } = useTranslation();
  const def = DRUM_PARAMS[paramId];
  const value = useDrumStore((s) => s.params[paramId]);
  const setParam = useDrumStore((s) => s.setParam);
  const beginGesture = useDrumStore((s) => s.beginGesture);
  const endGesture = useDrumStore((s) => s.endGesture);
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

  useWheelGesture(rootRef, (event) => {
    const amount = event.shiftKey ? 0.006 : 0.03;
    setNorm(normRef.current + (event.deltaY < 0 ? amount : -amount));
  });

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = { y: event.clientY, norm: normRef.current };
    rootRef.current?.setPointerCapture(event.pointerId);
    beginGesture();
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
    endGesture();
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
      aria-label={t('i18n-next48.slider.wavetablePosition')}
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
      <span className="dr-pos-label">{t('i18n-next107.drum.position')}</span>
    </div>
  );
}
