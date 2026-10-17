// Filter response view. Plots each enabled filter faintly plus the combined
// response for the selected routing. Redraws only when its inputs or size change.

import { useEffect, useReducer, useRef } from 'react';
import { setupCanvas } from './canvas';

export interface FilterDef {
  type: number;
  cutoff: number;
  res: number;
  on: boolean;
}

interface FilterViewProps {
  filters: FilterDef[]; // [filter1, filter2]
  route: number; // 0 serial, 1 parallel, 2 split
  accent: string;
  className?: string;
}

// Mirrors the worklet's VOWEL filter formant data (the standalone worklet can't
// be imported here, so the small tables are duplicated).
const VOWELS = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [390, 1990, 2550],
  [570, 840, 2410],
  [440, 1020, 2240],
];
const F_AMPS = [1, 0.55, 0.32];

// Magnitude response of one filter at frequency f. Analog prototypes are used so
// the curve is sample-rate independent and matches the DSP shapes closely.
function magFor(type: number, cutoff: number, res: number, f: number): number {
  if (type <= 4) {
    const k = 2 - 1.93 * res;
    const wn = f / cutoff;
    const den = Math.sqrt(Math.pow(1 - wn * wn, 2) + Math.pow(k * wn, 2));
    switch (type) {
      case 0: return 1 / den;
      case 1: return 1 / (den * den);
      case 2: return (k * wn) / den;
      case 3: return (wn * wn) / den;
      default: return Math.abs(1 - wn * wn) / den;
    }
  }
  if (type === 5) {
    // resonant feedback comb: peaks at multiples of the tuning frequency
    const fb = res * 0.97;
    const c = Math.cos((2 * Math.PI * f) / cutoff);
    return (1 - fb) / Math.sqrt(1 + fb * fb - 2 * fb * c);
  }
  // VOWEL: sum of three analog bandpass formants morphed by cutoff
  const norm = Math.min(0.999, Math.max(0, Math.log(cutoff / 20) / Math.log(1000)));
  const pos = norm * 4;
  const vi = Math.min(3, pos | 0);
  const fr = pos - vi;
  const q = 2 + res * 22;
  let acc = 0.04;
  for (let j = 0; j < 3; j++) {
    const f0 = VOWELS[vi][j] + (VOWELS[vi + 1][j] - VOWELS[vi][j]) * fr;
    const r = f / f0 - f0 / f;
    acc += F_AMPS[j] / Math.sqrt(1 + q * q * r * r);
  }
  return acc * 0.8;
}

export function FilterView({ filters, route, accent, className }: FilterViewProps) {
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
    const fmin = 20, fmax = 20000;
    const anyOn = filters.some((fl) => fl.on);

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (const f of [100, 1000, 10000]) {
      const x = pad + (Math.log(f / fmin) / Math.log(fmax / fmin)) * (w - pad * 2);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    const toY = (mag: number) => {
      const db = Math.max(-30, Math.min(24, 20 * Math.log10(Math.max(1e-6, mag))));
      return h * 0.45 - (db / 30) * h * 0.42;
    };

    const plot = (fn: (f: number) => number, stroke: string, width: number, glow: number) => {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const f = fmin * Math.pow(fmax / fmin, i / 120);
        const x = pad + (i / 120) * (w - pad * 2);
        const y = toY(fn(f));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.shadowColor = accent;
      ctx.shadowBlur = glow;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // individual responses (faint) for any enabled filter
    for (const fl of filters) {
      if (!fl.on) continue;
      plot((f) => magFor(fl.type, fl.cutoff, fl.res, f), 'rgba(177,140,255,0.28)', 1, 0);
    }

    // combined response per routing: serial multiplies, parallel/split sum
    const combined = (f: number) => {
      const m1 = filters[0].on ? magFor(filters[0].type, filters[0].cutoff, filters[0].res, f) : null;
      const m2 = filters[1].on ? magFor(filters[1].type, filters[1].cutoff, filters[1].res, f) : null;
      if (m1 === null && m2 === null) return 1;
      if (route === 0) return (m1 ?? 1) * (m2 ?? 1);
      return (m1 ?? 0) + (m2 ?? 0);
    };
    plot(combined, anyOn ? accent : '#5a6275', 1.8, anyOn ? 7 : 0);
  }, [filters, route, accent, resizeTick]);

  return <canvas ref={canvasRef} className={className} />;
}
