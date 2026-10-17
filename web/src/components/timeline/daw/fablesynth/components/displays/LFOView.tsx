// LFO shape view. Always animates a free-running phase dot.

import { useEffect, useRef } from 'react';
import { setupCanvas } from './canvas';
import { LfoClock } from '../../engine/lfoClock';

type LfoFn = (p: number) => number;
const LFO_FNS: (LfoFn | null)[] = [
  (p) => Math.sin(2 * Math.PI * p),
  (p) => 1 - 4 * Math.abs(p - 0.5),
  (p) => 1 - 2 * p,
  (p) => (p < 0.5 ? 1 : -1),
  null, // s&h drawn as steps
];

interface LFOViewProps {
  shape: number;
  rate: number;
  accent: string;
  className?: string;
}

export function LFOView({ shape, rate, accent, className }: LFOViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redraw = useRef<(() => void) | null>(null);
  const propsRef = useRef({ shape, rate, accent });
  propsRef.current = { shape: shape | 0, rate, accent };
  const clock = useRef(new LfoClock());
  const t0Ref = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const draw = (canvas: HTMLCanvasElement) => {
      const { shape, rate, accent } = propsRef.current;
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      const pad = 5, W = w - pad * 2, mid = h / 2, amp = h / 2 - pad;
      ctx.beginPath();
      if (shape === 4) {
        const steps = 8;
        for (let s = 0; s < steps; s++) {
          const v = Math.sin(s * 78.233 + 12.9898) * 43758.5453;
          const y = mid - (v - Math.floor(v) - 0.5) * 2 * amp * 0.9;
          const x0 = pad + (s / steps) * W, x1 = pad + ((s + 1) / steps) * W;
          if (s === 0) ctx.moveTo(x0, y); else ctx.lineTo(x0, y);
          ctx.lineTo(x1, y);
        }
      } else {
        const fn = LFO_FNS[shape] || LFO_FNS[0]!;
        for (let i = 0; i <= 96; i++) {
          const p = i / 96;
          const x = pad + p * W, y = mid - fn(p) * amp * 0.9;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // phase dot (cosmetic free-run)
      const phase = clock.current.phase((performance.now() - t0Ref.current) / 1000, rate);
      let y;
      if (shape === 4) {
        const s = Math.floor(phase * 8);
        const v = Math.sin(s * 78.233 + 12.9898) * 43758.5453;
        y = mid - (v - Math.floor(v) - 0.5) * 2 * amp * 0.9;
      } else {
        y = mid - (LFO_FNS[shape] || LFO_FNS[0]!)(phase) * amp * 0.9;
      }
      ctx.beginPath();
      ctx.arc(pad + phase * W, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = accent;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    const frame = () => {
      const canvas = canvasRef.current;
      if (canvas) draw(canvas);
      raf = requestAnimationFrame(frame);
    };
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const start = () => {
      stop();
      if (mq.matches) {
        // Static frame: freeze the phase clock so the dot doesn't drift, then
        // draw once instead of running the free-run loop.
        const canvas = canvasRef.current;
        if (canvas) draw(canvas);
      } else {
        raf = requestAnimationFrame(frame);
      }
    };
    redraw.current = () => { const canvas = canvasRef.current; if (canvas) draw(canvas); };
    start();
    mq.addEventListener('change', start);
    return () => { stop(); redraw.current = null; mq.removeEventListener('change', start); };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) redraw.current?.();
  }, [shape, rate, accent]);

  return <canvas ref={canvasRef} className={className} />;
}
