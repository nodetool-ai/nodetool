// WT-1 device body: the JUCE page layout (juce/source/ui/WtDeviceBody.cpp).
// EDIT holds the voice panels, FX CHAIN the effects, and LAB, SEQUENCER, ARP,
// CHORDS, and AUTOMATION each fill the page. The SEQUENCER, ARP, and CHORDS
// LEDs are one radio group: exactly one of the three modes plays. The automation editor stays mounted so a
// knob's control menu can open its lane from any page.

import { useState } from 'react';
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
import { NoteSeqPanel } from './panels/SeqPanel';
import { ArpPanel } from './panels/WtArpPanel';
import { WtAutomation } from './WtAutomation';
import { useStore } from '../store';
import { modeStyle, seqMode, type SeqMode } from '../arp';

type Page = 'edit' | 'fx' | 'lab' | SeqMode | 'auto';

export function WtDeviceBody() {
  const arpMode = useStore((s) => s.arpMode);
  const style = useStore((s) => s.arp.style);
  const mode = seqMode(arpMode, style);
  const [page, setPage] = useState<Page>(() => {
    const st = useStore.getState();
    return st.arpMode ? seqMode(true, st.arp.style) : 'edit';
  });
  const enable = (next: SeqMode) => {
    const st = useStore.getState();
    if (next !== 'seq' && st.arp.style !== modeStyle(next)) st.updateArp({ style: modeStyle(next) });
    st.setArpMode(next !== 'seq');
  };
  // An LED switches its mode on; switching ARP or CHORDS off returns to SEQUENCER.
  const led = (m: SeqMode, label: string) => ({ on: mode === m, label: `${label} on/off`, toggle: () => enable(mode === m ? 'seq' : m) });

  const tabs: DeviceTab<Page>[] = [
    { id: 'edit', label: 'EDIT', width: 76 },
    { id: 'fx', label: 'FX CHAIN', width: 106 },
    { id: 'lab', label: 'LAB', width: 70 },
    { id: 'seq', label: 'SEQUENCER', width: 146, led: led('seq', 'Sequencer') },
    { id: 'arp', label: 'ARP', width: 92, led: led('arp', 'Arpeggiator') },
    { id: 'chords', label: 'CHORDS', width: 118, led: led('chords', 'Chord comping') },
    { id: 'auto', label: 'AUTOMATION', width: 138 },
  ];

  return (
    <div className="device-body wt-body">
      <DeviceTabs tabs={tabs} page={page} onSelect={setPage} label="WT-1 pages" />
      {page === 'edit' && (
        <div className="panels device-page" data-page="edit">
          <OscPanel prefix="oscA" accentKey="a" title="OSC A" gridArea="oscA" />
          <OscPanel prefix="oscB" accentKey="b" title="OSC B" gridArea="oscB" />
          <UtilPanel />
          <FilterPanel />
          <EnvPanel id="env1" title="AMP ENV" gridArea="env1" viewAccent="#e8edf7" knobAccent="n" />
          <EnvPanel id="env2" title="MOD ENV" gridArea="env2" viewAccent="#b18cff" knobAccent="f"
            pages={[{ id: 'env2', label: '1', modSource: 3 }, { id: 'env3', label: '2', modSource: 8 }]} />
          <LfoPanel />
          <MatrixPanel />
        </div>
      )}
      {page === 'fx' && (
        <div className="panels device-page" data-page="fx">
          <EqPanel />
          <DynamicsPanel kind="ott" />
          <DynamicsPanel kind="comp" />
          <TapeEchoPanel />
          <ReverbPanel />
          <FxPanel />
        </div>
      )}
      {page === 'lab' && <div className="panels device-page" data-page="lab"><LabPanel /></div>}
      {page === 'seq' && <div className="panels device-page" data-page="seq"><NoteSeqPanel /></div>}
      {page === 'arp' && <div className="panels device-page" data-page="seq"><ArpPanel mode="arp" /></div>}
      {page === 'chords' && <div className="panels device-page" data-page="seq"><ArpPanel mode="chords" /></div>}
      <div className="device-page wt-auto-page" hidden={page !== 'auto'}>
        <WtAutomation onReveal={() => setPage('auto')} />
      </div>
    </div>
  );
}
