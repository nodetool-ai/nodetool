// DR-1 kit browser: the shared shell with a kit adapter. Rows load FACTORY /
// USER kits; the audition plays a one-bar kick, snare, and hat groove.

import { useMemo } from 'react';
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
    title: 'DR-1 kits',
    glyphLegend: 'kick · snare · hat · toms',
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
    auditionHint: (on) => !powered ? 'Start the timeline audio to hear kits.'
      : playing ? 'The timeline plays the kit.'
      : on ? 'A one-bar groove plays on select.' : 'Play the pads to hear kits.',
    renderGlyph: (e, color) => <KitGlyph className="pbr-glyph" data={e.glyph} color={color} />,
    renderDetail: (color) => (
      <>
        <KitGlyph className="pbr-big" data={live} color={color} fill />
        <div className="pbr-legend"><span>KICK</span><span>SNARE</span><span>HAT</span><span>TOMS</span></div>
        <dl className="pbr-kv">
          <dt>Kick decay</dt><dd>{fmtSec(live.voices[0].dec)}</dd>
          <dt>Snare decay</dt><dd>{fmtSec(live.voices[1].dec)}</dd>
          <dt>Hat decay</dt><dd>{fmtSec(live.voices[2].dec)}</dd>
          <dt>Toms</dt><dd>{live.toms.map(fmtSt).join(' / ')} st</dd>
          <dt>Tempo</dt><dd>{Math.round(params['seq.bpm'])} BPM</dd>
        </dl>
      </>
    ),
  };
  return <PresetBrowserShell adapter={adapter} onClose={onClose} />;
}
