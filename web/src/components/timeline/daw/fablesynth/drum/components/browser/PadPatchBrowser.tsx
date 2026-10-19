// DR-1 pad patch browser: the shared shell with a pad-patch adapter. Rows load
// FACTORY / USER patches onto the selected pad; the audition hits that pad.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PresetBrowserShell, type BrowserSnapshot, type PresetBrowserAdapter } from '../../../components/presetBrowser/PresetBrowserShell';
import { fmtHz, fmtPct, fmtSec } from '../../../params';
import { DRUM_FILTER_TYPES } from '../../params';
import { PAD_HITS, padGlyphFromParams, patchEntries, varyPadParams, type PatchEntry } from '../../drumBrowser';
import { PATCH_CHARACTERS, PATCH_ROLES } from '../../patchTags';
import { useDrumStore, useDrumStoreApi, type PadSnapshot } from '../../dr1Store';
import { PadGlyph } from './DrumGlyph';
import { useDrumAudition } from './useDrumAudition';

type DrumPadSnapshot = PadSnapshot & BrowserSnapshot;

export function PadPatchBrowser({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const userPatches = useDrumStore((s) => s.userPatches);
  const patchValue = useDrumStore((s) => s.patchValue);
  const params = useDrumStore((s) => s.params);
  const sel = useDrumStore((s) => s.sel);
  const powered = useDrumStore((s) => s.powered);
  const playing = useDrumStore((s) => s.playing);
  const store = useDrumStoreApi();
  const { applyPatchByValue, capturePad, restorePad, applyPadVariant } = store.getState();

  const items = useMemo(() => patchEntries(userPatches), [userPatches]);
  const live = useMemo(() => padGlyphFromParams(params, sel), [params, sel]);
  const audition = useDrumAudition();

  const adapter: PresetBrowserAdapter<PatchEntry, DrumPadSnapshot> = {
    title: t('i18n-next107.drum.padPatchBrowser.title'),
    glyphLegend: t('i18n-next107.drum.padPatchBrowser.glyphLegend'),
    favoritesKey: 'fablesynth.drumPatchFavorites',
    roles: PATCH_ROLES,
    characters: PATCH_CHARACTERS,
    items,
    value: patchValue,
    load: (e) => applyPatchByValue(e.value),
    capture: capturePad,
    restore: restorePad,
    vary: (e) => applyPadVariant(varyPadParams(e.fields, store.getState().sel)),
    audition: () => {
      const padI = store.getState().sel;
      audition.play((bpm) => PAD_HITS.map(([beat, v]) => [beat * 60 / bpm * 1000, padI, v]), !store.getState().playing);
    },
    stopAudition: audition.stop,
    auditionHint: (on) => !powered ? t('i18n-next107.drum.padPatchBrowser.audioOff')
      : playing ? t('i18n-next107.drum.padPatchBrowser.timelinePlaying')
      : on ? t('i18n-next107.drum.padPatchBrowser.auditionPlaying') : t('i18n-next107.drum.padPatchBrowser.playPad'),
    renderGlyph: (e, color) => <PadGlyph className="pbr-glyph" data={e.glyph} color={color} />,
    renderDetail: (color) => (
      <>
        <PadGlyph className="pbr-big" data={live} color={color} fill />
        <div className="pbr-legend">
          <span>{t('i18n-next107.drum.padPatchBrowser.pitch')}</span>
          <span>{t('i18n-next107.drum.padPatchBrowser.amp')}</span>
          <span>{t('i18n-next107.drum.padPatchBrowser.filter')}</span>
          <span>{t('i18n-next107.drum.padPatchBrowser.source')}</span>
        </div>
        <dl className="pbr-kv">
          <dt>{t('i18n-next107.drum.padPatchBrowser.pitchEnv')}</dt><dd>{live.penvAmt ? `${live.penvAmt > 0 ? '+' : ''}${live.penvAmt} st · ${fmtSec(live.penvDec)}` : t('i18n-next107.drum.padPatchBrowser.off')}</dd>
          <dt>{t('i18n-next107.drum.padPatchBrowser.ampDecay')}</dt><dd>{fmtSec(live.amp.dec)}</dd>
          <dt>{t('i18n-next107.drum.padPatchBrowser.filter')}</dt><dd>{live.filterOn ? `${DRUM_FILTER_TYPES[live.filterType]} · ${fmtHz(live.cutoff)}` : t('i18n-next107.drum.padPatchBrowser.off')}</dd>
          <dt>{t('i18n-next107.drum.padPatchBrowser.oscSample')}</dt><dd>{fmtPct(live.mix[0])} / {fmtPct(live.mix[1])}</dd>
          <dt>{t('i18n-next107.drum.padPatchBrowser.noiseRing')}</dt><dd>{fmtPct(live.mix[2])} / {fmtPct(live.mix[3])}</dd>
        </dl>
      </>
    ),
  };
  return <PresetBrowserShell adapter={adapter} onClose={onClose} />;
}
