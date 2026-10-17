import { useEffect, useReducer, useRef } from 'react';
import { setupCanvas } from '../../components/displays/canvas';

interface DrumEnvViewProps {
  mode: 'pitch' | 'ahd';
  amt?: number;
  att?: number;
  hold?: number;
  dec: number;
  curve?: number;
  accent: string;
  className?: string;
}

export function DrumEnvView({
  mode,
  amt = 0,
  att = 0,
  hold = 0,
  dec,
  curve = 0,
  accent,
  className,
}: DrumEnvViewProps) {
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
    const pad = 6;
    const width = w - pad * 2;

    if (mode === 'pitch') {
      const zeroY = h * 0.72;
      const magnitude = Math.min(1, Math.abs(amt) / 48);
      const availableHeight = amt >= 0 ? zeroY - pad : h - pad - zeroY;
      const yFor = (p: number) => zeroY - Math.sign(amt) * magnitude * availableHeight * Math.exp(-7 * p);

      ctx.beginPath();
      ctx.moveTo(pad, zeroY);
      ctx.lineTo(w - pad, zeroY);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const trace = () => {
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const p = i / 60;
          const x = pad + p * width;
          const y = yFor(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      };

      trace();
      ctx.lineTo(w - pad, zeroY);
      ctx.lineTo(pad, zeroY);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, Math.min(pad, zeroY), 0, Math.max(h - pad, zeroY));
      fill.addColorStop(0, `${accent}40`);
      fill.addColorStop(0.72, `${accent}12`);
      fill.addColorStop(1, `${accent}36`);
      ctx.fillStyle = fill;
      ctx.fill();

      trace();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#6b768c';
      ctx.font = "7px 'IBM Plex Mono', 'SF Mono', Menlo, monospace";
      ctx.textBaseline = 'top';
      ctx.fillText(`${amt > 0 ? '+' : ''}${amt} ST`, pad, 5);
      return;
    }

    const height = h - pad * 2;
    const seg = (time: number) => Math.pow(Math.max(0, time) / 4, 0.4);
    const attackWidth = seg(att);
    const holdWidth = seg(hold);
    const decayWidth = seg(dec);
    const total = Math.max(0.0001, attackWidth + holdWidth + decayWidth);
    const xFor = (time: number) => pad + (time / total) * width;
    const yFor = (value: number) => pad + (1 - value) * height;
    const attackEnd = attackWidth;
    const holdEnd = attackEnd + holdWidth;
    const decayEnd = holdEnd + decayWidth;
    const clampedCurve = Math.min(1, Math.max(0, curve));

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(xFor(0), yFor(0));
      ctx.lineTo(xFor(attackEnd), yFor(1));
      ctx.lineTo(xFor(holdEnd), yFor(1));
      for (let i = 1; i <= 60; i++) {
        const progress = i / 60;
        const linear = 1 - progress;
        const exponential = Math.exp(-4.5 * progress);
        const value = linear + (exponential - linear) * clampedCurve;
        ctx.lineTo(xFor(holdEnd + decayWidth * progress), yFor(i === 60 ? 0 : value));
      }
    };

    trace();
    ctx.lineTo(xFor(decayEnd), yFor(0));
    ctx.lineTo(xFor(0), yFor(0));
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, pad, 0, h - pad);
    fill.addColorStop(0, `${accent}3d`);
    fill.addColorStop(1, `${accent}00`);
    ctx.fillStyle = fill;
    ctx.fill();

    trace();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [mode, amt, att, hold, dec, curve, accent, resizeTick]);

  return <canvas ref={canvasRef} className={className} />;
}
