import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutoCompStrip } from './AutoCompStrip';
import { DynamicsView } from '../displays/DynamicsView';
import type { FxPanelAdapter, SideChainInfo } from './fxAdapter';
import { SC_SOURCES, isExternalSource } from '../../engine/sidechain';
import { fxId } from './fxAdapter';
import './dynamics.css';

export function DynamicsPanel({ kind, adapter }: { kind: 'ott' | 'comp'; adapter: FxPanelAdapter }) {
  const { t } = useTranslation();
  const [autoOpen, setAutoOpen] = useState(false);
  const { params, setParam } = adapter;
  const prefix = adapter.prefix ?? '', on = params[fxId(prefix, `fx.${kind}.on`)] > 0.5;
  const power = adapter.renderPower, knob = adapter.renderKnob;
  return <section className={`panel panel-dynamics${on ? '' : ' dynamics-bypassed'}`} style={{ gridArea: kind }} aria-label={kind === 'ott' ? t('i18n-next45-fablesynth-effects.dynamics.ottAriaLabel') : t('i18n-next45-fablesynth-effects.dynamics.compressorAriaLabel')}>
    <div className="panel-head">
      {power(fxId(prefix, `fx.${kind}.on`))}
      <h2>{kind === 'ott' ? 'OTT' : 'COMP'}</h2>
      <span className="dynamics-caption">{on ? kind === 'ott' ? t('i18n-next45-fablesynth-effects.dynamics.threeBand') : `${(params[fxId(prefix, 'fx.comp.ratio')] ?? 4).toFixed(1)}:1 · ${t('i18n-next45-fablesynth-effects.dynamics.softKnee')}` : t('i18n-next45-fablesynth-effects.common.bypass')}</span>
      {kind === 'comp' && <button type="button" className={`comp-auto-toggle${autoOpen ? ' on' : ''}`} aria-pressed={autoOpen}
        title={t('i18n-next45-fablesynth-effects.dynamics.autoCompTitle')} onClick={() => setAutoOpen(o => !o)}>AUTO</button>}
      <span className="dynamics-legend">{kind === 'ott' ? t('i18n-next45-fablesynth-effects.dynamics.levelGain') : <><i /> {t('i18n-next45-fablesynth-effects.dynamics.input')} <i className="legend-out" /> {t('i18n-next45-fablesynth-effects.dynamics.output')}</>}</span>
    </div>
    <DynamicsView kind={kind} telemetryEngine={adapter.engine} telemetryParams={params} prefix={prefix} />
    {kind === 'comp' && autoOpen ? <AutoCompStrip key={`${prefix}${adapter.compTap?.style ?? ''}`} engine={adapter.engine} tap={adapter.compTap}
      id={k => fxId(prefix, `fx.comp.${k}`)} params={params} setParam={setParam} /> : <>
    <div className="dynamics-controls">
      {(kind === 'ott' ? ['depth', 'time', 'up', 'down'] : ['thr', 'att', 'rel', 'ratio']).map(k => <span key={k}>{knob(fxId(prefix, `fx.${kind}.${k}`), k)}</span>)}
    </div>
    {kind === 'comp' && <SideChainRow prefix={prefix} params={params} setParam={setParam} knob={knob}
      sc={adapter.sidechain ?? { sources: SC_SOURCES, hosted: false }} />}
    {kind === 'comp' && <div className="dynamics-footnote">{params[fxId(prefix, 'fx.comp.sc')] > 0.5 ? t('i18n-next45-fablesynth-effects.dynamics.keyedFootnote') : t('i18n-next45-fablesynth-effects.dynamics.autoGainFootnote')}</div>}
    {kind === 'ott' && <div className="dynamics-footnote">{t('i18n-next45-fablesynth-effects.dynamics.ottFootnote')}</div>}
    </>}
  </section>;
}

// Side-chain: pick the key source; the key high-pass appears once keyed.
// Track keys need the SQ-4 key bus, so standalone devices list them disabled.
function SideChainRow({ prefix, params, setParam, knob, sc }: {
  prefix: string; params: Record<string, number>; setParam: (id: string, v: number) => void;
  knob: (id: string, key?: string) => React.ReactNode; sc: SideChainInfo;
}) {
  const { t } = useTranslation();
  const id = fxId(prefix, 'fx.comp.sc'), value = Math.round(params[id] ?? 0);
  const offline = value > 0 && !sc.hosted && isExternalSource(sc.sources, value);
  return <div className={`comp-sc${value > 0 ? ' on' : ''}`}>
    <label>
      <span>{t('i18n-next45-fablesynth-effects.dynamics.sidechain')}</span>
      <select aria-label={t('i18n-next45-fablesynth-effects.dynamics.sidechainSource')} value={value} onChange={e => setParam(id, Number(e.target.value))}>
        {sc.sources.map((s, i) => <option key={s} value={i} disabled={i !== value && !sc.hosted && isExternalSource(sc.sources, i)}>
          {sc.labels?.[s] ?? s}</option>)}
      </select>
    </label>
    {value > 0 && <span className="comp-sc-hp">{knob(fxId(prefix, 'fx.comp.schp'), 'schp')}</span>}
    {offline && <span className="comp-sc-note">{t('i18n-next45-fablesynth-effects.dynamics.sidechainOffline')}</span>}
  </div>;
}
