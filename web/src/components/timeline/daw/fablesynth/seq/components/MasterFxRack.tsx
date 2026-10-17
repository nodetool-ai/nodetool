// SQ-4's post-fader bus uses the same full-control modules as the instruments.
// It has its own session parameter namespace, so opening this rack never edits
// an individual device patch.
import { SC_SOURCES, trackKeyLabels } from '../../engine/sidechain';
import { EqPanel } from '../../components/panels/EqPanel';
import { DynamicsPanel } from '../../components/panels/DynamicsPanel';
import type { FxPanelAdapter, FxTelemetryEngine } from '../../components/panels/fxAdapter';
import { fmtDb, fmtHz, fmtPct, fmtSec } from '../../params';
import { useSeqStore } from '../store';
import { SeqKnob } from './SeqKnob';
import { MixAssistPanel } from './MixAssistPanel';

type Spec = { min: number; max: number; def: number; log?: boolean; fmt: (v: number) => string };
const SPECS: Record<string, Spec> = {
  'eq.low': { min: -15, max: 15, def: 0, fmt: fmtDb }, 'eq.mid': { min: -15, max: 15, def: 0, fmt: fmtDb },
  'eq.mid2': { min: -15, max: 15, def: 0, fmt: fmtDb }, 'eq.high': { min: -15, max: 15, def: 0, fmt: fmtDb },
  'eq.lfreq': { min: 20, max: 20000, def: 120, log: true, fmt: fmtHz }, 'eq.mfreq': { min: 20, max: 20000, def: 900, log: true, fmt: fmtHz },
  'eq.m2freq': { min: 20, max: 20000, def: 2500, log: true, fmt: fmtHz }, 'eq.hfreq': { min: 20, max: 20000, def: 6000, log: true, fmt: fmtHz },
  'eq.lq': { min: .2, max: 12, def: Math.SQRT1_2, log: true, fmt: v => v.toFixed(2) }, 'eq.mq': { min: .2, max: 12, def: .9, log: true, fmt: v => v.toFixed(2) },
  'eq.m2q': { min: .2, max: 12, def: .9, log: true, fmt: v => v.toFixed(2) }, 'eq.hq': { min: .2, max: 12, def: Math.SQRT1_2, log: true, fmt: v => v.toFixed(2) },
  'ott.depth': { min: 0, max: 1, def: .35, fmt: fmtPct }, 'ott.time': { min: .01, max: 10, def: 1, log: true, fmt: fmtSec },
  'ott.up': { min: 0, max: 2, def: 1, fmt: v => `${v.toFixed(2)}×` }, 'ott.down': { min: 0, max: 2, def: 1, fmt: v => `${v.toFixed(2)}×` },
  'comp.thr': { min: -40, max: 0, def: -16, fmt: fmtDb }, 'comp.att': { min: .0001, max: .1, def: .003, log: true, fmt: fmtSec },
  'comp.schp': { min: 20, max: 500, def: 20, log: true, fmt: fmtHz },
  'comp.rel': { min: .01, max: 2, def: .25, log: true, fmt: fmtSec }, 'comp.ratio': { min: 1, max: 20, def: 4, fmt: v => `${v.toFixed(1)}:1` },
  'limiter.ceiling': { min: -12, max: -.1, def: -1, fmt: fmtDb },
};
const toNorm = (v: number, s: Spec) => s.log ? Math.log(v / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min);
const fromNorm = (v: number, s: Spec) => s.log ? s.min * Math.pow(s.max / s.min, v) : s.min + (s.max - s.min) * v;

function MasterKnob({ id, label }: { id: string; label?: string }) {
  const params = useSeqStore(s => s.masterFx), set = useSeqStore(s => s.setMasterFx);
  const key = id.replace('master.fx.', ''), spec = SPECS[key];
  const value = params[id] ?? spec.def;
  return <div className="sq-master-knob" title={`${label ?? key.toUpperCase()} · ${spec.fmt(value)}`}>
    <SeqKnob value={Math.max(0, Math.min(1, toNorm(value, spec)))} onChange={n => set({ [id]: fromNorm(n, spec) })} label={label ?? key.toUpperCase()} size="sm" defaultValue={toNorm(spec.def, spec)} />
    <output>{spec.fmt(value)}</output>
  </div>;
}

