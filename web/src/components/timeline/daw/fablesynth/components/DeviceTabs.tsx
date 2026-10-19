// Page tabs for a device body, matching the JUCE editors: fixed-width tab
// buttons in one row, with optional power LEDs at the right end of a tab
// (the SEQUENCER / ARP / CHORDS playback toggles).

import './deviceTabs.css';
import { useTranslation } from 'react-i18next';

export interface DeviceTab<P extends string> {
  id: P;
  label: string;
  width: number; // px, the JUCE tab width
  led?: { on: boolean; label: string; toggle: () => void };
}

interface DeviceTabsProps<P extends string> {
  tabs: DeviceTab<P>[];
  page: P;
  onSelect: (page: P) => void;
  label: string;
  className?: string;
}

export function DeviceTabs<P extends string>({ tabs, page, onSelect, label, className = '' }: DeviceTabsProps<P>) {
  const { t } = useTranslation();
  const tabLabel = (tab: DeviceTab<P>) => t(`i18n-next44-fablesynth-controls.deviceTabs.${tab.id}`, { defaultValue: tab.label });
  return (
    <div className={`device-tabs ${className}`} role="tablist" aria-label={t('i18n-next44-fablesynth-controls.deviceTabs.pages', { device: label.replace(/ pages$/, '') })}>
      {tabs.map((t) => (
        <div key={t.id} className={`device-tab${t.led ? ' has-led' : ''}`} style={{ width: t.width }}>
          <button
            type="button"
            role="tab"
            aria-selected={t.id === page}
            className={t.id === page ? 'on' : ''}
            onClick={() => onSelect(t.id)}
          >{tabLabel(t)}</button>
          {t.led && (
            <button
              type="button"
              className={`power-btn device-tab-led${t.led.on ? ' on' : ''}`}
              aria-label={t.led.label}
              aria-pressed={t.led.on}
              onClick={t.led.toggle}
            />
          )}
        </div>
      ))}
    </div>
  );
}
