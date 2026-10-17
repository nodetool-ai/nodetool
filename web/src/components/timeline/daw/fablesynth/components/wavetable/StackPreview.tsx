import { useEffect, useRef } from 'react';
import { setupCanvas } from '../displays/canvas';
import { framePoints } from './frames';

// Perspective "waterfall" of the frame list; the current frame is drawn bright
// in the accent, the rest receding and dim. Static (not POS-animated) — it just
// reflects the frames as they are edited / added / reordered.
export function StackPreview({ frames, current, accent }: {
  frames: Float32Array[]; current: number; accent: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { ctx, w, h } = setupCanvas(c);
    ctx.clearRect(0, 0, w, h);
    const nf = frames.length;
    if (!nf) return;
    const PTS = 160;
    const depthX = w * 0.20, depthY = h * 0.40;
    const waveW = w * 0.70, amp = h * 0.16;
    const x0 = w * 0.07, y0 = h * 0.78;
    const maxDraw = Math.min(nf, 48);
    for (let k = maxDraw - 1; k >= 0; k--) { // back-to-front
      const f = nf === 1 ? 0 : Math.round((k / (maxDraw - 1)) * (nf - 1));
      const d = maxDraw === 1 ? 1 : k / (maxDraw - 1);
      const pts = framePoints(frames[f], PTS);
      const ox = x0 + d * depthX, oy = y0 - d * depthY;
      ctx.beginPath();
      for (let i = 0; i < PTS; i++) {
        const x = ox + (i / (PTS - 1)) * waveW;
        const y = oy - pts[i] * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (f === current) {
        ctx.strokeStyle = accent; ctx.globalAlpha = 1; ctx.lineWidth = 1.8;
        ctx.shadowColor = accent; ctx.shadowBlur = 10;
      } else {
        ctx.strokeStyle = '#5b6a86'; ctx.globalAlpha = 0.18 + d * 0.5; ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
      }
      ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }, [frames, current, accent]);
  return <canvas ref={ref} className="wte-stack" />;
}
