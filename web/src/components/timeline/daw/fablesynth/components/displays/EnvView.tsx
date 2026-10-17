// ADSR envelope view. Redraws only when its parameters or size change.

import { useEffect, useReducer, useRef } from 'react';
import { setupCanvas } from './canvas';

interface EnvViewProps {
  a: number;
  d: number;
  s: number;
  r: number;
  accent: string;
  className?: string;
}

export function EnvView({ a, d, s, r, accent, className }: EnvViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resizeTick, bumpResize] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const onResize = () => bumpResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const pad = 6, W = w - pad * 2, H = h - pad * 2;
    // log-ish time scaling so short segments stay visible
    const seg = (t: number) => Math.pow(t / 12, 0.4);
    const ta = seg(a), td = seg(d), tr = seg(r);
    const hold = 0.22;
    const total = ta + td + tr + hold;
    const X = (t: number) => pad + (t / total) * W;
    const Y = (v: number) => pad + (1 - v) * H;

    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    // x* are pixel coords; y* are normalized 0..1 and mapped through Y() here.
    const curve = (x0: number, y0: number, x1: number, y1: number, bend: number) => {
      ctx.quadraticCurveTo(x0 + (x1 - x0) * bend, Y(y1 + (y0 - y1) * (1 - bend) * 0.2), x1, Y(y1));
    };
    curve(X(0), 0, X(ta), 1, 0.35);
    curve(X(ta), 1, X(ta + td), s, 0.3);
    ctx.lineTo(X(ta + td + hold), Y(s));
    curve(X(ta + td + hold), s, X(total), 0, 0.3);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineTo(X(total), Y(0));
    ctx.lineTo(X(0), Y(0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad, 0, h);
    grad.addColorStop(0, accent + '44');
    grad.addColorStop(1, accent + '00');
    ctx.fillStyle = grad;
    ctx.fill();
  }, [a, d, s, r, accent, resizeTick]);

  return <canvas ref={canvasRef} className={className} />;
}
