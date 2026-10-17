import { pad } from '../params';
import { useDrumStore } from '../store';
import { DrumEnvView } from './DrumEnvView';
import { DrumKnob } from './DrumKnob';

export function AmpEnvPanel() {
  const sel = useDrumStore((s) => s.sel);
  const attackId = pad(sel, 'aenv.att');
  const holdId = pad(sel, 'aenv.hold');
  const decayId = pad(sel, 'aenv.dec');
  const curveId = pad(sel, 'aenv.curve');
  const attack = useDrumStore((s) => s.params[attackId]);
  const hold = useDrumStore((s) => s.params[holdId]);
  const decay = useDrumStore((s) => s.params[decayId]);
  const curve = useDrumStore((s) => s.params[curveId]);

  return (
    <section className="panel dr-edit-panel dr-amp-env">
      <div className="panel-head">
        <h2>AMP ENV</h2>
        <span className="panel-hint">AHD · ONE-SHOT</span>
      </div>
      <DrumEnvView
        className="dr-env-view"
        mode="ahd"
        att={attack}
        hold={hold}
        dec={decay}
        curve={curve}
        accent="#e8edf7"
      />
      <div className="knob-row dr-env-knobs">
        <DrumKnob paramId={attackId} size="sm" />
        <DrumKnob paramId={holdId} size="sm" />
        <DrumKnob paramId={decayId} size="sm" />
        <DrumKnob paramId={curveId} size="sm" />
      </div>
    </section>
  );
}
