// Spectrum analyser. Reads the frequency-domain analyser every frame; draws a
// faint idle baseline/grid when unpowered/silent, and respects
// prefers-reduced-motion by rendering a single static frame instead of looping.

import { useEffect, useRef } from 'react';
import { setupCanvas } from './canvas';

interface SpectrumViewProps {
  analyser: AnalyserNode | null;
  accent: string;
}

export function SpectrumView({ analyser, accent }: SpectrumViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const drawIdle = (canvas: HTMLCanvasElement) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      const bars = 48;
      ctx.fillStyle = '#93a0b8';
      ctx.globalAlpha = 0.14;
      for (let b = 0; b < bars; b++) {
        const bw = w / bars;
        ctx.fillRect(b * bw + 0.5, h - 2, bw - 1.5, 2);
      }
      ctx.globalAlpha = 1;
    };

    if (!analyser) {
      const canvas = canvasRef.current;
      if (canvas) drawIdle(canvas);
      return;
    }

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const draw = (canvas: HTMLCanvasElement) => {
      const { ctx, w, h } = setupCanvas(canvas);
      analyser.getByteFrequencyData(buf);
      ctx.clearRect(0, 0, w, h);
      const bars = 48;
      const sr = analyser.context.sampleRate;
      const fmin = 30, fmax = Math.min(18000, sr / 2);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, accent + '55');
      grad.addColorStop(1, accent);
      ctx.fillStyle = grad;
      for (let b = 0; b < bars; b++) {
        const f0 = fmin * Math.pow(fmax / fmin, b / bars);
        const f1 = fmin * Math.pow(fmax / fmin, (b + 1) / bars);
        const i0 = Math.floor((f0 / (sr / 2)) * buf.length);
        const i1 = Math.max(i0 + 1, Math.floor((f1 / (sr / 2)) * buf.length));
        let m = 0;
        for (let i = i0; i < i1 && i < buf.length; i++) m = Math.max(m, buf[i]);
        const v = m / 255;
        const bh = Math.pow(v, 1.4) * (h - 2);
        const bw = w / bars;
        ctx.fillRect(b * bw + 0.5, h - bh, bw - 1.5, bh);
      }
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
