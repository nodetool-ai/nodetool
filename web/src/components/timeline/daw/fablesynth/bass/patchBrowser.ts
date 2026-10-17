// BL-1 patch browser model: entries, glyph data, variations, and the short
// bass line that auditions a patch. Filtering and favorites are shared
// (shared/presetBrowser.ts); the UI lives in bass/components/BassPatchBrowser.

import type { ParamValues } from '../params';
import type { BrowserItem } from '../shared/presetBrowser';
import type { GlyphData } from '../presetBrowser';
import { BASS_PARAMS } from './params';
import { FACTORY_PATCHES, patchToState, type BassPatch } from './patches';
import { factoryPatchTags, type PatchCharacter, type PatchRole } from './patchTags';

export interface BassBrowserEntry extends BrowserItem {
  role: PatchRole | null;
  tags: PatchCharacter[];
  params: ParamValues;
}

export function bassBrowserEntries(userPatches: BassPatch[]): BassBrowserEntry[] {
  const out: BassBrowserEntry[] = FACTORY_PATCHES.map((p, i) => {
    const t = factoryPatchTags(p.name);
    return { value: 'f' + i, name: p.name, user: false, role: t?.role ?? null, tags: t?.tags ?? [], params: patchToState(p).params };
  });
  userPatches.forEach((p, i) =>
    out.push({ value: 'u' + i, name: p.name, user: true, role: null, tags: [], params: patchToState(p).params }));
  return out;
}

// BL-1's filter types share WT-1's indices 0..4, so the glyph reads them as is.
export function bassGlyphData(p: ParamValues): GlyphData {
  return {
    table: p['osc.table'] | 0,
    pos: p['osc.pos'],
    filterType: p['flt.type'] | 0,
    cutoff: p['flt.cut'],
    res: p['flt.res'],
    env: [p['aenv.att'], p['aenv.dec'], p['aenv.sus'], p['aenv.rel']],
    lfoDepth: Math.min(1, p['lfo.depth'] || 0),
  };
}

// ---------- vary ----------

// [param, amount]. Log params move by up to ±amount octaves; linear params move
// by up to ±amount of their range. Pitch, levels, and FX stay fixed so a
// variant keeps the patch's register and balance.
const VARY: [string, number][] = [
  ['osc.pos', 0.15], ['osc.detune', 0.08],
  ['flt.cut', 0.6], ['flt.res', 0.08], ['flt.env', 0.1],
  ['fenv.dec', 0.4], ['aenv.dec', 0.4], ['aenv.sus', 0.08], ['aenv.rel', 0.4],
  ['lfo.depth', 0.05], ['acc.amt', 0.1],
];

function nudge(id: string, v: number, amount: number, r: number): number {
  const d = BASS_PARAMS[id];
  if (!d || d.min === undefined || d.max === undefined) return v;
  const next = d.curve === 'log' ? v * Math.pow(2, r * amount) : v + r * amount * (d.max - d.min);
  return Math.min(d.max, Math.max(d.min, next));
}

/** A nearby variant of `p`. `rand` returns values in [0, 1). */
export function bassVaryParams(p: ParamValues, rand: () => number = Math.random): ParamValues {
  const out = { ...p };
  for (const [id, amount] of VARY) if (id in out) out[id] = nudge(id, out[id], amount, rand() * 2 - 1);
  return out;
}

// ---------- audition phrase ----------

// [semitones from the root, start beat, length in beats, accent]. Root is A1
// (MIDI 33); the store's semitone 0 is C2 (MIDI 36). A note that starts while
// the last one still sounds slides into place (legato).
export type BassPhraseNote = [number, number, number, boolean?];
export const BASS_PHRASE_SEMI = -3;
export const BASS_PHRASE: BassPhraseNote[] = [
  [0, 0, 0.5, true], [0, 0.75, 0.25], [12, 1.5, 0.25], [3, 2, 0.6], [5, 2.5, 0.5], // 5 slides in from 3
  [7, 3, 0.4, true], [0, 3.5, 0.5],
];
