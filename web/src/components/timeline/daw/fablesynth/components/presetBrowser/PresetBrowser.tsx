// WT-1 preset browser: the shared shell with a WT-1 adapter. Rows load
// FACTORY / USER presets; the audition plays a short phrase for the preset's
// role through the track's device.

import { useMemo, useRef } from 'react';
import { PresetBrowserShell, type PresetBrowserAdapter } from './PresetBrowserShell';
import { PresetGlyph } from './PresetGlyph';
import { useStore, useStoreApi, type SoundSnapshot, type Wt1StoreApi } from '../../store';
import { FILTER_TYPES, TABLE_NAMES, fmtHz, fmtPct, fmtSec } from '../../params';
import { browserEntries, glyphData, varyParams, PHRASE_ROOT, PHRASES, type BrowserEntry } from '../../presetBrowser';
import { PRESET_CHARACTERS, PRESET_ROLES } from '../../presetTags';

type WtSnapshot = SoundSnapshot & { value: string };

// Plays a role's phrase through the device; a new phrase cancels the last one.
function usePhrase(api: Wt1StoreApi) {
  const timers = useRef<number[]>([]);
  const held = useRef(new Set<number>());
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    held.current.forEach((n) => api.getState().engine.noteOff(n));
    held.current.clear();
  };
  const play = (item: BrowserEntry | null) => {
    stop();
    const { powered, params, engine } = api.getState();
    if (!powered) return;
    const beat = 60 / (params['seq.bpm'] || 120) * 1000;
    for (const [semi, start, len] of PHRASES[item?.role ?? 'lead']) {
      const n = PHRASE_ROOT + semi;
      timers.current.push(window.setTimeout(() => { engine.noteOn(n, 0.8); held.current.add(n); }, 30 + start * beat));
      timers.current.push(window.setTimeout(() => { engine.noteOff(n); held.current.delete(n); }, 30 + (start + len) * beat));
    }
  };
  return { play, stop };
}

export function PresetBrowser({ onClose }: { onClose: () => void }) {
  const api = useStoreApi();
  const userPresets = useStore((s) => s.userPresets);
  const presetValue = useStore((s) => s.presetValue);
  const params = useStore((s) => s.params);
  const powered = useStore((s) => s.powered);
  const tables = useStore((s) => s.tables);
  const { loadPresetByValue, captureSound, restoreSound, applyVariant } = api.getState();

  const items = useMemo(() => browserEntries(userPresets), [userPresets]);
  const glyphs = useMemo(() => new Map(items.map((e) => [e.value, glyphData(e.params)])), [items]);
  const live = useMemo(() => glyphData(params), [params]);
  const phrase = usePhrase(api);

  const adapter: PresetBrowserAdapter<BrowserEntry, WtSnapshot> = {
    title: 'WT-1 presets',
    glyphLegend: 'wave · filter · env · lfo',
    favoritesKey: 'fablesynth.presetFavorites',
    roles: PRESET_ROLES,
    characters: PRESET_CHARACTERS,
    items,
    value: presetValue,
    load: (e) => loadPresetByValue(e.value),
    capture: () => {
      const s = captureSound();
      return { ...s, value: s.presetValue };
    },
    restore: (s) => restoreSound(s),
    vary: (e) => applyVariant(varyParams(e.params)),
    audition: (e) => phrase.play(e),
    stopAudition: phrase.stop,
    auditionHint: (on) => !powered ? 'The track device is starting.'
      : on ? 'A short phrase plays on select.' : 'Play the keys to hear presets.',
    renderGlyph: (e, color) => <PresetGlyph className="pbr-glyph" data={glyphs.get(e.value)!} tables={tables} color={color} />,
    renderDetail: (color) => (
      <>
        <PresetGlyph className="pbr-big" data={live} tables={tables} color={color} fill />
        <div className="pbr-legend"><span>WAVE</span><span>FILTER</span><span>ENV</span><span>LFO</span></div>
        <dl className="pbr-kv">
          <dt>Wave</dt><dd>{TABLE_NAMES[live.table] ?? 'USER'} · {fmtPct(live.pos)}</dd>
          <dt>Filter</dt><dd>{live.filterType < 0 ? 'off' : `${FILTER_TYPES[live.filterType]} · ${fmtHz(live.cutoff)}`}</dd>
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
