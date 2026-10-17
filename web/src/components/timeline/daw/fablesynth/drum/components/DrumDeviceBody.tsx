// DR-1 device body: the JUCE page layout (juce/source/drum/DrumDeviceBody.cpp).
// The pad sidebar stays on EDIT and PAD FX; GROUP FX and SEQUENCER take the
// full width. The tabs sit at the top of the editor column on every page.

import { useState } from 'react';
import { DeviceTabs, type DeviceTab } from '../../components/DeviceTabs';
import { AmpEnvPanel } from './AmpEnvPanel';
import { FilterSection } from './FilterSection';
import { FxRack } from './FxRack';
import { ModPanel } from './ModPanel';
import { NoiseSection } from './NoiseSection';
import { OscSection } from './OscSection';
import { PadGrid } from './PadGrid';
import { PadStrip } from './PadStrip';
import { PitchEnvPanel } from './PitchEnvPanel';
import { SampleSection } from './SampleSection';
import { SelBar } from './SelBar';
import { StepSeq } from './StepSeq';
import { useSeqStore } from '../../seq/store';

type Page = 'edit' | 'padFx' | 'groupFx' | 'seq';

const TABS: DeviceTab<Page>[] = [
  { id: 'edit', label: 'EDIT', width: 76 },
  { id: 'padFx', label: 'PAD FX', width: 96 },
  { id: 'groupFx', label: 'GROUP FX', width: 112 },
  { id: 'seq', label: 'SEQUENCER', width: 126 },
];

export function DrumDeviceBody() {
  const [page, setPage] = useState<Page>('edit');
  const select = (p: Page) => {
    // FxRack reads its scope from the SQ-4 store, which also drives the hosted view.
    const { openDrumFx, closeDrumFx } = useSeqStore.getState();
    if (p === 'padFx') openDrumFx('pad');
    else if (p === 'groupFx') openDrumFx('group');
    else closeDrumFx();
    setPage(p);
  };
  const tabs = <DeviceTabs tabs={TABS} page={page} onSelect={select} label="DR-1 pages" />;

  if (page === 'seq') {
    return (
      <div className="device-body dr-body" data-page="seq">
        <div className="dr-main"><div />{tabs}</div>
        <div id="dr-stepseq"><StepSeq /></div>
      </div>
    );
  }
  return (
    <div className="device-body dr-body" data-page={page}>
      <div className={`dr-main${page === 'groupFx' ? ' no-pads' : ''}`}>
        {page !== 'groupFx' && <div className="dr-left">
          <div id="dr-pads"><PadGrid /></div>
          <div id="dr-padstrip"><PadStrip /></div>
        </div>}
        <div className="dr-right">
          {tabs}
          {page === 'edit' ? (
            <>
              <div id="dr-selbar"><SelBar /></div>
              <div id="dr-oscrow">
                <OscSection osc="oscA" />
                <SampleSection />
                <NoiseSection />
              </div>
              <div id="dr-editrow">
                <PitchEnvPanel />
                <AmpEnvPanel />
                <FilterSection />
                <ModPanel />
              </div>
            </>
          ) : (
            <div id="dr-fxrack"><FxRack scopeSwitch={false} /></div>
          )}
        </div>
      </div>
    </div>
  );
}
