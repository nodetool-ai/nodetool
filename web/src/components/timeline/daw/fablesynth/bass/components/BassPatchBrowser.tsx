// Source: fablesynth src/bass/components/BassPatchBrowser.tsx. The shared
// browser shell with a BL-1 adapter. Rows load FACTORY / USER patches into
// the track; the audition plays a short bass line through the live device.

import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PresetBrowserShell, type PresetBrowserAdapter, type BrowserSnapshot } from '../../components/presetBrowser/PresetBrowserShell';
import { PresetGlyph } from '../../components/presetBrowser/PresetGlyph';
import { fmtHz, fmtPct, fmtSec } from '../../params';
import { BASS_FILTER_TYPES, ROOT_MIDI, TABLE_NAMES } from '../params';
import { useBassStore, useBassStoreApi } from '../bassStoreContext';
import type { BassSoundSnapshot, BassStoreApi } from '../store';
import { bl1Tables } from '../../../devices/bl1Tables';
import { BASS_PHRASE, BASS_PHRASE_SEMI, bassBrowserEntries, bassGlyphData, bassVaryParams, type BassBrowserEntry } from '../patchBrowser';
import { PATCH_CHARACTERS, PATCH_ROLES } from '../patchTags';

type BassSnapshot = BassSoundSnapshot & BrowserSnapshot;

// Plays the phrase through the device; a new phrase cancels the last one.
function usePhrase(store: BassStoreApi) {
  const timers = useRef<number[]>([]);
  const held = useRef(new Set<number>());
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    held.current.forEach((n) => store.getState().noteOff(n));
    held.current.clear();
  };
  const play = (allowed: boolean) => {
    stop();
    if (!allowed) return;
    const beat = 60 / (store.getState().bpm || 120) * 1000;
    for (const [semi, start, len, acc] of BASS_PHRASE) {
      const n = ROOT_MIDI + BASS_PHRASE_SEMI + semi;
      timers.current.push(window.setTimeout(() => { store.getState().noteOn(n, acc ? 120 : 92); held.current.add(n); }, 30 + start * beat));
      timers.current.push(window.setTimeout(() => { store.getState().noteOff(n); held.current.delete(n); }, 30 + (start + len) * beat));
    }
  };
  return { play, stop };
}

export function BassPatchBrowser({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const store = useBassStoreApi();
  const userPatches = useBassStore((s) => s.userPatches);
  const patchValue = useBassStore((s) => s.patchValue);
  const params = useBassStore((s) => s.params);
  const playing = useBassStore((s) => s.playing);
  const { loadPatchByValue, captureSound, restoreSound, applyVariant } = store.getState();

  const items = useMemo(() => bassBrowserEntries(userPatches), [userPatches]);
  const glyphs = useMemo(() => new Map(items.map((e) => [e.value, bassGlyphData(e.params)])), [items]);
  const live = useMemo(() => bassGlyphData(params), [params]);
  const tables = bl1Tables();
  const phrase = usePhrase(store);

  const adapter: PresetBrowserAdapter<BassBrowserEntry, BassSnapshot> = {
    title: t('i18n-next20.bassPatchBrowser.title'),
    glyphLegend: t('i18n-next20.bassPatchBrowser.glyphLegend'),
    favoritesKey: 'fablesynth.bassPatchFavorites',
    roles: PATCH_ROLES,
    characters: PATCH_CHARACTERS,
    items,
    value: patchValue,
    load: (e) => loadPatchByValue(e.value),
    capture: () => {
      const s = captureSound();
      return { ...s, value: s.patchValue };
    },
    restore: (s) => restoreSound(s),
    vary: (e) => applyVariant(bassVaryParams(e.params)),
    audition: () => phrase.play(!store.getState().playing),
    stopAudition: phrase.stop,
    auditionHint: (on) => playing ? t('i18n-next20.bassPatchBrowser.timelineAuditionHint')
      : on ? t('i18n-next20.bassPatchBrowser.shortAuditionHint') : t('i18n-next20.bassPatchBrowser.keysAuditionHint'),
    renderGlyph: (e, color) => <PresetGlyph className="pbr-glyph" data={glyphs.get(e.value)!} tables={tables} color={color} />,
    renderDetail: (color) => (
      <>
        <PresetGlyph className="pbr-big" data={live} tables={tables} color={color} fill />
        <div className="pbr-legend"><span>{t("i18n-next20.bassPatchBrowser.wave")}</span><span>{t("i18n-next20.bassPatchBrowser.filter")}</span><span>{t("i18n-next20.bassPatchBrowser.env")}</span><span>{t("i18n-next20.bassPatchBrowser.lfo")}</span></div>
        <dl className="pbr-kv">
          <dt>{t("i18n-next20.bassPatchBrowser.wave")}</dt><dd>{TABLE_NAMES[live.table] ?? 'USER'} · {fmtPct(live.pos)}</dd>
          <dt>{t("i18n-next20.bassPatchBrowser.filter")}</dt><dd>{BASS_FILTER_TYPES[live.filterType]} · {fmtHz(live.cutoff)}</dd>
          <dt>{t("i18n-next20.bassPatchBrowser.reso")}</dt><dd>{fmtPct(live.res)}</dd>
          <dt>{t("i18n-next20.bassPatchBrowser.envelope")}</dt><dd>{fmtSec(live.env[0])} / {fmtSec(live.env[1])} / {fmtSec(live.env[3])}</dd>
          <dt>{t("i18n-next20.bassPatchBrowser.sustain")}</dt><dd>{fmtPct(live.env[2])}</dd>
          <dt>{t("i18n-next20.bassPatchBrowser.lfoDepth")}</dt><dd>{live.lfoDepth ? fmtPct(live.lfoDepth) : t('i18n-next20.bassPatchBrowser.off')}</dd>
        </dl>
      </>
    ),
  };
  return <PresetBrowserShell adapter={adapter} onClose={onClose} />;
}
