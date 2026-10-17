// ENV panel: one display for both envelopes — filter AD (green) with its
// accent-shortened ghost (dashed orange), amp ADSR (pale) — plus 6 knobs.

import { useEffect, useRef } from 'react';
import { setupCanvas } from '../../components/displays/canvas';
import { useBassStore } from '../store';
import { BassKnob } from './BassKnob';

// Drawing window: envelope segment widths are normalized against this many
// seconds so knob moves read as proportional changes.
const WINDOW_S = 2.5;

function EnvView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fatt = useBassStore((s) => s.params['fenv.att']);
  const fdec = useBassStore((s) => s.params['fenv.dec']);
  const att = useBassStore((s) => s.params['aenv.att']);
  const dec = useBassStore((s) => s.params['aenv.dec']);
  const sus = useBassStore((s) => s.params['aenv.sus']);
  const rel = useBassStore((s) => s.params['aenv.rel']);
  const accAmt = useBassStore((s) => s.params['acc.amt']);
  const propsRef = useRef({ fatt, fdec, att, dec, sus, rel, accAmt });
  propsRef.current = { fatt, fdec, att, dec, sus, rel, accAmt };

  useEffect(() => {
    let raf = 0;
    let lastKey = '';
    const draw = (canvas: HTMLCanvasElement) => {
      const p = propsRef.current;
      const key = JSON.stringify(p) + canvas.clientWidth;
      if (key === lastKey) return;
      lastKey = key;
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      const pad = 6, W = w - 12, H = h - 14;
      const X = (t: number) => pad + Math.min(1, t) * W;
      const Y = (v: number) => pad + (1 - v) * H;
      const nf = (s: number) => Math.min(1, s / WINDOW_S);

      // filter env: linear att, exp decay
      const fA = nf(p.fatt), fD = nf(p.fdec);
      const fplot = (scale: number) => {
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        ctx.lineTo(X(fA), Y(1));
        for (let i = 0; i <= 80; i++) {
          const q = i / 80;
          ctx.lineTo(X(fA + q * fD * 4 * scale), Y(Math.exp(-q * 4.5)));
        }
      };
      fplot(1);
      ctx.strokeStyle = '#4dff9e';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#4dff9e';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // accent-boosted ghost (shorter decay)
      fplot(1 - 0.35 * p.accAmt);
      ctx.strokeStyle = 'rgba(255,161,77,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // amp env: ADSR with a fixed sustain shelf
      const aA = nf(p.att), aD = nf(p.dec) * 2, aR = nf(p.rel) * 2;
      const x1 = Math.min(0.3, aA);
      const x2 = Math.min(0.62, x1 + aD);
      const x3 = 0.78;
      const x4 = Math.min(1, x3 + aR);
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(x1), Y(1));
      ctx.quadraticCurveTo(X(x1 + (x2 - x1) * 0.4), Y(p.sus + (1 - p.sus) * 0.25), X(x2), Y(p.sus));
      ctx.lineTo(X(x3), Y(p.sus));
      ctx.quadraticCurveTo(X(x3 + (x4 - x3) * 0.5), Y(p.sus * 0.15), X(x4), Y(0));
      ctx.strokeStyle = '#e8edf7';
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.font = '600 8px "IBM Plex Mono"';
      ctx.fillStyle = '#4dff9e';
      ctx.fillText('FILTER', pad + 2, 10);
      ctx.fillStyle = 'rgba(255,161,77,0.95)';
      ctx.fillText('ACCENT', pad + 42, 10);
      ctx.fillStyle = '#e8edf7';
      ctx.fillText('AMP', pad + 88, 10);
    };
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const frame = () => {
      const canvas = canvasRef.current;
      if (canvas) draw(canvas);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      stop();
      if (mq.matches) {
        lastKey = '';
        const canvas = canvasRef.current;
        if (canvas) draw(canvas); // single static frame
      } else {
        raf = requestAnimationFrame(frame);
      }
    };
    start();
    const onResize = () => { lastKey = ''; if (mq.matches) start(); };
    window.addEventListener('resize', onResize);
    mq.addEventListener('change', start);
    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', start);
    };
    // Re-run on param changes too, so reduced-motion mode (which stops the
    // rAF loop) still repaints when a knob moves.
  }, [fatt, fdec, att, dec, sus, rel, accAmt]);

  return <canvas ref={canvasRef} className="bl-display" />;
}

export function EnvPanel() {
  return (
    <section className="panel bl-env-section">
      <div className="panel-head">
        <h2>ENV</h2>
        <span className="bl-head-note">FILTER AD · AMP ADSR</span>
      </div>
      <EnvView />
      <div className="knob-row bl-env-knobs">
        <BassKnob paramId="fenv.att" size="sm" accent="a" />
        <BassKnob paramId="fenv.dec" size="sm" accent="a" />
        <BassKnob paramId="aenv.att" size="sm" accent="n" />
        <BassKnob paramId="aenv.dec" size="sm" accent="n" />
        <BassKnob paramId="aenv.sus" size="sm" accent="n" />
        <BassKnob paramId="aenv.rel" size="sm" accent="n" />
      </div>
    </section>
  );
}
