import { useEffect, useRef } from 'react';
import { setupCanvas } from '../../components/displays/canvas';

interface NoiseViewProps {
  color: number;
}

function seededRandom(seed: number) {
  let state = seed | 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export function NoiseView({ color }: NoiseViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  colorRef.current = color;
  // Ref so the reduced-motion effect (keyed on `color`) can trigger a
  // single static repaint without duplicating the draw routine.
  const drawRef = useRef<(time: number) => void>(() => undefined);

  useEffect(() => {
    const draw = (time: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const { ctx, w, h } = setupCanvas(canvas);
        const random = seededRandom(Math.floor(time / 66));
        const normalizedColor = Math.min(1, Math.max(0, (colorRef.current + 1) / 2));
        const smoothing = 0.15 + normalizedColor * 0.7;
        const points = 90;
        const padX = 7;
        let y = 0;

        ctx.clearRect(0, 0, w, h);
        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          y += (random() * 2 - 1 - y) * smoothing;
          const x = padX + (i / (points - 1)) * (w - padX * 2);
          const py = h * 0.5 + y * h * 0.38;
          if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
        }
        ctx.strokeStyle = '#ffa14d';
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#ffa14d';
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    };
    drawRef.current = draw;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;

    const loop = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (media.matches) draw(0);
      else raf = requestAnimationFrame(loop);
    };
    start();

    const onChange = () => {
      cancelAnimationFrame(raf);
      start();
    };
    media.addEventListener('change', onChange);

    return () => {
      cancelAnimationFrame(raf);
      media.removeEventListener('change', onChange);
    };
  }, []);

  // Reduced motion: the loop above only paints once at mount, so redraw the
  // static frame whenever the noise color changes.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) drawRef.current(0);
  }, [color]);

  return <canvas ref={canvasRef} className="dr-noise-view" />;
}
