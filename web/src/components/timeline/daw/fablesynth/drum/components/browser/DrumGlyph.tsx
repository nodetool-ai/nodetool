// Four-cell DR-1 fingerprints in the visual language of PresetGlyph: thin
// strokes in one colour, an optional fill for the detail strip, no animation.
//   PadGlyph: pitch envelope, amp envelope, filter, tone/sample/noise/ring bars.
//   KitGlyph: kick, snare and hat decays, then the three tom tunings.

import { useEffect, useRef, type DependencyList } from 'react';
import { setupCanvas } from '../../../components/displays/canvas';
import type { AmpEnv, KitGlyphData, PadGlyphData } from '../../drumBrowser';

type Ctx = CanvasRenderingContext2D;
interface Box { x: number; y: number; w: number; h: number }

interface GlyphProps<D> {
  data: D;
  color: string;
  fill?: boolean;
  className?: string;
}

// Shared canvas setup: four cells, `draw` gets each cell's box.
function useGlyph(deps: DependencyList, color: string, fill: boolean, draw: (ctx: Ctx, box: (k: number) => Box, area: (path: () => void, baseY: number, x0: number, x1: number) => void) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const cell = w / 4, pad = fill ? 6 : 3;
    const box = (k: number): Box => ({ x: k * cell + pad, y: pad, w: cell - 2 * pad, h: h - 2 * pad });
    ctx.lineWidth = fill ? 1.2 : 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    const area = (path: () => void, baseY: number, x0: number, x1: number) => {
      ctx.beginPath(); path(); ctx.stroke();
      if (!fill) return;
      ctx.beginPath(); path(); ctx.lineTo(x1, baseY); ctx.lineTo(x0, baseY); ctx.closePath();
      ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1;
    };
    if (fill) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let k = 1; k < 4; k++) ctx.fillRect(k * cell, pad, 1, h - 2 * pad);
      ctx.fillStyle = color;
    }
    draw(ctx, box, area);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, color, fill]);
  return ref;
}

// Time axis shared by every envelope cell: log-ish, 0..4 s.
const T_MAX = 4;
const timeX = (t: number) => Math.log1p(t / 0.01) / Math.log1p(T_MAX / 0.01);

const ENV_STEPS = 40;

// Amp envelope: attack ramp, hold, then a decay that reaches zero at `dec`.
function ampLevel(e: AmpEnv, t: number): number {
  if (t < e.att) return t / e.att;
  const d = t - e.att - e.hold;
  if (d <= 0) return 1;
  return d >= e.dec ? 0 : Math.pow(1 - d / e.dec, 1 + e.curve * 2);
}

function drawAmp(ctx: Ctx, b: Box, e: AmpEnv, area: (path: () => void, baseY: number, x0: number, x1: number) => void) {
  const end = Math.min(T_MAX, e.att + e.hold + e.dec);
  const pts: [number, number][] = [];
  for (let i = 0; i <= ENV_STEPS; i++) {
    const t = (i / ENV_STEPS) * end;
    pts.push([b.x + timeX(t) * b.w, b.y + (1 - ampLevel(e, t)) * b.h]);
  }
  area(() => pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))), b.y + b.h, b.x, pts[pts.length - 1][0]);
}

// Response magnitude (linear) of DRUM_FILTER_TYPES[type] at r = f / cutoff.
function response(type: number, r: number, q: number): number {
  const den = Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2);
  switch (type) {
    case 0: return 1 / den; // LP 12
    case 1: return 1 / (den * Math.max(1, Math.sqrt((1 - r * r) ** 2 + r * r * 2))); // LP 24
    case 3: return (r * r) / den; // HP 12
    case 4: return Math.abs(1 - r * r) / den; // NOTCH
    default: return (r / q) / den; // BP 12
  }
}

export function PadGlyph({ data, color, fill = false, className }: GlyphProps<PadGlyphData>) {
  const ref = useGlyph([data], color, fill, (ctx, box, area) => {
    // pitch envelope: sweep from the start offset to the pad's own pitch
    let b = box(0);
    const zeroY = b.y + b.h * 0.78;
    const span = b.h * 0.7;
    ctx.save(); ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(b.x, zeroY); ctx.lineTo(b.x + b.w, zeroY); ctx.stroke(); ctx.restore();
    const amtN = Math.sign(data.penvAmt) * Math.sqrt(Math.abs(data.penvAmt) / 48);
    ctx.beginPath();
    const pitchEnd = Math.min(T_MAX / 2, data.penvDec * 5);
    for (let i = 0; i <= ENV_STEPS; i++) {
      const t = (i / ENV_STEPS) * pitchEnd;
      const x = b.x + (Math.log1p(t / 0.01) / Math.log1p(pitchEnd / 0.01)) * b.w;
      const y = zeroY - amtN * Math.exp(-t / data.penvDec) * span;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();

    // amp envelope
    drawAmp(ctx, box(1), data.amp, area);

    // filter: magnitude on a 20 Hz-20 kHz log axis, -36..+18 dB
    b = box(2);
    if (!data.filterOn) {
      ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h * 0.33); ctx.lineTo(b.x + b.w, b.y + b.h * 0.33); ctx.stroke();
    } else {
      const q = 0.7 + data.res * 8;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 48; i++) {
        const x = i / 48, f = 20 * Math.pow(1000, x);
        const db = 20 * Math.log10(Math.max(1e-4, response(data.filterType, f / data.cutoff, q)));
        const y = Math.min(1, Math.max(0, (db + 36) / 54));
        pts.push([b.x + x * b.w, b.y + b.h - y * b.h]);
      }
      area(() => pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))), b.y + b.h, b.x, b.x + b.w);
    }

    // source mix: osc, sample, noise, ring as four bars
    b = box(3);
    const bw = b.w / 7;
    data.mix.forEach((v, i) => {
      const x = b.x + bw * (0.5 + i * 2), hgt = Math.max(1, Math.min(1, v) * b.h);
      ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x, b.y + b.h - hgt); ctx.stroke();
    });
  });
  return <canvas ref={ref} className={className} />;
}

export function KitGlyph({ data, color, fill = false, className }: GlyphProps<KitGlyphData>) {
  const ref = useGlyph([data], color, fill, (ctx, box, area) => {
    data.voices.forEach((e, i) => drawAmp(ctx, box(i), e, area));
    // tom tunings: three vertical ticks, higher = higher pitch (-48..+48 st)
    const b = box(3);
    ctx.save(); ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.stroke(); ctx.restore();
    data.toms.forEach((st, i) => {
      const x = b.x + b.w * (0.2 + i * 0.3), hgt = Math.max(2, ((st + 48) / 96) * b.h);
      ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x, b.y + b.h - hgt); ctx.stroke();
    });
  });
  return <canvas ref={ref} className={className} />;
}
