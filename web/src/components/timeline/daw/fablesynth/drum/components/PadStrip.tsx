import { pad } from '../params';
import { useDrumStore } from '../store';
import { DrumKnob } from './DrumKnob';
import { DrumStepper } from './DrumStepper';

export function PadStrip() {
  const sel = useDrumStore((s) => s.sel);

  return (
    <section className="panel dr-padstrip" data-accent="a">
      <div className="panel-head">
        <h2>PAD</h2>
        <div className="padstrip-steppers">
          <DrumStepper paramId={pad(sel, 'choke')} label="CHOKE" />
        </div>
      </div>
      <div className="knob-row padstrip-knobs">
        <DrumKnob paramId={pad(sel, 'lvl')} size="sm" />
        <DrumKnob paramId={pad(sel, 'pan')} size="sm" />
        <DrumKnob paramId={pad(sel, 'v2l')} size="sm" />
        <DrumKnob paramId={pad(sel, 'v2m')} size="sm" />
      </div>
    </section>
  );
}
