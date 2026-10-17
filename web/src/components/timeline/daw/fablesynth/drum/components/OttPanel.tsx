import { useDrumStore } from '../store';
import { pad } from '../params';
import { DrumKnob } from './DrumKnob';
import { AutoGainIndicator } from './AutoGainIndicator';

export function OttPanel({ padIndex }: { padIndex: number }) {
  const onId = pad(padIndex, 'fx.ott.on');
  const on = useDrumStore((s) => s.params[onId] === 1);
  const setParam = useDrumStore((s) => s.setParam);
  return (
    <section className={`fx-group dr-ott${on ? ' on' : ''}`} data-accent="n" aria-label="OTT multiband compressor">
      <div className="fx-group-head">
        <button className={`power-btn fx-power${on ? ' on' : ''}`} type="button"
          aria-label="OTT power" aria-pressed={on} onClick={() => setParam(onId, on ? 0 : 1)} />
        <h2>OTT</h2>
        <span className="dr-ott-bands" title="Three bands: below 120 Hz, 120 Hz to 2.5 kHz, above 2.5 kHz">3 BAND</span>
      </div>
      <div className="fx-knobs dr-ott-knobs">
        {['depth', 'time', 'auto', 'up', 'down'].map((field) => (
          field === 'auto' ? <AutoGainIndicator key="auto" /> :
            <DrumKnob key={`${padIndex}-${field}`} paramId={pad(padIndex, `fx.ott.${field}`)} size="sm" accent="n" />
        ))}
      </div>
    </section>
  );
}
