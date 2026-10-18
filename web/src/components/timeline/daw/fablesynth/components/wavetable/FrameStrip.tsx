import { useEffect, useRef, useState } from 'react';
import { setupCanvas } from '../displays/canvas';
import { framePoints } from './frames';
import { MAX_FRAMES } from '../../engine/usertables';

function FrameThumb({ frame, accent, on }: { frame: Float32Array; accent: string; on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { ctx, w, h } = setupCanvas(c);
    ctx.clearRect(0, 0, w, h);
    const pts = framePoints(frame, 64);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = (i / (pts.length - 1)) * w;
      const y = h / 2 - pts[i] * h * 0.38;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = on ? accent : '#8893a8';
    ctx.lineWidth = 1.2;
    if (on) { ctx.shadowColor = accent; ctx.shadowBlur = 5; }
    ctx.stroke();
  }, [frame, accent, on]);
  return <canvas ref={ref} className="wte-frame-c" width={40} height={26} />;
}

// Horizontal strip of frame thumbnails: click to select, [+] to duplicate the
// current frame, [✕] on the selected one to delete, drag to reorder.
export function FrameStrip({ frames, current, accent, readOnly, onSelect, onAdd, onDelete, onReorder }: {
  frames: Float32Array[]; current: number; accent: string; readOnly: boolean;
  onSelect: (i: number) => void; onAdd: () => void; onDelete: (i: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const indexAtX = (clientX: number): number => {
    const cells = rowRef.current?.querySelectorAll('.wte-frame');
    if (!cells) return 0;
    for (let i = 0; i < cells.length; i++) {
      const r = (cells[i] as HTMLElement).getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return cells.length - 1;
  };

  return (
    <div className="wte-frames">
      <span className="wte-frames-label">FRAMES</span>
      <div className="wte-frames-row" ref={rowRef}>
        {frames.map((fr, i) => (
          <div
            key={i}
            className={'wte-frame' + (i === current ? ' on' : '') + (drag === i ? ' drag' : '')}
            onPointerDown={(e) => { if (!readOnly) { setDrag(i); (e.target as HTMLElement).setPointerCapture(e.pointerId); } onSelect(i); }}
            onPointerMove={(e) => { if (drag !== null) { const t = indexAtX(e.clientX); if (t !== drag) { onReorder(drag, t); setDrag(t); } } }}
            onPointerUp={() => setDrag(null)}
          >
            <FrameThumb frame={fr} accent={accent} on={i === current} />
            {i === current && !readOnly && frames.length > 1 ? (
              <button className="wte-frame-x" aria-label="delete frame" onPointerDown={(e) => e.stopPropagation()} onClick={() => onDelete(i)}>✕</button>
            ) : null}
          </div>
        ))}
        {!readOnly && frames.length < MAX_FRAMES
          ? <button className="wte-frame-add" aria-label="add frame" onClick={onAdd}>＋</button> : null}
      </div>
      <span className="wte-frames-count">{frames.length}f</span>
    </div>
  );
}
