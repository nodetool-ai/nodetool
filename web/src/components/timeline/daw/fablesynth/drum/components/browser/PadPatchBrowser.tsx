// DR-1 pad patch browser: the shared shell with a pad-patch adapter. Rows load
// FACTORY / USER patches onto the selected pad; the audition hits that pad.
// In SQ-4 focus mode the same store path applies: DeviceView writes the pad
// edits back to the track's session patch.

// Standalone: idle sequencer. SQ-4: stopped transport.
const canAudition = () => {
  const { hosted, playing } = useDrumStore.getState();
  return hosted ? !useSeqStore.getState().playing : !playing;
};

import { useMemo } from 'react';
import { PresetBrowserShell, type BrowserSnapshot, type PresetBrowserAdapter } from '../../../components/presetBrowser/PresetBrowserShell';
import { fmtHz, fmtPct, fmtSec } from '../../../params';
import { DRUM_FILTER_TYPES } from '../../params';
import { PAD_HITS, padGlyphFromParams, patchEntries, varyPadParams, type PatchEntry } from '../../drumBrowser';
import { PATCH_CHARACTERS, PATCH_ROLES } from '../../patchTags';
import { useDrumStore, type PadSnapshot } from '../../store';
import { PadGlyph } from './DrumGlyph';
import { useDrumAudition } from './useDrumAudition';
import { useSeqStore } from '../../../seq/store';

type DrumPadSnapshot = PadSnapshot & BrowserSnapshot;

export function PadPatchBrowser({ onClose }: { onClose: () => void }) {
  const userPatches = useDrumStore((s) => s.userPatches);
  const patchValue = useDrumStore((s) => s.patchValue);
  const params = useDrumStore((s) => s.params);
  const sel = useDrumStore((s) => s.sel);
  const powered = useDrumStore((s) => s.powered);
  // Re-render the hint when either transport starts or stops.
  useDrumStore((s) => s.playing);
  useSeqStore((s) => s.playing);
  const { applyPatchByValue, capturePad, restorePad, applyPadVariant } = useDrumStore.getState();

  const items = useMemo(() => patchEntries(userPatches), [userPatches]);
  const live = useMemo(() => padGlyphFromParams(params, sel), [params, sel]);
  const audition = useDrumAudition();

  const adapter: PresetBrowserAdapter<PatchEntry, DrumPadSnapshot> = {
    title: 'DR-1 pad patches',
    glyphLegend: 'pitch · amp · filter · source',
    favoritesKey: 'fablesynth.drumPatchFavorites',
    roles: PATCH_ROLES,
    characters: PATCH_CHARACTERS,
    items,
    value: patchValue,
    load: (e) => applyPatchByValue(e.value),
    capture: capturePad,
    restore: restorePad,
    vary: (e) => applyPadVariant(varyPadParams(e.fields, useDrumStore.getState().sel)),
    audition: () => {
      const padI = useDrumStore.getState().sel;
      audition.play((bpm) => PAD_HITS.map(([beat, v]) => [beat * 60 / bpm * 1000, padI, v]), canAudition());
    },
    stopAudition: audition.stop,
    auditionHint: (on) => !powered ? 'Power on to hear patches.'
      : !canAudition() ? (useDrumStore.getState().hosted ? 'Stop SQ-4 to hear patches.' : 'The sequencer plays the pad.')
      : on ? 'Three hits of the selected pad play on select.' : 'Play the pad to hear patches.',
    renderGlyph: (e, color) => <PadGlyph className="pbr-glyph" data={e.glyph} color={color} />,
    renderDetail: (color) => (
      <>
        <PadGlyph className="pbr-big" data={live} color={color} fill />
        <div className="pbr-legend"><span>PITCH</span><span>AMP</span><span>FILTER</span><span>SOURCE</span></div>
        <dl className="pbr-kv">
          <dt>Pitch env</dt><dd>{live.penvAmt ? `${live.penvAmt > 0 ? '+' : ''}${live.penvAmt} st · ${fmtSec(live.penvDec)}` : 'off'}</dd>
          <dt>Amp decay</dt><dd>{fmtSec(live.amp.dec)}</dd>
          <dt>Filter</dt><dd>{live.filterOn ? `${DRUM_FILTER_TYPES[live.filterType]} · ${fmtHz(live.cutoff)}` : 'off'}</dd>
          <dt>Osc / sample</dt><dd>{fmtPct(live.mix[0])} / {fmtPct(live.mix[1])}</dd>
          <dt>Noise / ring</dt><dd>{fmtPct(live.mix[2])} / {fmtPct(live.mix[3])}</dd>
        </dl>
      </>
    ),
  };
  return <PresetBrowserShell adapter={adapter} onClose={onClose} />;
}
