import { WavetableView } from '../../components/displays/WavetableView';
import { bassEngine, useBassStore } from '../store';
import { BassKnob } from './BassKnob';
import { BassPosSlider } from './BassPosSlider';
import { BassStepper } from './BassStepper';

export function OscSection() {
  const tableValue = useBassStore((s) => s.params['osc.table']);
  const pos = useBassStore((s) => s.params['osc.pos']);
  const modPos = useBassStore((s) => s.vizPos);
  const powered = useBassStore((s) => s.powered);
  const table = (powered ? bassEngine.tables : null)?.[tableValue | 0] ?? null;

  return (
    <section className="panel bl-osc-section" data-accent="a">
      <div className="panel-head">
        <h2>OSC</h2>
        <div className="bl-osc-stepper">
          <BassStepper paramId="osc.table" accent="a" />
        </div>
      </div>
      <div className="bl-osc-body">
        <WavetableView
          className="bl-wavetable-view"
          table={table}
          pos={pos}
          modPos={modPos}
          accent="#4dff9e"
        />
        <BassPosSlider paramId="osc.pos" accent="a" />
        <div className="knob-row bl-osc-knobs">
          <BassKnob paramId="osc.tune" size="sm" accent="a" />
          <BassKnob paramId="osc.fine" size="sm" accent="a" />
          <BassKnob paramId="osc.unison" size="sm" accent="a" />
          <BassKnob paramId="osc.detune" size="sm" accent="a" />
          <BassKnob paramId="osc.spread" size="sm" accent="a" />
          <BassKnob paramId="osc.level" size="md" accent="a" />
        </div>
      </div>
    </section>
  );
}

export function SubSection() {
  return (
    <section className="panel bl-sub-section" data-accent="n">
      <div className="panel-head">
        <h2>SUB</h2>
      </div>
      <div className="bl-sub-body">
        <div className="bl-sub-steppers">
          <div className="bl-sub-row">
            <span className="bl-sub-label">SHAPE</span>
            <BassStepper paramId="sub.shape" accent="n" />
          </div>
          <div className="bl-sub-row">
            <span className="bl-sub-label">OCT</span>
            <BassStepper paramId="sub.oct" accent="n" />
          </div>
        </div>
        <div className="bl-sub-knob">
          <BassKnob paramId="sub.level" size="md" accent="n" />
        </div>
      </div>
    </section>
  );
}
