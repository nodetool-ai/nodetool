// DR-1 browser model for kits and pad patches: entries, glyph data, pad-patch
// variations, and the short grooves that audition them. Filtering and
// favorites are shared (shared/presetBrowser.ts); the UI lives in
// components/browser.

import type { ParamValues } from '../params';
import type { BrowserItem } from '../shared/presetBrowser';
import { FACTORY_KITS, kitToState, type Kit } from './kits';
import { factoryKitTags, type KitCharacter, type KitRole } from './kitTags';
import { DRUM_PARAMS, pad } from './params';
import { FACTORY_PATCHES, PATCH_FIELDS, type PadPatch } from './patches';
import { factoryPatchTags, type PatchCharacter, type PatchRole } from './patchTags';

// ---------- glyph data ----------

export interface AmpEnv { att: number; hold: number; dec: number; curve: number }

/** Pad patch fingerprint: pitch env, amp env, filter, tone vs noise. */
export interface PadGlyphData {
  penvAmt: number; // semitones
  penvDec: number;
  amp: AmpEnv;
  filterOn: boolean;
  filterType: number; // DRUM_FILTER_TYPES index
  cutoff: number; // Hz
  res: number;
  mix: [number, number, number, number]; // osc, sample, noise, ring levels 0..1
}

/** Kit fingerprint: kick, snare and hat decays plus the three tom tunings. */
export interface KitGlyphData {
  voices: [AmpEnv, AmpEnv, AmpEnv];
  toms: [number, number, number]; // semitones
}

// Every factory kit keeps these slots (see kits.ts: core slots).
const KIT_VOICE_PADS = [0, 2, 5] as const;
const KIT_TOM_PADS = [8, 9, 10] as const;

const ampEnv = (get: (field: string) => number): AmpEnv =>
  ({ att: get('aenv.att'), hold: get('aenv.hold'), dec: get('aenv.dec'), curve: get('aenv.curve') });

export function padGlyphData(get: (field: string) => number): PadGlyphData {
  return {
    penvAmt: get('penv.amt'),
    penvDec: get('penv.dec'),
    amp: ampEnv(get),
    filterOn: get('flt.on') >= 0.5,
    filterType: get('flt.type') | 0,
    cutoff: get('flt.cut'),
    res: get('flt.res'),
    mix: [get('oscA.level'), get('oscB.level'), get('noise.level'), get('ring.mix')],
  };
}

export const padGlyphFromParams = (params: ParamValues, padI: number): PadGlyphData =>
  padGlyphData((f) => params[pad(padI, f)] ?? DRUM_PARAMS[pad(padI, f)].def);

export const kitGlyphData = (params: ParamValues): KitGlyphData => ({
  voices: KIT_VOICE_PADS.map((p) => ampEnv((f) => params[pad(p, f)] ?? DRUM_PARAMS[pad(p, f)].def)) as KitGlyphData['voices'],
  toms: KIT_TOM_PADS.map((p) => params[pad(p, 'oscA.tune')] ?? 0) as KitGlyphData['toms'],
});

// ---------- entries ----------

export interface KitEntry extends BrowserItem {
  role: KitRole | null;
  tags: KitCharacter[];
  glyph: KitGlyphData;
}

export interface PatchEntry extends BrowserItem {
  role: PatchRole | null;
  tags: PatchCharacter[];
  /** Pad-relative values for every patch field (defaults filled in). */
  fields: Record<string, number>;
  glyph: PadGlyphData;
}

export function kitEntries(userKits: Kit[]): KitEntry[] {
  const entry = (k: Kit, value: string, user: boolean): KitEntry => {
    const t = user ? null : factoryKitTags(k.name);
    return { value, name: k.name, user, role: t?.role ?? null, tags: t?.tags ?? [], glyph: kitGlyphData(kitToState(k).params) };
  };
  return [
    ...FACTORY_KITS.map((k, i) => entry(k, 'f' + i, false)),
    ...userKits.map((k, i) => entry(k, 'u' + i, true)),
  ];
}

/** A patch's value for every patch field: its overrides over the pad defaults. */
export function resolvePatchFields(patch: PadPatch): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of PATCH_FIELDS) out[f] = patch.params[f] ?? DRUM_PARAMS[pad(0, f)].def;
  return out;
}

export function patchEntries(userPatches: PadPatch[]): PatchEntry[] {
  const entry = (p: PadPatch, value: string, user: boolean): PatchEntry => {
    const t = user ? null : factoryPatchTags(p.name);
    const fields = resolvePatchFields(p);
    return { value, name: p.name, user, role: t?.role ?? null, tags: t?.tags ?? [], fields, glyph: padGlyphData((f) => fields[f]) };
  };
  return [
    ...FACTORY_PATCHES.map((p, i) => entry(p, 'f' + i, false)),
    ...userPatches.map((p, i) => entry(p, 'u' + i, true)),
  ];
}

// ---------- vary ----------

// [field, amount]. Log params move by up to ±amount octaves; linear params move
// by up to ±amount of their range. Only timbre moves: level, pan, routing,
// choke, sample choice, and FX stay fixed so a variant keeps its place in a kit.
const VARY: [string, number][] = [
  ['oscA.fine', 0.04], ['oscB.fine', 0.04],
  ['aenv.dec', 0.3], ['aenv.hold', 0.05],
  ['penv.amt', 0.05], ['penv.dec', 0.3],
  ['flt.cut', 0.5], ['flt.res', 0.06],
  ['noise.color', 0.06],
];

function nudge(id: string, v: number, amount: number, r: number): number {
  const d = DRUM_PARAMS[id];
  if (!d || d.min === undefined || d.max === undefined) return v;
  let next = d.curve === 'log' ? v * Math.pow(2, r * amount) : v + r * amount * (d.max - d.min);
  if (d.curve === 'int') next = Math.round(next);
  return Math.min(d.max, Math.max(d.min, next));
}

/**
 * Absolute `pad<padI>.<field>` values for a nearby variant of `fields` (a patch
 * resolved by resolvePatchFields). Covers every patch field, so applying the
 * result replaces the pad's sound with the variant. `rand` returns [0, 1).
 */
export function varyPadParams(fields: Record<string, number>, padI: number, rand: () => number = Math.random): Record<string, number> {
  const out = { ...fields };
  for (const [f, amount] of VARY) {
    if (!(f in out)) continue;
    // A parameter the sound does not use would add something new, not vary it.
    if (f.startsWith('oscB.') && !out['oscB.level']) continue;
    if (f.startsWith('oscA.') && !out['oscA.level']) continue;
    if (f === 'noise.color' && !out['noise.level']) continue;
    if (f.startsWith('flt.') && !out['flt.on']) continue;
    if (f === 'penv.amt' && !out['penv.amt']) continue;
    out[f] = nudge(pad(padI, f), out[f], amount, rand() * 2 - 1);
  }
  return Object.fromEntries(Object.entries(out).map(([f, v]) => [pad(padI, f), v]));
}

// ---------- audition ----------

/** [pad, step (sixteenths), velocity] for a one-bar kit groove. */
export type GrooveHit = [number, number, number];
export const KIT_GROOVE: GrooveHit[] = [
  [0, 0, 1], [0, 7, 0.8], [0, 10, 0.9],
  [2, 4, 1], [2, 12, 1],
  ...[0, 2, 4, 6, 8, 10, 12].map((s): GrooveHit => [5, s, s % 4 === 0 ? 0.85 : 0.55]),
  [6, 14, 0.7],
];

/** [beat, velocity] hits of the selected pad. */
export const PAD_HITS: [number, number][] = [[0, 0.9], [1, 0.65], [2, 1]];
