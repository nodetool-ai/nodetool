// BL-1 patch browser: the shared shell with a BL-1 adapter. Rows load FACTORY /
// USER patches; the audition plays a short bass line through the engine. With
// `session` (SQ-4 focus mode) it browses the track's session patch instead,
// factory patches only.

import { useMemo, useRef } from 'react';
import { PresetBrowserShell, type PresetBrowserAdapter, type BrowserSnapshot } from '../../components/presetBrowser/PresetBrowserShell';
import { PresetGlyph } from '../../components/presetBrowser/PresetGlyph';
import { fmtHz, fmtPct, fmtSec } from '../../params';
import { BASS_FILTER_TYPES, TABLE_NAMES } from '../params';
import { bassEngine, useBassStore, type BassSoundSnapshot } from '../store';
import { BASS_PHRASE, BASS_PHRASE_SEMI, bassBrowserEntries, bassGlyphData, bassVaryParams, type BassBrowserEntry } from '../patchBrowser';
import { PATCH_CHARACTERS, PATCH_ROLES } from '../patchTags';
import type { SessionPatchOps, SessionSnapshot } from '../../seq/sessionPatchOps';

type BassSnapshot = (BassSoundSnapshot & BrowserSnapshot) | SessionSnapshot;

// Plays the phrase through the engine; a new phrase cancels the last one.
function usePhrase() {
  const timers = useRef<number[]>([]);
  const held = useRef(new Set<number>());
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    held.current.forEach((n) => bassEngine.noteOff(n));
    held.current.clear();
  };
  const play = (allowed: boolean) => {
    stop();
    const { powered, params } = useBassStore.getState();
    if (!powered || !allowed) return;
    const beat = 60 / (params['seq.bpm'] || 120) * 1000;
    for (const [semi, start, len, acc] of BASS_PHRASE) {
      const n = BASS_PHRASE_SEMI + semi;
      timers.current.push(window.setTimeout(() => { bassEngine.noteOn(n, acc ? 1 : 0.72); held.current.add(n); }, 30 + start * beat));
      timers.current.push(window.setTimeout(() => { bassEngine.noteOff(n); held.current.delete(n); }, 30 + (start + len) * beat));
    }
  };
  return { play, stop };
}

export function BassPatchBrowser({ onClose, session }: { onClose: () => void; session?: SessionPatchOps }) {
  const userPatches = useBassStore((s) => s.userPatches);
  const patchValue = useBassStore((s) => s.patchValue);
  const params = useBassStore((s) => s.params);
  const powered = useBassStore((s) => s.powered);
  const playing = useBassStore((s) => s.playing);
  const { loadPatchByValue, captureSound, restoreSound, applyVariant } = useBassStore.getState();

  const items = useMemo(() => bassBrowserEntries(session ? [] : userPatches), [userPatches, !session]);
  const glyphs = useMemo(() => new Map(items.map((e) => [e.value, bassGlyphData(e.params)])), [items]);
  const live = useMemo(() => bassGlyphData(params), [params]);
  const tables = powered ? bassEngine.tables : null;
  const phrase = usePhrase();

  const adapter: PresetBrowserAdapter<BassBrowserEntry, BassSnapshot> = {
    title: 'BL-1 patches',
    glyphLegend: 'wave · filter · env · lfo',
    favoritesKey: 'fablesynth.bassPatchFavorites',
    roles: PATCH_ROLES,
    characters: PATCH_CHARACTERS,
    items,
    value: session?.value ?? patchValue,
    load: (e) => (session ? session.load(e.value) : loadPatchByValue(e.value)),
    capture: () => {
      if (session) return session.capture();
      const s = captureSound();
      return { ...s, value: s.patchValue };
    },
    restore: (s) => ('patch' in s ? session?.restore(s) : restoreSound(s)),
    vary: (e) => (session ? session.applyParams(bassVaryParams(e.params)) : applyVariant(bassVaryParams(e.params))),
    audition: () => phrase.play(session ? session.canAudition() : !useBassStore.getState().hosted && !useBassStore.getState().playing),
    stopAudition: phrase.stop,
    auditionHint: (on) => !powered ? 'Power on to hear patches.'
      : session && !session.canAudition() ? 'Stop SQ-4 to hear patches.'
      : !session && playing ? 'The sequencer plays the patch.'
      : on ? 'A short bass line plays on select.' : 'Play the keys to hear patches.',
    renderGlyph: (e, color) => <PresetGlyph className="pbr-glyph" data={glyphs.get(e.value)!} tables={tables} color={color} />,
    renderDetail: (color) => (
      <>
        <PresetGlyph className="pbr-big" data={live} tables={tables} color={color} fill />
        <div className="pbr-legend"><span>WAVE</span><span>FILTER</span><span>ENV</span><span>LFO</span></div>
        <dl className="pbr-kv">
          <dt>Wave</dt><dd>{TABLE_NAMES[live.table] ?? 'USER'} · {fmtPct(live.pos)}</dd>
          <dt>Filter</dt><dd>{BASS_FILTER_TYPES[live.filterType]} · {fmtHz(live.cutoff)}</dd>
          <dt>Reso</dt><dd>{fmtPct(live.res)}</dd>
          <dt>A / D / R</dt><dd>{fmtSec(live.env[0])} / {fmtSec(live.env[1])} / {fmtSec(live.env[3])}</dd>
          <dt>Sustain</dt><dd>{fmtPct(live.env[2])}</dd>
          <dt>LFO depth</dt><dd>{live.lfoDepth ? fmtPct(live.lfoDepth) : 'off'}</dd>
        </dl>
      </>
    ),
  };
  return <PresetBrowserShell adapter={adapter} onClose={onClose} />;
}
