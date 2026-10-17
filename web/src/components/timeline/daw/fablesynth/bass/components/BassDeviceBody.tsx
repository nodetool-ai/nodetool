// BL-1 device body: the JUCE page layout (juce/source/bass/BassDeviceBody.cpp).
// EDIT holds the voice panels with the keyboard last; FX CHAIN, SEQUENCER, and
// ARP each fill the page.

import { useState } from 'react';
import { DeviceTabs, type DeviceTab } from '../../components/DeviceTabs';
import { BassArpPanel } from './BassArpPanel';
import { BassFxRack } from './BassFxRack';
import { EnvPanel } from './EnvPanel';
import { FilterSection } from './FilterSection';
import { KeysPanel } from './KeysPanel';
import { AccentPanel, LfoPanel } from './LfoPanel';
import { OscSection, SubSection } from './OscSection';
import { PitchSeqGrid } from './PitchSeq';
import { useBassStore } from '../store';

type Page = 'edit' | 'fx' | 'seq' | 'arp';

export function BassDeviceBody() {
  const arpMode = useBassStore((s) => s.arpMode);
  const setArpMode = useBassStore((s) => s.setArpMode);
  const [page, setPage] = useState<Page>(() => (useBassStore.getState().arpMode ? 'arp' : 'edit'));

  const tabs: DeviceTab<Page>[] = [
    { id: 'edit', label: 'EDIT', width: 76 },
    { id: 'fx', label: 'FX CHAIN', width: 106 },
    { id: 'seq', label: 'SEQUENCER', width: 146, led: { on: !arpMode, label: 'Sequencer on/off', toggle: () => setArpMode(false) } },
    { id: 'arp', label: 'ARP', width: 92, led: { on: arpMode, label: 'Arpeggiator on/off', toggle: () => setArpMode(!arpMode) } },
  ];

  return (
    <div className="device-body bl-body">
      <DeviceTabs tabs={tabs} page={page} onSelect={setPage} label="BL-1 pages" />
      {page === 'edit' && (
        <div className="device-page" data-page="edit">
          <div id="bl-editrow">
            <OscSection />
            <SubSection />
            <FilterSection />
            <EnvPanel />
          </div>
          <div id="bl-modrow">
            <LfoPanel />
            <AccentPanel />
          </div>
          {/* Keyboard last, where a synth's keys belong. */}
          <div id="bl-keysrow"><KeysPanel /></div>
        </div>
      )}
      {page === 'fx' && <div className="device-page" data-page="fx"><div id="bl-fxrack"><BassFxRack /></div></div>}
      {page === 'seq' && <div className="device-page" data-page="seq"><div id="bl-seq"><PitchSeqGrid /></div></div>}
      {page === 'arp' && <div className="device-page" data-page="arp"><div id="bl-seq"><BassArpPanel /></div></div>}
    </div>
  );
}
