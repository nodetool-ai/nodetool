// WT-1 preset browser model: entries, glyph data, variations, and the short
// phrases that audition a preset. Filtering and favorites are shared
// (shared/presetBrowser.ts); the UI lives in components/presetBrowser.

import { PARAMS, type ParamValues } from './params';
import { FACTORY_PRESETS, resolvePresetMods, type Preset } from './presets';
import { factoryPresetTags, type PresetCharacter, type PresetRole } from './presetTags';
import { MOD_MATRIX_SIZE } from './store/slotHelpers';
import type { BrowserItem } from './shared/presetBrowser';

export { favoriteKey, filterEntries, type BrowserFilter } from './shared/presetBrowser';

export interface BrowserEntry extends BrowserItem {
  role: PresetRole | null;
  tags: PresetCharacter[];
  params: ParamValues;
}

export function browserEntries(userPresets: Preset[]): BrowserEntry[] {
  const out: BrowserEntry[] = FACTORY_PRESETS.map((p, i) => {
    const t = factoryPresetTags(p.name);
    return { value: 'f' + i, name: p.name, user: false, role: t?.role ?? null, tags: t?.tags ?? [], params: resolvePresetMods(p.params, p.mods) };
  });
  userPresets.forEach((p, i) =>
    out.push({ value: 'u' + i, name: p.name, user: true, role: null, tags: [], params: resolvePresetMods(p.params, p.mods) }));
  return out;
}

// ---------- glyph ----------

export interface GlyphData {
  table: number;
  pos: number;
  filterType: number; // FILTER_TYPES index
  cutoff: number; // Hz
  res: number;
  env: [number, number, number, number]; // amp a, d, s, r (seconds, level)
  lfoDepth: number; // 0..1, summed |amt| of LFO routes
}

export function glyphData(p: ParamValues): GlyphData {
  let lfoDepth = 0;
  for (let s = 1; s <= MOD_MATRIX_SIZE; s++) {
    const src = p[`mat${s}.src`] | 0;
    if (src === 1 || src === 2) lfoDepth += Math.abs(p[`mat${s}.amt`] || 0);
  }
  return {
    table: p['oscA.table'] | 0,
    pos: p['oscA.pos'],
    filterType: p['filter.on'] === 0 ? -1 : p['filter.type'] | 0,
    cutoff: p['filter.cutoff'],
    res: p['filter.res'],
    env: [p['env1.a'], p['env1.d'], p['env1.s'], p['env1.r']],
    lfoDepth: Math.min(1, lfoDepth),
  };
}

// ---------- vary ----------

// [param, amount]. Log params move by up to ±amount octaves; linear params move
// by up to ±amount of their range. Pitch, levels, and FX stay fixed so a
// variant keeps the preset's register and balance.
const VARY: [string, number][] = [
  ['oscA.pos', 0.15], ['oscB.pos', 0.15],
  ['oscA.detune', 0.08], ['oscB.detune', 0.08],
  ['filter.cutoff', 0.6], ['filter.res', 0.08], ['filter.env', 0.08],
  ['env1.a', 0.4], ['env1.d', 0.4], ['env1.s', 0.08], ['env1.r', 0.4],
  ['env2.a', 0.4], ['env2.d', 0.4], ['env2.s', 0.08],
  ['lfo1.rate', 0.4], ['lfo2.rate', 0.4],
];

function nudge(id: string, v: number, amount: number, r: number): number {
  const d = PARAMS[id];
  if (!d || d.min === undefined || d.max === undefined) return v;
  const next = d.curve === 'log' ? v * Math.pow(2, r * amount) : v + r * amount * (d.max - d.min);
  return Math.min(d.max, Math.max(d.min, next));
}

/** A nearby variant of `p`. `rand` returns values in [0, 1). */
export function varyParams(p: ParamValues, rand: () => number = Math.random): ParamValues {
  const out = { ...p };
  for (const [id, amount] of VARY) if (id in out) out[id] = nudge(id, out[id], amount, rand() * 2 - 1);
  for (let s = 1; s <= MOD_MATRIX_SIZE; s++) {
    const k = `mat${s}.amt`;
    if ((out[`mat${s}.src`] | 0) !== 0 && out[k]) out[k] = nudge(k, out[k], 0.05, rand() * 2 - 1);
  }
  return out;
}

// ---------- audition phrases ----------

// [semitones from the root, start beat, length in beats]. Root is A2 (MIDI 45).
export type PhraseNote = [number, number, number];
export const PHRASE_ROOT = 45;
export const PHRASES: Record<PresetRole, PhraseNote[]> = {
  bass: [[0, 0, 0.5], [0, 0.75, 0.25], [12, 1.5, 0.25], [3, 2, 0.5], [5, 3, 0.5]],
  lead: [[24, 0, 0.5], [27, 0.5, 0.5], [31, 1, 1], [29, 2.5, 0.5], [27, 3, 1]],
  pad: [[12, 0, 3.5], [15, 0, 3.5], [19, 0, 3.5], [22, 0, 3.5]],
  keys: [[12, 0, 0.4], [15, 0, 0.4], [19, 0, 0.4], [12, 1.5, 0.4], [15, 1.5, 0.4], [19, 1.5, 0.4], [10, 2.5, 0.8], [14, 2.5, 0.8], [17, 2.5, 0.8]],
  pluck: [[24, 0, 0.25], [31, 0.5, 0.25], [27, 1, 0.25], [34, 1.5, 0.25], [31, 2, 0.25], [27, 2.5, 0.25], [24, 3, 0.5]],
  fx: [[12, 0, 3]],
};
