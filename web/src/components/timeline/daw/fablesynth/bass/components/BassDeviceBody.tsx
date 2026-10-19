// Source: fablesynth src/bass/components/BassDeviceBody.tsx, the JUCE page
// layout (juce/source/bass/BassDeviceBody.cpp). EDIT holds the voice panels
// with the keyboard last; FX CHAIN fills the page. The upstream SEQUENCER and
// ARP pages are gone: the timeline's clips play BL-1.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceTabs, type DeviceTab } from '../../components/DeviceTabs';
import { BassFxRack } from './BassFxRack';
import { EnvPanel } from './EnvPanel';
import { FilterSection } from './FilterSection';
import { KeysPanel } from './KeysPanel';
import { AccentPanel, LfoPanel } from './LfoPanel';
import { OscSection, SubSection } from './OscSection';

type Page = 'edit' | 'fx';

export function BassDeviceBody() {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>('edit');
  const tabs: DeviceTab<Page>[] = [
    { id: 'edit', label: t('i18n-next116.fableSynth.tabs.edit'), width: 76 },
    { id: 'fx', label: t('i18n-next116.fableSynth.tabs.fxChain'), width: 106 },
  ];

  return (
    <div className="device-body bl-body">
      <DeviceTabs tabs={tabs} page={page} onSelect={setPage} label={t('i18n-next116.fableSynth.pages', { device: 'BL-1' })} />
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
