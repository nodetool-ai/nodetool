// FILTER panel: live response curve (tracks the worklet's swept cutoff while
// the voice is sounding) + type stepper + CUT/RES/DRIVE/ENV/TRACK knobs.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { setupCanvas, startCanvasLoop } from '../../components/displays/canvas';
import { useBassStore } from '../bassStoreContext';
import { BassKnob } from './BassKnob';
import { BassStepper } from './BassStepper';

const FMIN = 20, FMAX = 20000;

function FilterView() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cut = useBassStore((s) => s.params['flt.cut']);
  const res = useBassStore((s) => s.params['flt.res']);
  const type = useBassStore((s) => s.params['flt.type']);
  const vizCut = useBassStore((s) => s.vizCut);
  const stateRef = useRef({ cut, res, type, vizCut });
  stateRef.current = { cut, res, type, vizCut };

  useEffect(() => {
    const draw = (canvas: HTMLCanvasElement) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      const { cut, res, type, vizCut } = stateRef.current;
      const pad = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (const f of [100, 1000, 10000]) {
        const x = pad + (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * (w - pad * 2);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      const cutoff = vizCut > 0 ? vizCut : cut;
      const q = 0.7 + res * 9;
      const t = type | 0;
      const mag = (f: number): number => {
        const wn = f / cutoff;
        const den = Math.sqrt(Math.pow(1 - wn * wn, 2) + Math.pow(wn / q, 2));
        let m: number;
        switch (t) {
          case 2: m = (wn / q) / den; break; // BP
          case 3: m = (wn * wn) / den; break; // HP
          case 4: m = Math.abs(1 - wn * wn) / den; break; // notch
          default: m = 1 / den;
        }
        return t === 1 ? m * m : m; // LP24 = squared slope
      };
      const toY = (m: number): number => {
        const db = Math.max(-30, Math.min(24, 20 * Math.log10(Math.max(1e-6, m))));
        return h * 0.45 - (db / 30) * h * 0.42;
      };
      const plot = (stroke: string, width: number, glow: number) => {
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const f = FMIN * Math.pow(FMAX / FMIN, i / 120);
          const x = pad + (i / 120) * (w - pad * 2);
          const y = toY(mag(f));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.shadowColor = '#b18cff';
        ctx.shadowBlur = glow;
        ctx.stroke();
        ctx.shadowBlur = 0;
      };
      plot('rgba(177,140,255,0.28)', 1, 0);
      plot('#b18cff', 1.8, 7);
      ctx.fillStyle = '#6b768c';
      ctx.font = '7px "IBM Plex Mono", monospace';
      ctx.fillText(t('i18n-next98.filter.responseLabel'), pad + 2, 10);
    };
    return startCanvasLoop(canvasRef, draw);
    // Re-run on param changes so reduced-motion mode still repaints on knob moves.
  }, [cut, res, type, vizCut, t]);

  return <canvas ref={canvasRef} className="bl-display" />;
}

export function FilterSection() {
  const { t } = useTranslation();
  return (
    <section className="panel bl-filter-section" data-accent="f">
      <div className="panel-head">
        <h2>{t('i18n-next98.filter.title')}</h2>
        <div className="bl-filter-stepper">
          <BassStepper paramId="flt.type" accent="f" />
        </div>
      </div>
      <FilterView />
      <div className="knob-row bl-filter-knobs">
        <BassKnob paramId="flt.cut" size="md" accent="f" />
        <BassKnob paramId="flt.res" size="sm" accent="f" />
        <BassKnob paramId="flt.drive" size="sm" accent="f" />
        <BassKnob paramId="flt.env" size="sm" accent="f" />
        <BassKnob paramId="flt.track" size="sm" accent="f" />
      </div>
    </section>
  );
}
