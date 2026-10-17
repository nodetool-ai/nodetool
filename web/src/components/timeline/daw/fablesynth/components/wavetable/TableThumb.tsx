import { useEffect, useRef } from 'react';
import { setupCanvas } from '../displays/canvas';
import { VIZ_N, type GeneratedTable } from '../../engine/wavetables';

export function TableThumb({ table, accent, selected }: {
  table: GeneratedTable; accent: string; selected: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { ctx, w, h } = setupCanvas(c);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < VIZ_N; i++) {
      const x = (i / (VIZ_N - 1)) * w;
      const y = h / 2 - table.viz[i] * h * 0.38;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = selected ? accent : '#8893a8';
    ctx.lineWidth = 1.3;
    if (selected) { ctx.shadowColor = accent; ctx.shadowBlur = 6; }
    ctx.stroke();
  }, [table, accent, selected]);
  return <canvas ref={ref} className="wte-thumb" width={46} height={28} />;
}
