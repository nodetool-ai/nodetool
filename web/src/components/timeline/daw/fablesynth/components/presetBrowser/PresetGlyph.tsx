// Four-cell sound fingerprint: oscillator A frame, filter response, amp
// envelope, and LFO depth. Rows draw it as quiet grey strokes; the selected row
// and the detail strip pass an accent colour.

import { useEffect, useRef } from 'react';
import { setupCanvas } from '../displays/canvas';
import { VIZ_N } from '../../engine/wavetables';
import type { VizTable } from '../../engine/synth';
import type { GlyphData } from '../../presetBrowser';

interface PresetGlyphProps {
  data: GlyphData;
  tables: VizTable[] | null;
  color: string;
  fill?: boolean;
  className?: string;
}

// Response magnitude (linear) of FILTER_TYPES[type] at r = f / cutoff.
function response(type: number, r: number, q: number): number {
  const den = Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2);
  switch (type) {
    case 0: return 1 / den; // LP 12
    case 1: return 1 / (den * Math.max(1, Math.sqrt((1 - r * r) ** 2 + r * r * 2))); // LP 24
    case 3: return (r * r) / den; // HP 12
    case 4: return Math.abs(1 - r * r) / den; // NOTCH
    case 5: return 0.35 + 0.65 * Math.abs(Math.cos(Math.PI * r * 0.5)); // COMB
    default: return (r / q) / den; // BP 12, VOWEL
  }
}

export function PresetGlyph({ data, tables, color, fill = false, className }: PresetGlyphProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const cell = w / 4, pad = fill ? 6 : 3;
    const box = (k: number) => ({ x: k * cell + pad, y: pad, w: cell - 2 * pad, h: h - 2 * pad });
    ctx.lineWidth = fill ? 1.2 : 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    const area = (draw: () => void, baseY: number, x0: number, x1: number) => {
      ctx.beginPath(); draw(); ctx.stroke();
      if (!fill) return;
      ctx.beginPath(); draw(); ctx.lineTo(x1, baseY); ctx.lineTo(x0, baseY); ctx.closePath();
      ctx.globalAlpha = 0.14; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
    };
    if (fill) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let k = 1; k < 4; k++) ctx.fillRect(k * cell, pad, 1, h - 2 * pad);
    }

    // wave: two cycles of the oscillator A frame at its position
    const t = tables?.[data.table];
    let b = box(0);
    if (t) {
      const fr = Math.round(Math.min(1, Math.max(0, data.pos)) * (t.frames - 1));
      const off = fr * VIZ_N;
      ctx.beginPath();
      for (let i = 0; i <= 2 * VIZ_N; i += 2) {
        const v = t.viz[off + (i % VIZ_N)];
        const x = b.x + (i / (2 * VIZ_N)) * b.w, y = b.y + b.h / 2 - v * b.h * 0.45;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    // filter: magnitude on a 20 Hz–20 kHz log axis, -36..+18 dB
    b = box(1);
    const bf = b;
    if (data.filterType < 0) {
      ctx.beginPath(); ctx.moveTo(bf.x, bf.y + bf.h * 0.33); ctx.lineTo(bf.x + bf.w, bf.y + bf.h * 0.33); ctx.stroke();
    } else {
      const q = 0.7 + data.res * 8;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 48; i++) {
        const x = i / 48, f = 20 * Math.pow(1000, x);
        const db = 20 * Math.log10(Math.max(1e-4, response(data.filterType, f / data.cutoff, q)));
        const y = Math.min(1, Math.max(0, (db + 36) / 54));
        pts.push([bf.x + x * bf.w, bf.y + bf.h - y * bf.h]);
      }
      area(() => pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))), bf.y + bf.h, bf.x, bf.x + bf.w);
    }

    // amp envelope, with the same log-ish time scale as EnvView
    b = box(2);
    const be = b;
    const seg = (s: number) => Math.pow(s / 12, 0.4);
    const [a, d, s, r] = data.env;
    const ta = seg(a), td = seg(d), tr = seg(r), hold = 0.22, total = ta + td + tr + hold;
    const X = (v: number) => be.x + (v / total) * be.w, Y = (v: number) => be.y + (1 - v) * be.h;
    area(() => {
      ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(ta), Y(1)); ctx.lineTo(X(ta + td), Y(s));
      ctx.lineTo(X(ta + td + hold), Y(s)); ctx.lineTo(X(total), Y(0));
    }, be.y + be.h, X(0), X(total));

    // LFO depth: an arc around a faint ring
    b = box(3);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rad = Math.min(b.w, b.h) * 0.42;
    ctx.save(); ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    if (data.lfoDepth > 0) {
      const end = -Math.PI / 2 + data.lfoDepth * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, rad, -Math.PI / 2, end); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(cx + Math.cos(end) * rad, cy + Math.sin(end) * rad, fill ? 2.5 : 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }, [data, tables, color, fill]);

  return <canvas ref={ref} className={className} />;
}
