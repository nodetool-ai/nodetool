import { useState } from 'react';
import { Knob } from '../Knob';
import { AutoCompStrip } from './AutoCompStrip';
import { PowerButton } from '../PowerButton';
import { DynamicsView } from '../displays/DynamicsView';
import { engine as wtEngine, useStore } from '../../store';
import type { FxPanelAdapter, SideChainInfo } from './fxAdapter';
import { SC_SOURCES, isExternalSource, trackKeyLabels } from '../../engine/sidechain';
import { useSeqStore } from '../../seq/store';
import { fxId } from './fxAdapter';
import './dynamics.css';

export function DynamicsPanel({ kind, adapter }: { kind: 'ott' | 'comp'; adapter?: FxPanelAdapter }) {
  const wtParams = useStore(s => adapter ? null : s.params);
  const wtSetParam = useStore(s => s.setParam);
  const wtHosted = useStore(s => s.hosted);
  const seqTracks = useSeqStore(s => s.session.tracks);
  const [autoOpen, setAutoOpen] = useState(false);
  const params = adapter?.params ?? wtParams!;
  const prefix = adapter?.prefix ?? '', on = params[fxId(prefix, `fx.${kind}.on`)] > 0.5;
  const power = adapter?.renderPower ?? ((id: string) => <PowerButton paramId={id} />);
  const knob = adapter?.renderKnob ?? ((id: string) => <Knob paramId={id} size="sm" accent="n" />);
  return <section className={`panel panel-dynamics${on ? '' : ' dynamics-bypassed'}`} style={{ gridArea: kind }} aria-label={kind === 'ott' ? 'OTT multiband dynamics' : 'Compressor'}>
    <div className="panel-head">
      {power(fxId(prefix, `fx.${kind}.on`))}
      <h2>{kind === 'ott' ? 'OTT' : 'COMP'}</h2>
      <span className="dynamics-caption">{on ? kind === 'ott' ? '3 BAND' : `${(params[fxId(prefix, 'fx.comp.ratio')] ?? 4).toFixed(1)}:1 · SOFT KNEE` : 'BYPASS'}</span>
      {kind === 'comp' && <button type="button" className={`comp-auto-toggle${autoOpen ? ' on' : ''}`} aria-pressed={autoOpen}
        title="Auto-comp: learn the input level and set the compressor" onClick={() => setAutoOpen(o => !o)}>AUTO</button>}
      <span className="dynamics-legend">{kind === 'ott' ? 'LEVEL / ± GAIN' : <><i /> IN <i className="legend-out" /> OUT</>}</span>
    </div>
    <DynamicsView kind={kind} telemetryEngine={adapter?.engine ?? wtEngine} telemetryParams={params} prefix={prefix} />
    {kind === 'comp' && autoOpen ? <AutoCompStrip key={`${prefix}${adapter?.compTap?.style ?? ''}`} engine={adapter?.engine ?? wtEngine} tap={adapter ? adapter.compTap : { source: null, style: 'level' }}
      id={k => fxId(prefix, `fx.comp.${k}`)} params={params} setParam={adapter?.setParam ?? wtSetParam} /> : <>
    <div className="dynamics-controls">
      {(kind === 'ott' ? ['depth', 'time', 'up', 'down'] : ['thr', 'att', 'rel', 'ratio']).map(k => <span key={k}>{knob(fxId(prefix, `fx.${kind}.${k}`), k)}</span>)}
    </div>
    {kind === 'comp' && <SideChainRow prefix={prefix} params={params} setParam={adapter?.setParam ?? wtSetParam} knob={knob}
      sc={adapter?.sidechain ?? { sources: SC_SOURCES, hosted: wtHosted, labels: wtHosted ? trackKeyLabels(seqTracks) : undefined }} />}
    {kind === 'comp' && <div className="dynamics-footnote">{params[fxId(prefix, 'fx.comp.sc')] > 0.5 ? 'KEYED · NO AUTO GAIN · GR FROM KEY' : 'AUTO GAIN · GR BEFORE AUTO · ~3 s HISTORY'}</div>}
    {kind === 'ott' && <div className="dynamics-footnote">120 Hz / 2.5 kHz · WET GAIN BEFORE AUTO · ±24 dB VIEW</div>}
    </>}
  </section>;
}

// Side-chain: pick the key source; the key high-pass appears once keyed.
// Track keys need the SQ-4 key bus, so standalone devices list them disabled.
function SideChainRow({ prefix, params, setParam, knob, sc }: {
  prefix: string; params: Record<string, number>; setParam: (id: string, v: number) => void;
  knob: (id: string, key?: string) => React.ReactNode; sc: SideChainInfo;
}) {
  const id = fxId(prefix, 'fx.comp.sc'), value = Math.round(params[id] ?? 0);
  const offline = value > 0 && !sc.hosted && isExternalSource(sc.sources, value);
  return <div className={`comp-sc${value > 0 ? ' on' : ''}`}>
    <label>
      <span>SIDECHAIN</span>
      <select aria-label="Compressor side-chain source" value={value} onChange={e => setParam(id, Number(e.target.value))}>
        {sc.sources.map((s, i) => <option key={s} value={i} disabled={i !== value && !sc.hosted && isExternalSource(sc.sources, i)}>
          {sc.labels?.[s] ?? s}</option>)}
      </select>
    </label>
    {value > 0 && <span className="comp-sc-hp">{knob(fxId(prefix, 'fx.comp.schp'), 'schp')}</span>}
    {offline && <span className="comp-sc-note">SQ-4 ONLY — NO KEY HERE</span>}
  </div>;
}
