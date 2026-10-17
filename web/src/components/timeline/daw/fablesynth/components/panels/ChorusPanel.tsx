import { useStore } from '../../store';
import { Knob } from '../Knob';
import { PowerButton } from '../PowerButton';
import type { FxPanelAdapter } from './fxAdapter';
import { fxId } from './fxAdapter';
import './chorus.css';

// Parameter preview, not an audio meter. These are the two delay trajectories
// used by WT-1, BL-1 and DR-1, shown from phase zero over a fixed two seconds.
export function chorusDelayMs(time: number, rate: number, depth: number): [number, number] {
  const modulation = (0.8 + depth * 4.5) * Math.sin(2 * Math.PI * rate * time);
  return [12 + modulation, 17 - modulation * 0.8];
}

export function ChorusPanel({ adapter, compact = false }: { adapter?: FxPanelAdapter; compact?: boolean } = {}) {
  const wtParams = useStore(s => adapter ? null : s.params);
  const params = adapter?.params ?? wtParams!;
  const id = (key: string) => fxId(adapter?.prefix, `fx.chorus.${key}`);
  const on = params[id('on')] > 0.5;
  const rate = params[id('rate')] ?? 0.6, depth = params[id('depth')] ?? 0.5;
  const mix = params[id('mix')] ?? 0.3, excursion = 0.8 + depth * 4.5;
  const knob = adapter?.renderKnob ?? ((key: string) => <Knob paramId={key} size="sm" accent="n" />);
  const power = adapter?.renderPower ?? ((key: string) => <PowerButton paramId={key} />);
  const y = (delay: number) => 112 - (delay - 5) * 4;
  const paths = [0, 1].map(channel => Array.from({ length: 513 }, (_, i) => {
    const delay = chorusDelayMs(i / 256, rate, depth)[channel];
    return `${i ? 'L' : 'M'}${(28 + i / 512 * 198).toFixed(2)},${y(delay).toFixed(2)}`;
  }).join(' '));

  return <section className={`${compact ? 'fx-module' : 'panel'} panel-chorus${on ? '' : ' chorus-bypassed'}`} style={compact ? undefined : { gridArea: 'chorus' }} aria-label="Chorus">
    <div className="panel-head">{power(id('on'))}<h2>CHORUS</h2><span className="chorus-state">{on ? (mix > 0 ? 'STEREO' : 'DRY') : 'BYPASS'}</span></div>
    <svg className="chorus-view" viewBox="0 0 240 144" role="img" aria-label={`Chorus ${on ? 'active' : 'bypassed'}. Modulation preview over two seconds, not a live meter. Rate ${rate.toFixed(2)} Hz. Left delay 12 plus or minus ${excursion.toFixed(2)} milliseconds; right delay 17 plus or minus ${(excursion * 0.8).toFixed(2)} milliseconds. Mix ${Math.round(mix * 100)} percent.`}>
      <g className="chorus-label"><text x="12" y="15">MODULATION</text><text x="226" y="15" textAnchor="end">2 s</text></g>
      <g className="chorus-grid">
        {[5, 15, 25].map(delay => <path key={delay} d={`M28 ${y(delay)}H226`} />)}
        {[28, 77.5, 127, 176.5, 226].map(x => <path key={x} d={`M${x} 32V112`} />)}
      </g>
      <g className="chorus-label chorus-axis"><text x="21" y="35">25</text><text x="21" y="75">15</text><text x="21" y="115">5</text></g>
      <g className="chorus-centers"><path d={`M28 ${y(12)}H226 M28 ${y(17)}H226`} /></g>
      <g className="chorus-traces" opacity={on ? 0.3 + mix * 0.7 : 0.24}>
        <path className="chorus-left" d={paths[0]} />
        <path className="chorus-right" d={paths[1]} />
      </g>
      <g className="chorus-label"><text x="12" y="135">ms</text><path className="chorus-left" d="M51 132H66" /><text x="72" y="135">L</text><path className="chorus-right" d="M100 132H115" /><text x="121" y="135">R</text><text x="226" y="135" textAnchor="end">DELAY</text></g>
    </svg>
    <div className="chorus-readouts" aria-hidden="true">
      <span>L <output>12 ± {excursion.toFixed(1)}</output></span><span>R <output>17 ± {(excursion * 0.8).toFixed(1)}</output></span><span>ms</span>
    </div>
    <div className="chorus-controls">{['rate', 'depth', 'mix'].map(key => <span key={key}>{knob(id(key), key)}</span>)}</div>
  </section>;
}
