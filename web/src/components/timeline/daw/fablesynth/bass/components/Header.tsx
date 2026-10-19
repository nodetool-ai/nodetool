// Source: fablesynth src/bass/components/Header.tsx. The BL-1 top bar: patch
// selection, the live scope and the output level. Transport, tempo and swing
// belong to the timeline, so they are not here.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScopeView } from '../../components/displays/ScopeView';
import { patchOptions } from '../patches';
import { useBassStore } from '../bassStoreContext';
import { BassPatchBrowser } from './BassPatchBrowser';
import { BassKnob } from './BassKnob';

export function Header() {
  const { t } = useTranslation();
  const device = useBassStore((s) => s.device);
  const patchValue = useBassStore((s) => s.patchValue);
  const userPatches = useBassStore((s) => s.userPatches);
  const dirty = useBassStore((s) => s.dirty);
  const readOnly = useBassStore((s) => s.readOnly);
  const stepPatch = useBassStore((s) => s.stepPatch);
  const savePatch = useBassStore((s) => s.savePatch);

  const [browsing, setBrowsing] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPatch = patchOptions(userPatches).find((option) => option.value === patchValue)?.name ?? 'CUSTOM';

  useEffect(() => {
    if (naming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [naming]);

  const startNaming = () => {
    setDraft(currentPatch === 'CUSTOM' ? '' : currentPatch);
    setNaming(true);
  };

  const commit = () => {
    const name = draft.trim().toUpperCase();
    setNaming(false);
    if (!name) return;
    savePatch(name);
  };

  return (
    <header className="top-bar bl-header">
      <div className="brand">FABLE<em>SYNTH</em><small>BL-1</small></div>
      <div className="preset-bar bl-patchbar" aria-label={t('i18n-next48.patch.selection')}>
        <span className="bl-patch-label">{t('i18n-next48.patch.label')}</span>
        <button className="pb-btn" aria-label={t('i18n-next48.patch.previous')} disabled={readOnly} onClick={() => stepPatch(-1)}>◂</button>
        {naming ? (
          <input
            ref={inputRef}
            className="bl-patchname-input"
            value={draft}
            maxLength={24}
            aria-label={t('i18n-next48.patch.name')}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setNaming(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); setNaming(false); }
              e.stopPropagation();
            }}
          />
        ) : (
          <span className="bl-patchname">
            {dirty && <span className="bl-patch-dirty" aria-hidden="true" />}
            {currentPatch}
          </span>
        )}
        <button className="pb-btn" aria-label={t('i18n-next48.patch.next')} disabled={readOnly} onClick={() => stepPatch(1)}>▸</button>
        <button
          className="pb-btn pb-save pb-browse"
          aria-expanded={browsing}
          disabled={readOnly}
          onClick={() => setBrowsing(!browsing)}
        >{t('i18n-next48.common.browse')}</button>
        <button className="pb-btn pb-save" onClick={startNaming}>{t('i18n-next48.common.save')}</button>
      </div>
      <div className="bl-voicemode">{t('i18n-next48.bass.voiceMode')}</div>
      <div className="hud bl-hud">
        <div className="hud-cell">
          {device ? <ScopeView analyser={device.getAnalyser()} accent="#4dff9e" /> : <canvas />}
          <span>{t('i18n-next48.common.scope')}</span>
        </div>
      </div>
      <div className="bl-master">
        <BassKnob paramId="master.volume" size="md" accent="n" />
      </div>
      {browsing && <BassPatchBrowser onClose={() => setBrowsing(false)} />}
    </header>
  );
}
