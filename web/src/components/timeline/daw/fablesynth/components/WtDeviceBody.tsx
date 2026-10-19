// WT-1 device body: the JUCE page layout (juce/source/ui/WtDeviceBody.cpp).
// EDIT holds the voice panels, FX CHAIN the effects, and LAB fills the page.
// Upstream's SEQUENCER, ARP, CHORDS and AUTOMATION pages are not here: on the
// timeline the clips sequence the device.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceTabs, type DeviceTab } from './DeviceTabs';
import { OscPanel } from './panels/OscPanel';
import { UtilPanel } from './panels/UtilPanel';
import { FilterPanel } from './panels/FilterPanel';
import { EnvPanel } from './panels/EnvPanel';
import { LfoPanel } from './panels/LfoPanel';
import { MatrixPanel } from './panels/MatrixPanel';
import { EqPanel } from './panels/EqPanel';
import { DynamicsPanel } from './panels/DynamicsPanel';
import { TapeEchoPanel } from './panels/TapeEchoPanel';
import { ReverbPanel } from './panels/ReverbPanel';
import { FxPanel } from './panels/FxPanel';
import { LabPanel } from './panels/LabPanel';
import { useStore } from '../store';
import { Knob } from './Knob';
import { PowerButton } from './PowerButton';
import { Stepper } from './Stepper';
import type { FxPanelAdapter } from './panels/fxAdapter';

type Page = 'edit' | 'fx' | 'lab';

const TABS: DeviceTab<Page>[] = [
  { id: 'edit', label: 'EDIT', width: 76 },
  { id: 'fx', label: 'FX CHAIN', width: 106 },
  { id: 'lab', label: 'LAB', width: 70 },
];

// The shared FX panels are store-independent; WT-1 binds them to its store.
function useWtFxAdapter(): FxPanelAdapter {
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const engine = useStore((s) => s.engine);
  // Re-read the analyser when the track's device changes.
  const powered = useStore((s) => s.powered);
  return useMemo(() => {
    const scope = powered ? engine.scopeAnalyser : null;
    return {
      engine, params, setParam, tape: true,
      analysis: { source: scope, reference: 'lead' },
      compTap: { source: null, style: 'level' },
      renderKnob: (id, key, accent) => <Knob paramId={id} label={id.includes('fx.eq.') ? key?.toUpperCase() : undefined} size="sm" accent={accent ?? 'n'} />,
      renderPower: (id) => <PowerButton paramId={id} />,
      renderStepper: (id) => <Stepper paramId={id} />,
    };
  }, [engine, params, setParam, powered]);
}

export function WtDeviceBody() {
  const { t } = useTranslation();
  const fx = useWtFxAdapter();
  const [page, setPage] = useState<Page>('edit');

  return (
    <div className="device-body wt-body">
      <DeviceTabs
        tabs={TABS.map((tab) => ({
          ...tab,
          label: t(`i18n-next77.wt1Body.tabs.${tab.id}`, { defaultValue: tab.label })
        }))}
        page={page}
        onSelect={setPage}
        label={t('i18n-next77.wt1Body.pagesLabel')}
      />
      {page === 'edit' && (
        <div className="panels device-page" data-page="edit">
          <OscPanel prefix="oscA" accentKey="a" title={t('i18n-next77.wt1Body.panels.oscA')} gridArea="oscA" />
          <OscPanel prefix="oscB" accentKey="b" title={t('i18n-next77.wt1Body.panels.oscB')} gridArea="oscB" />
          <UtilPanel />
          <FilterPanel />
          <EnvPanel id="env1" title={t('i18n-next77.wt1Body.panels.ampEnv')} gridArea="env1" viewAccent="#e8edf7" knobAccent="n" />
          <EnvPanel id="env2" title={t('i18n-next77.wt1Body.panels.modEnv')} gridArea="env2" viewAccent="#b18cff" knobAccent="f"
            pages={[{ id: 'env2', label: '1', modSource: 3 }, { id: 'env3', label: '2', modSource: 8 }]} />
          <LfoPanel />
          <MatrixPanel />
        </div>
      )}
      {page === 'fx' && (
        <div className="panels device-page" data-page="fx">
          <EqPanel adapter={fx} />
          <DynamicsPanel kind="ott" adapter={fx} />
          <DynamicsPanel kind="comp" adapter={fx} />
          <TapeEchoPanel adapter={fx} />
          <ReverbPanel adapter={fx} />
          <FxPanel adapter={fx} />
        </div>
      )}
      {page === 'lab' && <div className="panels device-page" data-page="lab"><LabPanel adapter={fx} /></div>}
    </div>
  );
}
