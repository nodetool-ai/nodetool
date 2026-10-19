// Source: fablesynth src/bass/components/BassFxRack.tsx. The FX chain inside
// the BL-1 worklet, drawn by the shared FX panels through an adapter.

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineHistoryBatch } from '../../../../../../stores/timeline/useTimelineHistoryBatch';
import { useBassStore } from '../bassStoreContext';
import { BassKnob } from './BassKnob';
import { EqPanel } from '../../components/panels/EqPanel';
import { DrivePanel } from '../../components/panels/DrivePanel';
import { ChorusPanel } from '../../components/panels/ChorusPanel';
import { DynamicsPanel } from '../../components/panels/DynamicsPanel';
import { TapeEchoPanel } from '../../components/panels/TapeEchoPanel';
import { ReverbPanel } from '../../components/panels/ReverbPanel';
import type { FxPanelAdapter, FxTelemetryEngine } from '../../components/panels/fxAdapter';
import { SC_SOURCES } from '../../engine/sidechain';

// Panels mount before the device exists; telemetry starts once it does.
const IDLE_TELEMETRY: FxTelemetryEngine = {
  ctx: null,
  subscribeDynamics: () => () => undefined,
  subscribeEcho: () => () => undefined,
  subscribeReverb: () => () => undefined,
};

// The panels write params straight from pointer moves (EQ nodes) and in bursts
// (band reset, auto-EQ fit). A burst ends after this much quiet and costs one
// undo entry.
const BURST_QUIET_MS = 400;

function useBurstSetParam(setParam: (id: string, value: number) => void): (id: string, value: number) => void {
  const { begin, mark, end } = useTimelineHistoryBatch();
  const open = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (open.current) { open.current = false; end(); }
  }, [end]);
  return useCallback((id: string, value: number) => {
    if (!open.current) { open.current = true; begin(); }
    setParam(id, value);
    mark();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      open.current = false;
      end();
    }, BURST_QUIET_MS);
  }, [setParam, begin, mark, end]);
}

function BassPower({ paramId }: { paramId: string }) {
  const { t } = useTranslation();
  const on = useBassStore((s) => s.params[paramId] > 0.5);
  const setParam = useBassStore((s) => s.setParam);
  return <button className={`power-btn fx-power${on ? ' on' : ''}`} type="button" aria-label={t('i18n-next48.fx.power', { label: paramId })} aria-pressed={on} onClick={() => setParam(paramId, on ? 0 : 1)} />;
}

export function BassFxRack() {
  const { t } = useTranslation();
  const params = useBassStore((s) => s.params);
  const setParam = useBurstSetParam(useBassStore((s) => s.setParam));
  const device = useBassStore((s) => s.device);
  const analyser = device ? device.getAnalyser() : null;
  const adapter: FxPanelAdapter = {
    sidechain: { sources: SC_SOURCES, hosted: false },
    engine: device ? device.telemetry : IDLE_TELEMETRY,
    params,
    setParam,
    analysis: { source: analyser, reference: 'bass' },
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
        <TapeEchoPanel adapter={{ ...adapter, title: t('i18n-next48.fx.delay'), context: t('i18n-next48.fx.pingPong') }} />
        <ReverbPanel adapter={adapter} />
      </div>
    </section>
  );
}
