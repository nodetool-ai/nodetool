import { bassEngine, useBassStore } from '../store';
import { BassKnob } from './BassKnob';
import { EqPanel } from '../../components/panels/EqPanel';
import { DrivePanel } from '../../components/panels/DrivePanel';
import { ChorusPanel } from '../../components/panels/ChorusPanel';
import { DynamicsPanel } from '../../components/panels/DynamicsPanel';
import { TapeEchoPanel } from '../../components/panels/TapeEchoPanel';
import { ReverbPanel } from '../../components/panels/ReverbPanel';
import type { FxPanelAdapter } from '../../components/panels/fxAdapter';
import { SC_SOURCES, trackKeyLabels } from '../../engine/sidechain';
import { useSeqStore } from '../../seq/store';

function BassPower({ paramId }: { paramId: string }) {
  const on = useBassStore(s => s.params[paramId] > 0.5);
  const setParam = useBassStore(s => s.setParam);
  return <button className={`power-btn fx-power${on ? ' on' : ''}`} type="button" aria-label={`${paramId} power`} aria-pressed={on} onClick={() => setParam(paramId, on ? 0 : 1)} />;
}

export function BassFxRack() {
  const params = useBassStore(s => s.params);
  const setParam = useBassStore(s => s.setParam);
  const hosted = useBassStore(s => s.hosted);
  const seqTracks = useSeqStore(s => s.session.tracks);
  const adapter: FxPanelAdapter = {
    sidechain: { sources: SC_SOURCES, hosted, labels: hosted ? trackKeyLabels(seqTracks) : undefined },
    engine: bassEngine,
    params,
    setParam,
    analysis: { source: bassEngine.scopeAnalyser ?? null, reference: 'bass' },
    compTap: { source: null, style: 'level' },
    renderKnob: (id, key) => <BassKnob paramId={id} label={id.includes('fx.eq.') ? key?.toUpperCase() : undefined} size="sm" accent="n" />,
    renderPower: (id) => <BassPower paramId={id} />,
  };
  return (
    <section className="panel bl-fx-panel">
      <div className="fx-rack bl-fx-rack">
        <EqPanel adapter={adapter} />
        <DynamicsPanel kind="ott" adapter={adapter} />
        <DynamicsPanel kind="comp" adapter={adapter} />
        <DrivePanel adapter={adapter} />
        <ChorusPanel adapter={adapter} />
        <TapeEchoPanel adapter={{ ...adapter, title: 'DELAY', context: 'PING-PONG' }} />
        <ReverbPanel adapter={adapter} />
      </div>
    </section>
  );
}