function MasterPower({ id }: { id: string }) {
  const on = useSeqStore(s => s.masterFx[id] > .5), set = useSeqStore(s => s.setMasterFx);
  return <button className={`power-btn${on ? ' on' : ''}`} type="button" aria-label={`${id} power`} aria-pressed={on} onClick={() => set({ [id]: on ? 0 : 1 })} />;
}

// The master bus has no device-worklet telemetry channel yet. This explicit
// silent source keeps the full dynamics displays honest rather than borrowing
// activity from whichever instrument happens to be open.
const silentTelemetry: FxTelemetryEngine = {
  subscribeDynamics: () => () => {}, subscribeEcho: () => () => {}, subscribeReverb: () => () => {},
};

function LimiterPanel() {
  const params = useSeqStore(s => s.masterFx), on = params['master.fx.limiter.on'] > .5;
  const ceiling = params['master.fx.limiter.ceiling'];
  const kneeX = 32 + (ceiling + 60) / 60 * 314, kneeY = 108 - (ceiling + 60) / 60 * 96;
  return <section className={`panel sq-limiter-panel${on ? '' : ' dynamics-bypassed'}`} style={{ gridArea: 'limiter' }} aria-label="Master limiter">
    <div className="panel-head"><MasterPower id="master.fx.limiter.on" /><h2>LIMITER</h2><span className="dynamics-caption">{on ? `${fmtDb(ceiling)} CEILING` : 'BYPASS'}</span><span className="dynamics-legend">POST COMP</span></div>
    <svg className="sq-limiter-view" viewBox="0 0 360 126" role="img" aria-label={`Master limiter ${on ? 'active' : 'bypassed'}, ceiling ${fmtDb(ceiling)}`}>
      <g className="sq-limiter-grid"><path d="M32 12V108H346 M32 76H346 M32 44H346" /><text x="24" y="111">−∞</text><text x="24" y="79">−12</text><text x="24" y="47">−6</text><text x="24" y="15">0</text></g>
      <path className="sq-limiter-unity" d="M32 108L346 12" />
      <path className="sq-limiter-curve" d={on ? `M32 108L${kneeX.toFixed(1)} ${kneeY.toFixed(1)} Q346 ${kneeY.toFixed(1)} 346 ${kneeY.toFixed(1)}` : 'M32 108L346 12'} />
      <text x="342" y="120" textAnchor="end">OUTPUT</text><text x="36" y="22">INPUT</text>
    </svg>
    <div className="sq-limiter-readout"><span>SAFETY CEILING</span><output>{fmtDb(ceiling)}</output><span>0 ms LOOKAHEAD</span></div>
    <div className="sq-limiter-controls"><MasterKnob id="master.fx.limiter.ceiling" label="CEILING" /></div>
  </section>;
}

export function MasterFxRack() {
  const params = useSeqStore(s => s.masterFx), setMasterFx = useSeqStore(s => s.setMasterFx);
  const rig = useSeqStore(s => s.rig);
  const tracks = useSeqStore(s => s.session.tracks);
  const adapter: FxPanelAdapter = {
    engine: silentTelemetry, params, setParam: (id, value) => setMasterFx({ [id]: value }), prefix: 'master.',
    analysis: { source: rig?.masterTaps?.input ?? null, preEq: true, reference: 'mix', note: 'POWER ON TO LEARN' },
    // The master EQ shows what leaves the chain, not the pre-FX sum it learns from.
    liveSpectrum: rig?.masterTaps?.output ?? null,
    // No master telemetry: learn from the pre-FX sum (before EQ and OTT).
    compTap: { source: rig?.masterTaps?.input ?? null, style: 'glue', note: 'POWER ON TO LEARN' },
    renderKnob: (id, label) => <MasterKnob id={id} label={id.endsWith('.schp') ? 'KEY HP' : label?.toUpperCase()} />,
    renderPower: (id) => <MasterPower id={id} />,
    sidechain: { sources: SC_SOURCES, hosted: true, labels: trackKeyLabels(tracks) },
  };
  return <section className="sq-master-fx" aria-label="SQ-4 master effects chain">
    <div className="sq-master-fx-title"><span aria-hidden="true" /><h1>MASTER FX</h1><p>POST-FADER · EQ › OTT › COMP › LIMITER</p></div>
    <div className="sq-master-fx-rack">
      <MixAssistPanel />
      <EqPanel adapter={adapter} />
      <DynamicsPanel kind="ott" adapter={adapter} />
      <DynamicsPanel kind="comp" adapter={adapter} />
      <LimiterPanel />
    </div>
  </section>;
}
