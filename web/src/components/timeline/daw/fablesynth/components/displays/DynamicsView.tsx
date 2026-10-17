import { useEffect, useRef } from 'react';
import { engine, useStore } from '../../store';
import { idleDynamics, type DynamicsMessage } from '../../engine/dynamics';
import { setupCanvas } from './canvas';
import type { FxTelemetryEngine } from '../panels/fxAdapter';

type Kind = 'ott' | 'comp';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const signed = (v: number) => `${v > 0.05 ? '+' : ''}${Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1)}`;
const level = (v: number) => v <= -89 ? '−∞' : v.toFixed(1);

export function DynamicsView({ kind, telemetryEngine, telemetryParams, prefix = '' }: { kind: Kind; telemetryEngine?: FxTelemetryEngine; telemetryParams?: Record<string, number>; prefix?: string }) {
  // Parameter updates redraw the threshold/bypass; audio measurements never
  // enter React state. Subscribing to params also follows hosted engine swaps.
  const wtParams = useStore(s => telemetryParams ? null : s.params);
  const params = telemetryParams ?? wtParams!;
  const activeEngine = telemetryEngine ?? engine;
  const canvas = useRef<HTMLCanvasElement>(null);
  const readouts = useRef<HTMLDivElement>(null);
  const settings = useRef({ on: false, threshold: -18 });
  settings.current = { on: params[`${prefix}fx.${kind}.on`] > 0.5 && (kind !== 'ott' || params[`${prefix}fx.ott.depth`] > 0), threshold: params[`${prefix}fx.comp.thr`] };
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let data = idleDynamics(), stamp = 0, frame = 0;
    const history: DynamicsMessage['comp'][] = [];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      frame = 0;
      const { ctx: c, w, h } = setupCanvas(el);
      const on = settings.current.on;
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
      if (kind === 'ott') {
        const top = 28, bottom = h - 24, middle = (top + bottom) / 2;
        const col = (w - 20) / 3;
        ['LOW', 'MID', 'HIGH'].forEach((name, i) => {
          const x = 10 + i * col, center = x + col / 2;
          text(name, center, 14, ink, 'center');
          if (i) line(x, 8, x, h - 8, slate, 0.12);
          // Detector level, -60 to 0 dBFS. The wider bipolar lane shows the
          // actual wet-band gain, before automatic compensation and depth.
          const bx = x + col * 0.18, bw = Math.max(6, col * 0.12);
          c.fillStyle = slate; c.globalAlpha = 0.08; c.fillRect(bx, top, bw, bottom - top); c.globalAlpha = 1;
          const v = on ? clamp((data.ott.levels[i] + 60) / 60, 0, 1) : 0;
          const grad = c.createLinearGradient(0, top, 0, bottom);
          grad.addColorStop(0, ink); grad.addColorStop(1, slate);
          c.fillStyle = grad; c.globalAlpha = on ? 0.8 : 0.2;
          c.fillRect(bx, bottom - v * (bottom - top), bw, v * (bottom - top)); c.globalAlpha = 1;
          const gx = x + col * 0.44, gw = col * 0.35, half = (bottom - top) / 2;
          line(gx, top, gx + gw, top, slate, 0.1); line(gx, bottom, gx + gw, bottom, slate, 0.1);
          line(gx - 3, middle, gx + gw + 3, middle, slate, 0.4);
          const gain = on ? data.ott.gains[i] : 0, delta = clamp(gain / 24, -1, 1) * half;
          c.fillStyle = slate; c.globalAlpha = 0.25;
          c.fillRect(gx, Math.min(middle, middle - delta), gw, Math.abs(delta)); c.globalAlpha = 1;
          if (Math.abs(gain) > 0.05) line(gx, middle - delta, gx + gw, middle - delta, ink);
          text(`${signed(gain)} dB`, center, h - 8, on ? ink : slate, 'center');
        });
      } else {
        const left = 29, right = w - 12, top = 16, bottom = h - 43;
        const Y = (db: number) => top + (1 - clamp((db + 60) / 60, 0, 1)) * (bottom - top);
        for (const db of [0, -24, -48]) {
          text(`${db}`, left - 6, Y(db) + 3, slate, 'right');
          line(left, Y(db), right, Y(db), slate, 0.1);
        }
        const threshold = settings.current.threshold;
        c.setLineDash([3, 4]); line(left, Y(threshold), right, Y(threshold), slate, on ? 0.6 : 0.2); c.setLineDash([]);
        text('THR', right, Y(threshold) - 4, slate, 'right');
        const samples = motion.matches ? Array(90).fill(data.comp) as DynamicsMessage['comp'][] : history;
        const trace = (key: 'input' | 'output', color: string, opacity: number) => {
          c.strokeStyle = color; c.globalAlpha = opacity; c.lineWidth = key === 'output' ? 1.5 : 1;
          c.beginPath();
          samples.forEach((m, i) => {
            const x = left + (90 - samples.length + i) / 89 * (right - left), y = Y(m[key]);
            if (i) c.lineTo(x, y); else c.moveTo(x, y);
          });
          c.stroke(); c.globalAlpha = 1; c.lineWidth = 1;
        };
        trace('input', slate, 0.5); trace('output', ink, 1);
        const grTop = h - 29, grBottom = h - 9;
        text('GR', left - 6, grTop + 9, slate, 'right');
        line(left, grTop, right, grTop, slate, 0.22);
        c.beginPath(); c.moveTo(left, grTop);
        samples.forEach((m, i) => {
          const x = left + (90 - samples.length + i) / 89 * (right - left);
          c.lineTo(x, grTop + clamp(on ? m.reduction / 24 : 0, 0, 1) * (grBottom - grTop));
        });
        c.lineTo(right, grTop); c.closePath(); c.fillStyle = slate; c.globalAlpha = 0.4; c.fill(); c.globalAlpha = 1;
      }
      const meter = data[kind];
      const readings = [level(meter.input), level(meter.output), signed(on ? meter.makeup : 0)];
      if (kind === 'comp') readings.push((on ? data.comp.reduction : 0).toFixed(1));
      readouts.current?.querySelectorAll('output').forEach((output, i) => { output.textContent = `${readings[i]} dB`; });
      el.setAttribute('aria-label', kind === 'ott'
        ? `OTT ${on ? 'active' : 'bypassed'}. Low, mid, high wet gain: ${data.ott.gains.map(g => signed(on ? g : 0)).join(', ')} dB.`
        : `Compressor ${on ? 'active' : 'bypassed'}. Input ${readings[0]}, output ${readings[1]} dBFS. Gain reduction ${readings[3]} dB.`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    redraw.current = schedule;
    const unsubscribe = activeEngine.subscribeDynamics(message => {
      data = message; stamp = performance.now();
      history.push(message.comp); if (history.length > 90) history.shift();
      schedule();
    });
    const resize = new ResizeObserver(schedule); resize.observe(el);
    const stale = window.setInterval(() => {
      if (stamp && performance.now() - stamp > 350) {
        stamp = 0; data = idleDynamics(); history.length = 0; schedule();
      }
    }, 200);
    motion.addEventListener('change', schedule);
    schedule();
    return () => {
      unsubscribe(); resize.disconnect(); clearInterval(stale); cancelAnimationFrame(frame);
      motion.removeEventListener('change', schedule); redraw.current = () => {};
    };
  }, [kind, activeEngine, prefix]);
  useEffect(() => { redraw.current(); }, [params]);

  return <>
    <canvas ref={canvas} className="dynamics-curve" role="img" aria-label={`${kind.toUpperCase()} audio activity`} />
    <div className="dynamics-readouts" ref={readouts}>
      <div><span>IN</span><output>−∞ dB</output></div>
      <div><span>OUT</span><output>−∞ dB</output></div>
      <div title="Measured automatic level compensation"><span>AUTO</span><output>0.0 dB</output></div>
      {kind === 'comp' && <div title="Gain reduction before automatic compensation"><span>GR</span><output>0.0 dB</output></div>}
    </div>
  </>;
}
