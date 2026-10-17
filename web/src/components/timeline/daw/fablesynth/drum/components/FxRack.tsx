import { useLayoutEffect, useMemo } from 'react';
import { useDrumStore } from '../dr1Store';
import { OUT_NAMES, pad } from '../params';
import { DrumStepper } from './DrumStepper';
import { DrumKnob } from './DrumKnob';
import { LabPanel } from '../../components/panels/LabPanel';
import { KitMixPanel } from './KitMixPanel';
import { DRUM_SC_SOURCES } from '../../engine/sidechain';
import { EqPanel } from '../../components/panels/EqPanel';
import { DrivePanel } from '../../components/panels/DrivePanel';
import { ChorusPanel } from '../../components/panels/ChorusPanel';
import { DynamicsPanel } from '../../components/panels/DynamicsPanel';
import { TapeEchoPanel } from '../../components/panels/TapeEchoPanel';
import { ReverbPanel } from '../../components/panels/ReverbPanel';
import type { FxPanelAdapter, FxTelemetryEngine } from '../../components/panels/fxAdapter';

export type DrumFxScope = 'pad' | 'group';

function DrumPower({ paramId }: { paramId: string }) {
  const on = useDrumStore(s => s.params[paramId] > 0.5);
  const setParam = useDrumStore(s => s.setParam);
  return <button className={`power-btn fx-power${on ? ' on' : ''}`} type="button" aria-label={`${paramId} power`} aria-pressed={on} onClick={() => setParam(paramId, on ? 0 : 1)} />;
}

const SILENT: FxTelemetryEngine = {
  ctx: null,
  subscribeDynamics: () => () => undefined,
  subscribeEcho: () => () => undefined,
  subscribeReverb: () => () => undefined,
};

interface FxRackProps {
  scope?: DrumFxScope;
  /** Shows the PAD FX / GROUP FX switch when given. */
  onScope?: (scope: DrumFxScope) => void;
}

export function FxRack({ scope = 'pad', onScope }: FxRackProps) {
  const selectedPad = useDrumStore((s) => s.sel);
  const params = useDrumStore(s => s.params);
  const setParam = useDrumStore(s => s.setParam);
  const device = useDrumStore((s) => s.device);
  const analyser = useDrumStore((s) => s.analyser);
  const padNames = useDrumStore((s) => s.padNames);
  const scLabels = Object.fromEntries(padNames.map((n, i) => [`PAD ${String(i + 1).padStart(2, '0')}`, `${String(i + 1).padStart(2, '0')} ${n}`]));
  const bus = Math.max(0, Math.min(OUT_NAMES.length - 1, params[pad(selectedPad, 'out')] | 0));
  useLayoutEffect(() => { device?.selectPad(selectedPad); }, [device, selectedPad, bus]);
  const engine = useMemo<FxTelemetryEngine>(() => device ? {
    ctx: { sampleRate: device.sampleRate },
    subscribeDynamics: (l) => device.subscribeDynamics(l),
    subscribeEcho: (l) => device.subscribeEcho(l),
    subscribeReverb: (l) => device.subscribeReverb(l),
  } : SILENT, [device]);
  const adapter: FxPanelAdapter = {
    engine,
    params,
    setParam,
    prefix: scope === 'pad' ? pad(selectedPad, '') : '',
    // The track channel carries the summed kit, so only the group EQ has a
    // signal to learn from; a single pad is never isolated.
    analysis: scope === 'pad'
      ? { source: null, note: 'USE GROUP FX TO LEARN' }
      : { source: analyser, reference: 'drums' },
    compTap: scope === 'pad' ? { source: null, style: 'punch' } : { source: analyser, postComp: true, style: 'glue' },
    // Side-chain keys from other timeline tracks are not connected.
    sidechain: { sources: DRUM_SC_SOURCES, hosted: false, labels: scLabels },
    renderKnob: (id, key) => <DrumKnob paramId={id} label={id.includes('fx.eq.') ? key?.toUpperCase() : undefined} size="sm" accent="n" />,
    renderPower: (id) => <DrumPower paramId={id} />,
    renderStepper: (id) => <DrumStepper paramId={id} accent="n" />,
  };

  return (
    <section className="panel dr-fx-panel" aria-label={scope === 'pad' ? 'DR-1 selected pad effects' : 'DR-1 drum group channel strip'}>
      <div className="dr-fx-head">
        <span className="dr-led dr-led-a" aria-hidden="true" />
        <h2>{scope === 'pad' ? 'PAD FX INSERT' : 'DRUM GROUP CHANNEL STRIP'}</h2>
        {onScope && <div className="dr-fx-scope" role="group" aria-label="FX scope">
          <button type="button" className={scope === 'pad' ? 'active' : ''} aria-pressed={scope === 'pad'} onClick={() => onScope('pad')}>PAD FX</button>
          <button type="button" className={scope === 'group' ? 'active' : ''} aria-pressed={scope === 'group'} onClick={() => onScope('group')}>GROUP FX</button>
        </div>}
        <span className="dr-fx-padname">{scope === 'pad' ? `PAD ${String(selectedPad + 1).padStart(2, '0')}` : 'ALL 16 PADS'}</span>
        <span className="dr-fx-flow" aria-hidden="true">EQ › OTT › COMP › DRIVE › CHORUS › DELAY › REVERB</span>
      </div>
      {scope === 'group' && <KitMixPanel />}
      <div className="fx-rack">
        <EqPanel key={`${scope}-${selectedPad}`} adapter={adapter} />
        <DynamicsPanel kind="ott" adapter={adapter} />
        <DynamicsPanel kind="comp" adapter={adapter} />
        <DrivePanel adapter={adapter} />
        <ChorusPanel adapter={adapter} />
        <TapeEchoPanel adapter={{ ...adapter, title: 'DELAY', context: 'PING-PONG' }} />
        <ReverbPanel adapter={{ ...adapter, context: scope === 'pad' ? OUT_NAMES[bus] : 'POST MIX' }} />
      </div>
      <LabPanel adapter={adapter} />
    </section>
  );
}
