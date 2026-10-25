import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DynamicsMessage } from '../../engine/dynamics';
import { setupCanvas } from './canvas';
import type { FxTelemetryEngine } from '../panels/fxAdapter';

type Reading = NonNullable<DynamicsMessage['limiter']>;

// Three seconds of telemetry at its 30 reports a second.
const HISTORY = 90;
// The level graph spans this much below 0 dBFS.
const FLOOR_DB = -30;
// The gain-reduction lane spans this much reduction.
const GR_RANGE_DB = 12;
// Telemetry older than this reads as silence.
const STALE_MS = 350;

const IDLE: Reading = { input: -90, output: -90, reduction: 0, inputPeak: -90, outputPeak: -90 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const level = (db: number) => (db <= -89 ? '−∞' : db.toFixed(1));

/**
 * The limiter's scrolling display: the driven input's sample peaks (filled),
 * the output's peaks (line) and the ceiling, with the gain reduction in a lane
 * under them. Readouts give the RMS levels and the current reduction.
 */
export function LimiterView({ engine, on, ceiling }: { engine: FxTelemetryEngine; on: boolean; ceiling: number }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const readouts = useRef<HTMLDivElement>(null);
  const settings = useRef({ on, ceiling });
  settings.current = { on, ceiling };
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let latest = IDLE, stamp = 0, frame = 0;
    const history: Reading[] = [];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      frame = 0;
      const { ctx: c, w, h } = setupCanvas(el);
      const { on: active, ceiling: ceil } = settings.current;
      const style = getComputedStyle(el), ink = style.getPropertyValue('--text').trim() || '#dfe6f3';
      const slate = style.getPropertyValue('--ac-n').trim() || '#9fb4d8';
      c.clearRect(0, 0, w, h);
      c.font = '9px "IBM Plex Mono", monospace';
      c.lineWidth = 1;
      const text = (value: string, x: number, y: number, color = slate, align: CanvasTextAlign = 'left') => {
        c.fillStyle = color; c.textAlign = align; c.fillText(value, x, y);
      };
      const line = (x: number, y: number, x2: number, y2: number, color: string, opacity = 1) => {
        c.globalAlpha = opacity; c.strokeStyle = color; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); c.globalAlpha = 1;
      };
      const left = 29, right = w - 12, top = 14, bottom = h - 43;
      const Y = (db: number) => top + (1 - clamp((db - FLOOR_DB) / -FLOOR_DB, 0, 1)) * (bottom - top);
      const X = (i: number, count: number) => left + (HISTORY - count + i) / (HISTORY - 1) * (right - left);
      for (const db of [0, -6, -12, -24]) {
        text(`${db}`, left - 6, Y(db) + 3, slate, 'right');
        line(left, Y(db), right, Y(db), slate, 0.1);
      }
      const samples = motion.matches ? Array<Reading>(HISTORY).fill(latest) : history;
      if (samples.length > 1) {
        // Driven input peaks, filled down to the floor.
        c.beginPath(); c.moveTo(X(0, samples.length), bottom);
        samples.forEach((m, i) => c.lineTo(X(i, samples.length), Y(m.inputPeak)));
        c.lineTo(X(samples.length - 1, samples.length), bottom); c.closePath();
        c.fillStyle = slate; c.globalAlpha = 0.18; c.fill(); c.globalAlpha = 1;
        const trace = (key: 'inputPeak' | 'outputPeak', color: string, opacity: number, width: number) => {
          c.strokeStyle = color; c.globalAlpha = opacity; c.lineWidth = width; c.beginPath();
          samples.forEach((m, i) => { const x = X(i, samples.length), y = Y(m[key]); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
          c.stroke(); c.globalAlpha = 1; c.lineWidth = 1;
        };
        trace('inputPeak', slate, 0.55, 1);
        trace('outputPeak', ink, 1, 1.5);
      }
      c.setLineDash([3, 4]); line(left, Y(ceil), right, Y(ceil), ink, active ? 0.7 : 0.25); c.setLineDash([]);
      text('CEIL', right, Y(ceil) - 4, slate, 'right');
      // Gain reduction, hanging from the lane's top edge.
      const grTop = h - 29, grBottom = h - 9;
      text('GR', left - 6, grTop + 9, slate, 'right');
      line(left, grTop, right, grTop, slate, 0.22);
      if (samples.length > 1) {
        c.beginPath(); c.moveTo(X(0, samples.length), grTop);
        samples.forEach((m, i) => c.lineTo(X(i, samples.length), grTop + clamp(active ? m.reduction / GR_RANGE_DB : 0, 0, 1) * (grBottom - grTop)));
        c.lineTo(X(samples.length - 1, samples.length), grTop); c.closePath();
        c.fillStyle = slate; c.globalAlpha = 0.45; c.fill(); c.globalAlpha = 1;
      }
      text(`-${GR_RANGE_DB}`, left - 6, grBottom + 3, slate, 'right');
      const reduction = active ? latest.reduction : 0;
      const readings = [level(latest.input), level(latest.output), reduction.toFixed(1)];
      readouts.current?.querySelectorAll('output').forEach((output, i) => { output.textContent = `${readings[i]} dB`; });
      el.setAttribute('aria-label', t('i18n-next45-fablesynth-effects.limiter.displayAria', {
        input: level(latest.inputPeak), output: level(latest.outputPeak), reduction: reduction.toFixed(1)
      }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    redraw.current = schedule;
    const unsubscribe = engine.subscribeDynamics((message) => {
      if (!message.limiter) return;
      latest = message.limiter; stamp = performance.now();
      history.push(message.limiter); if (history.length > HISTORY) history.shift();
      schedule();
    });
    const resize = new ResizeObserver(schedule); resize.observe(el);
    const stale = window.setInterval(() => {
      if (stamp && performance.now() - stamp > STALE_MS) { stamp = 0; latest = IDLE; history.length = 0; schedule(); }
    }, 200);
    motion.addEventListener('change', schedule);
    schedule();
    return () => {
      unsubscribe(); resize.disconnect(); clearInterval(stale); cancelAnimationFrame(frame);
      motion.removeEventListener('change', schedule); redraw.current = () => {};
    };
  }, [engine, t]);
  useEffect(() => { redraw.current(); }, [on, ceiling]);

  return <>
    <canvas ref={canvas} className="limiter-display" role="img" />
    <div ref={readouts} className="limiter-readouts" aria-hidden="true">
      <div><span>{t('i18n-next45-fablesynth-effects.dynamics.input')}</span><output /></div>
      <div><span>{t('i18n-next45-fablesynth-effects.dynamics.output')}</span><output /></div>
      <div><span>GR</span><output /></div>
    </div>
  </>;
}
