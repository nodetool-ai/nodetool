// Source: fablesynth src/bass/components/BassDeviceBody.tsx, the JUCE page
// layout (juce/source/bass/BassDeviceBody.cpp). EDIT holds the voice panels
// with the keyboard last; FX CHAIN fills the page. The upstream SEQUENCER and
// ARP pages are gone: the timeline's clips play BL-1.

import { useState } from 'react';
import { DeviceTabs, type DeviceTab } from '../../components/DeviceTabs';
import { BassFxRack } from './BassFxRack';
import { EnvPanel } from './EnvPanel';
import { FilterSection } from './FilterSection';
import { KeysPanel } from './KeysPanel';
import { AccentPanel, LfoPanel } from './LfoPanel';
import { OscSection, SubSection } from './OscSection';

type Page = 'edit' | 'fx';

const TABS: DeviceTab<Page>[] = [
  { id: 'edit', label: 'EDIT', width: 76 },
  { id: 'fx', label: 'FX CHAIN', width: 106 },
];

export function BassDeviceBody() {
  const [page, setPage] = useState<Page>('edit');

  return (
    <div className="device-body bl-body">
      <DeviceTabs tabs={TABS} page={page} onSelect={setPage} label="BL-1 pages" />
      {page === 'edit' && (
        <div className="device-page" data-page="edit">
          <div className="bl-editrow">
            <OscSection />
            <SubSection />
            <FilterSection />
            <EnvPanel />
          </div>
          <div className="bl-modrow">
            <LfoPanel />
            <AccentPanel />
          </div>
          {/* Keyboard last, where a synth's keys belong. */}
          <div className="bl-keysrow"><KeysPanel /></div>
        </div>
      )}
      {page === 'fx' && <div className="device-page" data-page="fx"><div className="bl-fxrack"><BassFxRack /></div></div>}
    </div>
  );
}
