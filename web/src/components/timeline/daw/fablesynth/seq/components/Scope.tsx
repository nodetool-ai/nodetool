// Master "SUM" oscilloscope in the top bar: one colored trace per audible
// track, drawn from the real per-track analysers on the shared context.
// Drawn imperatively at rAF rate — the component itself never re-renders.

import { useEffect, useRef } from 'react';
import { isTrackOpen } from '../model';
import { useSeqStore } from '../store';

export function Scope() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let raf = 0;
    let buf: Float32Array<ArrayBuffer> | null = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const draw = () => {
      if (!reduceMotion.matches) raf = requestAnimationFrame(draw);
      const st = useSeqStore.getState();
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== w * 2 || cv.height !== h * 2) { cv.width = w * 2; cv.height = h * 2; }
      const x = cv.getContext('2d');
      if (!x) return;
      x.setTransform(2, 0, 0, 2, 0, 0);
      x.clearRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,255,255,0.07)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(0, h / 2);
      x.lineTo(w, h / 2);
      x.stroke();

      const analysers = st.rig?.trackAnalysers;
      if (!analysers) return;
      analysers.forEach((an, t) => {
        if (!isTrackOpen(t, st.owner, st.trackMute, st.sceneMute, st.solo)) return;
        if (st.owner[t] == null) return;
        if (!buf || buf.length !== an.fftSize) buf = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(buf);
        x.strokeStyle = st.session.tracks[t].color;
        x.globalAlpha = 0.8;
        x.lineWidth = 1.4;
        x.beginPath();
        for (let i = 0; i <= w; i += 2) {
          const v = buf[Math.floor((i / w) * (buf.length - 1))];
          const y = h / 2 + v * h * 0.46;
          if (i === 0) x.moveTo(i, y);
          else x.lineTo(i, y);
        }
        x.stroke();
      });
      x.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    // Reduced motion: draw a single static frame instead of looping, redrawn
    // on relevant state changes and if the OS preference flips live.
    const onMotionChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    reduceMotion.addEventListener('change', onMotionChange);
    const unsubscribe = useSeqStore.subscribe(() => {
      if (reduceMotion.matches) draw();
    });
    return () => {
      cancelAnimationFrame(raf);
      reduceMotion.removeEventListener('change', onMotionChange);
      unsubscribe();
    };
  }, []);

  return (
    <div className="sq-scope">
      <canvas ref={canvasRef} />
      <span className="sq-scope-tag">SUM</span>
    </div>
  );
}
