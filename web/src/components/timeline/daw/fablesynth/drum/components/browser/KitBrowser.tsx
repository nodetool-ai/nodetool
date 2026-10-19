// DR-1 kit browser: the shared shell with a kit adapter. Rows load FACTORY /
// USER kits; the audition plays a one-bar kick, snare, and hat groove.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PresetBrowserShell, type BrowserSnapshot, type PresetBrowserAdapter } from '../../../components/presetBrowser/PresetBrowserShell';
import { fmtSec } from '../../../params';
import { kitEntries, kitGlyphData, KIT_GROOVE, type KitEntry } from '../../drumBrowser';
import { KIT_CHARACTERS, KIT_ROLES } from '../../kitTags';
import { useDrumStore, useDrumStoreApi, type KitSnapshot } from '../../dr1Store';
import { KitGlyph } from './DrumGlyph';
import { useDrumAudition } from './useDrumAudition';

type DrumKitSnapshot = KitSnapshot & BrowserSnapshot;

const fmtSt = (v: number) => (v > 0 ? '+' : '') + Math.round(v);

// `session` is accepted for the SQ-4 host view only and ignored.
export function KitBrowser({ onClose }: { onClose: () => void; session?: unknown }) {
  const { t } = useTranslation();
  const userKits = useDrumStore((s) => s.userKits);
  const kitValue = useDrumStore((s) => s.kitValue);
  const params = useDrumStore((s) => s.params);
  const powered = useDrumStore((s) => s.powered);
  const playing = useDrumStore((s) => s.playing);
  const store = useDrumStoreApi();
  const { loadKitByValue, captureKit, restoreKit } = store.getState();

  const items = useMemo(() => kitEntries(userKits), [userKits]);
  const live = useMemo(() => kitGlyphData(params), [params]);
  const audition = useDrumAudition();

  const adapter: PresetBrowserAdapter<KitEntry, DrumKitSnapshot> = {
    title: t('i18n-next107.drum.kitBrowser.title'),
    glyphLegend: t('i18n-next107.drum.kitBrowser.glyphLegend'),
    favoritesKey: 'fablesynth.drumKitFavorites',
    roles: KIT_ROLES,
    characters: KIT_CHARACTERS,
    items,
    value: kitValue,
    load: (e) => loadKitByValue(e.value),
    capture: () => captureKit(),
    restore: (s) => restoreKit(s),
    audition: () => audition.play((bpm) => {
      const step = 60 / bpm / 4 * 1000;
      return KIT_GROOVE.map(([p, s, v]) => [s * step, p, v]);
    }, !store.getState().playing),
    stopAudition: audition.stop,
    auditionHint: (on) => !powered ? t('i18n-next107.drum.kitBrowser.audioOff')
      : playing ? t('i18n-next107.drum.kitBrowser.timelinePlaying')
      : on ? t('i18n-next107.drum.kitBrowser.auditionPlaying') : t('i18n-next107.drum.kitBrowser.playPads'),
    renderGlyph: (e, color) => <KitGlyph className="pbr-glyph" data={e.glyph} color={color} />,
    renderDetail: (color) => (
      <>
        <KitGlyph className="pbr-big" data={live} color={color} fill />
        <div className="pbr-legend">
          <span>{t('i18n-next107.drum.kitBrowser.kick')}</span>
          <span>{t('i18n-next107.drum.kitBrowser.snare')}</span>
          <span>{t('i18n-next107.drum.kitBrowser.hat')}</span>
          <span>{t('i18n-next107.drum.kitBrowser.toms')}</span>
        </div>
        <dl className="pbr-kv">
          <dt>{t('i18n-next107.drum.kitBrowser.kickDecay')}</dt><dd>{fmtSec(live.voices[0].dec)}</dd>
          <dt>{t('i18n-next107.drum.kitBrowser.snareDecay')}</dt><dd>{fmtSec(live.voices[1].dec)}</dd>
          <dt>{t('i18n-next107.drum.kitBrowser.hatDecay')}</dt><dd>{fmtSec(live.voices[2].dec)}</dd>
          <dt>{t('i18n-next107.drum.kitBrowser.toms')}</dt><dd>{live.toms.map(fmtSt).join(' / ')} st</dd>
          <dt>{t('i18n-next107.drum.kitBrowser.tempo')}</dt><dd>{Math.round(params['seq.bpm'])} BPM</dd>
        </dl>
      </>
    ),
  };
  return <PresetBrowserShell adapter={adapter} onClose={onClose} />;
}
