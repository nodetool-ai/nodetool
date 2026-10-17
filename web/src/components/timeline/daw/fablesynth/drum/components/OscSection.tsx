import { WavetableView } from '../../components/displays/WavetableView';
import { pad } from '../params';
import { drumEngine, useDrumStore } from '../store';
import { DrumKnob } from './DrumKnob';
import { DrumStepper } from './DrumStepper';
import { PosSlider } from './PosSlider';

interface OscSectionProps {
  osc: 'oscA' | 'oscB';
}

export function OscSection({ osc }: OscSectionProps) {
  const sel = useDrumStore((s) => s.sel);
  const tableId = pad(sel, `${osc}.table`);
  const posId = pad(sel, `${osc}.pos`);
  const tableValue = useDrumStore((s) => s.params[tableId]);
  const pos = useDrumStore((s) => s.params[posId]);
  const modPos = useDrumStore((s) => osc === 'oscA' ? s.modPosA : s.modPosB);
  const powered = useDrumStore((s) => s.powered);
  const accentKey = osc === 'oscA' ? 'a' : 'b';
  const accent = osc === 'oscA' ? '#4de8ff' : '#ffa14d';
  const table = (powered ? drumEngine.tables : null)?.[tableValue | 0] ?? null;

  return (
    <section className="panel dr-osc-section" data-accent={accentKey}>
      <div className="panel-head">
        <span className={`dr-led dr-led-${accentKey}`} aria-hidden="true" />
        <h2>OSC {osc === 'oscA' ? 'A' : 'B'}</h2>
        <div className="dr-osc-stepper">
          <DrumStepper paramId={tableId} accent={accentKey} />
        </div>
      </div>
      <div className="dr-osc-body">
        <WavetableView
          className="dr-wavetable-view"
          table={table}
          pos={pos}
          modPos={modPos}
          accent={accent}
        />
        <PosSlider paramId={posId} accent={accentKey} />
        <div className="knob-row dr-osc-knobs">
          <DrumKnob paramId={pad(sel, `${osc}.tune`)} size="sm" accent={accentKey} />
          <DrumKnob paramId={pad(sel, `${osc}.fine`)} size="sm" accent={accentKey} />
          <DrumKnob paramId={pad(sel, `${osc}.phase`)} size="sm" accent={accentKey} />
          <DrumKnob paramId={pad(sel, `${osc}.unison`)} size="sm" accent={accentKey} />
          <DrumKnob paramId={pad(sel, `${osc}.detune`)} size="sm" accent={accentKey} />
          <DrumKnob paramId={pad(sel, `${osc}.level`)} size="md" accent={accentKey} />
        </div>
      </div>
    </section>
  );
}
