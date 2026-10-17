import { useEffect, useRef } from 'react';
import { setupCanvas } from '../../components/displays/canvas';
import { pad } from '../params';
import { drumEngine, useDrumStore } from '../store';
import { DrumKnob } from './DrumKnob';
import { DrumStepper } from './DrumStepper';
import { PosSlider } from './PosSlider';

function SampleView({ sampleIndex, playhead }: { sampleIndex: number; playhead: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sample = drumEngine.samples[sampleIndex];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 161, 77, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      if (sample) {
        ctx.strokeStyle = '#ffa14d';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(sample.data.length / Math.max(1, w)));
        for (let x = 0; x < w; x++) {
          let peak = 0;
          const at = Math.floor((x / w) * sample.data.length);
          for (let i = at; i < Math.min(sample.data.length, at + step); i++)
            peak = Math.max(peak, Math.abs(sample.data[i]));
          const y = peak * h * 0.45;
          ctx.moveTo(x, h / 2 - y); ctx.lineTo(x, h / 2 + y);
        }
        ctx.stroke();
      }
      if (playhead >= 0) {
        ctx.strokeStyle = '#fff3e8';
        ctx.beginPath();
        ctx.moveTo(playhead * w, 3); ctx.lineTo(playhead * w, h - 3); ctx.stroke();
      }
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [sample, playhead]);

  return <canvas ref={ref} className="dr-wavetable-view dr-sample-view" />;
}

export function SampleSection() {
  const sel = useDrumStore((s) => s.sel);
  const sampleId = pad(sel, 'oscB.table');
  const sampleIndex = useDrumStore((s) => s.params[sampleId]) | 0;
  const playhead = useDrumStore((s) => s.modPosB);

  return (
    <section className="panel dr-osc-section" data-accent="b">
      <div className="panel-head">
        <span className="dr-led dr-led-b" aria-hidden="true" />
        <h2>SAMPLE</h2>
        <div className="dr-osc-stepper"><DrumStepper paramId={sampleId} accent="b" /></div>
      </div>
      <div className="dr-osc-body">
        <SampleView sampleIndex={sampleIndex} playhead={playhead} />
        <PosSlider paramId={pad(sel, 'oscB.pos')} accent="b" />
        <div className="knob-row dr-osc-knobs dr-sample-knobs">
          <DrumKnob paramId={pad(sel, 'oscB.tune')} size="sm" accent="b" />
          <DrumKnob paramId={pad(sel, 'oscB.fine')} size="sm" accent="b" />
          <DrumKnob paramId={pad(sel, 'oscB.detune')} size="sm" accent="b" />
          <DrumKnob paramId={pad(sel, 'oscB.phase')} size="sm" accent="b" />
          <DrumKnob paramId={pad(sel, 'oscB.level')} size="md" accent="b" />
        </div>
      </div>
    </section>
  );
}
