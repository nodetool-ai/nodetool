// Oscilloscope. Reads the time-domain analyser every frame; draws a faint
// idle trace when unpowered/silent, and respects prefers-reduced-motion by
// rendering a single static frame instead of looping.

import { useEffect, useRef } from 'react';
import { setupCanvas } from './canvas';

interface ScopeViewProps {
  analyser: AnalyserNode | null;
  accent: string;
}

export function ScopeView({ analyser, accent }: ScopeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const drawIdle = (canvas: HTMLCanvasElement) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.strokeStyle = '#93a0b8';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.22;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    if (!analyser) {
      const canvas = canvasRef.current;
      if (canvas) drawIdle(canvas);
      return;
    }

    const buf = new Float32Array(analyser.fftSize);
    const draw = (canvas: HTMLCanvasElement) => {
      const { ctx, w, h } = setupCanvas(canvas);
      analyser.getFloatTimeDomainData(buf);
      ctx.clearRect(0, 0, w, h);
      // stable trigger: find rising zero-crossing in first half
      let start = 0;
      for (let i = 1; i < buf.length / 2; i++) {
        if (buf[i - 1] <= 0 && buf[i] > 0) { start = i; break; }
      }
      const N = Math.min(900, buf.length - start);
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * w;
        const y = h / 2 - buf[start + i] * h * 0.46;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.95;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const frame = () => {
      const canvas = canvasRef.current;
      if (canvas) draw(canvas);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      stop();
      if (mq.matches) {
        const canvas = canvasRef.current;
        if (canvas) draw(canvas); // single static frame
      } else {
        raf = requestAnimationFrame(frame);
      }
    };
    start();
    mq.addEventListener('change', start);
    return () => { stop(); mq.removeEventListener('change', start); };
  }, [analyser, accent]);

  return <canvas ref={canvasRef} />;
}
