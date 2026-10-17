// DR-1 device body: the JUCE page layout (juce/source/drum/DrumDeviceBody.cpp)
// without the sequencer page, since the timeline's midi clips play the kit.
// The pad sidebar stays on EDIT and PAD FX; GROUP FX takes the full width.

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

type Page = 'edit' | 'padFx' | 'groupFx';

const TABS: DeviceTab<Page>[] = [
  { id: 'edit', label: 'EDIT', width: 76 },
  { id: 'padFx', label: 'PAD FX', width: 96 },
  { id: 'groupFx', label: 'GROUP FX', width: 112 },
];

export function DrumDeviceBody() {
  const [page, setPage] = useState<Page>('edit');
  const tabs = <DeviceTabs tabs={TABS} page={page} onSelect={setPage} label="DR-1 pages" />;

  return (
    <div className="device-body dr-body" data-page={page}>
      <div className={`dr-main${page === 'groupFx' ? ' no-pads' : ''}`}>
        {page !== 'groupFx' && <div className="dr-left">
          <div className="dr-pads-slot"><PadGrid /></div>
          <div className="dr-padstrip-slot"><PadStrip /></div>
        </div>}
        <div className="dr-right">
          {tabs}
          {page === 'edit' ? (
            <>
              <div className="dr-selbar-slot"><SelBar /></div>
              <div className="dr-oscrow-slot">
                <OscSection osc="oscA" />
                <SampleSection />
                <NoiseSection />
              </div>
              <div className="dr-editrow-slot">
                <PitchEnvPanel />
                <AmpEnvPanel />
                <FilterSection />
                <ModPanel />
              </div>
            </>
          ) : (
            <div className="dr-fxrack-slot"><FxRack scope={page === 'padFx' ? 'pad' : 'group'} /></div>
          )}
        </div>
      </div>
    </div>
  );
}
