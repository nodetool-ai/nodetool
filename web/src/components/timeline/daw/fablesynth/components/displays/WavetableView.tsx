// 3D wavetable terrain. Animated via rAF so it can track the live modulated
// frame position streamed back from the DSP thread; redraws are throttled
// unless the shown position moves or the inputs change.

import { useEffect, useRef } from 'react';
import { setupCanvas } from './canvas';
import type { VizTable } from '../../engine/synth';

interface WavetableViewProps {
  table: VizTable | null;
  pos: number; // knob position 0..1
  modPos: number; // live modulated position from DSP (-1 = idle)
  accent: string;
  className?: string;
}

export function WavetableView({ table, pos, modPos, accent, className }: WavetableViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ table, pos, modPos, accent });
  propsRef.current = { table, pos, modPos, accent };
  const stRef = useRef({ dirty: true, lastDrawnMod: -2 });
  const redrawRef = useRef<(() => void) | null>(null);

  // table / pos changes force a redraw. Under reduced motion the rAF loop
  // isn't running, so draw the static frame directly via the shared redraw fn.
  useEffect(() => {
    stRef.current.dirty = true;
    redrawRef.current?.();
  }, [table, pos]);

  useEffect(() => {
    const onResize = () => { stRef.current.dirty = true; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let raf = 0;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const frame = () => {
      const canvas = canvasRef.current;
      if (canvas) draw(canvas);
      raf = requestAnimationFrame(frame);
    };
    const draw = (canvas: HTMLCanvasElement) => {
      const st = stRef.current;
      const { table, pos, modPos, accent } = propsRef.current;
      const show = modPos >= 0 ? modPos : pos;
      if (!st.dirty && Math.abs(show - st.lastDrawnMod) < 0.004) return;
      st.dirty = false;
      st.lastDrawnMod = show;
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      if (!table) return;

      const { frames, viz } = table;
      const N = viz.length / frames;
      const depthX = w * 0.22, depthY = h * 0.42;
      const waveW = w * 0.68, waveAmp = h * 0.17;
      const x0 = w * 0.06, y0 = h * 0.78;

      const posF = show * (frames - 1);

      for (let f = frames - 1; f >= 0; f--) {
        // Single-frame tables would make this 0/0 (NaN coords -> blank view).
        const d = frames > 1 ? f / (frames - 1) : 0;
        const ox = x0 + d * depthX;
        const oy = y0 - d * depthY;
        const near = Math.max(0, 1 - Math.abs(f - posF));
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = ox + (i / (N - 1)) * waveW;
          const y = oy - viz[f * N + i] * waveAmp;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (near > 0.02) {
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.25 + near * 0.75;
          ctx.lineWidth = 1 + near * 1.4;
          ctx.shadowColor = accent;
          ctx.shadowBlur = near * 14;
        } else {
          ctx.strokeStyle = '#8893a8';
          ctx.globalAlpha = 0.16 + d * 0.1;
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };
    redrawRef.current = () => {
      if (!mq.matches) return; // rAF loop already redraws every frame
      const canvas = canvasRef.current;
      if (canvas) draw(canvas);
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const start = () => {
      stop();
      if (mq.matches) {
        stRef.current.dirty = true;
        const canvas = canvasRef.current;
        if (canvas) draw(canvas); // single static frame
      } else {
        raf = requestAnimationFrame(frame);
      }
    };
    start();
    mq.addEventListener('change', start);
    return () => { stop(); mq.removeEventListener('change', start); redrawRef.current = null; };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
