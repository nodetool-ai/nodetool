// DR-1 per-pad patches: save/load/switch a SINGLE pad's sound independent of
// kits. Factory entries contain only authored overrides on pad defaults; apply
// semantics are defaults ∪ overrides for every included field so a patch fully
// resets the pad. `out` and `choke` are routing/kit-level and never included.

import type { ParamValues } from '../params';
import { DRUM_PARAMS, PAD_FIELDS, pad } from './params';

export interface PadPatch {
  v: 1;
  name: string;                    // displayed uppercase, e.g. "BD DEEP"
  params: Record<string, number>;  // PAD-RELATIVE ids -> values (overrides)
}

// Fields excluded from patches everywhere (kit-level routing behavior).
const EXCLUDED = new Set(['out', 'choke']);

// FX belongs to the kit-wide channel strip, never an individual pad patch.
export const PATCH_FIELDS: string[] = PAD_FIELDS.filter((f) => !EXCLUDED.has(f) && !f.startsWith('fx.'));

// -- Factory bank -------------------------------------------------------------
// Table indices follow DRUM_TABLE_NAMES: THUD 0, CRACK 1, TINE 2, GRIT 3,
// PRIME 4, BLOOM 5, PULSE 6, VOX 7, CHIME 8, GLITCH 9, 808SD 10, 808CP 11,
// 808CH 12, 808OH 13, 808CY 14. Filter types: LP12 0, LP24 1, BP12 2, HP12 3.

const fp = (name: string, params: Record<string, number>): PadPatch => ({ v: 1, name, params });

export const FACTORY_PATCHES: PadPatch[] = [
  // Driven voices use compensated pad levels; slower COMP/OTT attacks retain
  // the initial hit. Hats, cymbals and the pure BD SUB keep their original sound.
  // Kicks — THUD body, pitch envelope does the punch.
  fp('BD DEEP', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.12, 'fx.ott.time': 1.8, 'fx.ott.up': 0.3, 'fx.ott.down': 0.65,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 0, 'oscA.tune': -26, 'penv.amt': 24, 'penv.dec': 0.05,
    'aenv.dec': 0.42, 'aenv.curve': 0.45, 'lvl': 0.6151, 'fx.reverb.on': 0,
  }),
  fp('BD PUNCH', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.6, 'fx.ott.up': 0.5, 'fx.ott.down': 0.8,
    'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.075, 'fx.comp.ratio': 3.5,
    'fx.drive.on': 1, 'fx.drive.amt': 0.22, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 0, 'oscA.tune': -19, 'penv.amt': 32, 'penv.dec': 0.028,
    'aenv.dec': 0.2, 'aenv.curve': 0.5, 'lvl': 0.5601, 'fx.reverb.on': 0,
  }),
  fp('BD SUB', {
    'oscA.table': 0, 'oscA.tune': -34, 'penv.amt': 20, 'penv.dec': 0.06,
    'aenv.dec': 0.95, 'aenv.hold': 0.02, 'aenv.curve': 0.3, 'lvl': 0.92, 'fx.reverb.on': 0,
  }),
  fp('BD 808', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.14, 'fx.ott.time': 1.8, 'fx.ott.up': 0.3, 'fx.ott.down': 0.65,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.14, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 0, 'oscA.tune': -24, 'penv.amt': 26, 'penv.dec': 0.075,
    'aenv.dec': 0.65, 'aenv.curve': 0.35, 'flt.on': 1, 'flt.type': 0,
    'flt.cut': 900, 'flt.drive': 0.35, 'lvl': 0.6271, 'fx.reverb.on': 0,
  }),
  // Snares — tonal crack plus a bright noise layer.
  fp('SD CRACK', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.28, 'fx.ott.time': 1.4, 'fx.ott.up': 0.65, 'fx.ott.down': 0.8,
    'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.09, 'fx.comp.ratio': 3.5,
    'fx.drive.on': 1, 'fx.drive.amt': 0.22, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 1, 'oscA.tune': -12, 'penv.amt': 5, 'penv.dec': 0.03,
    'noise.level': 0.5, 'noise.color': 0.3, 'aenv.dec': 0.18, 'lvl': 0.5144,
  }),
  fp('SD 808', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.2, 'fx.ott.time': 1.5, 'fx.ott.up': 0.5, 'fx.ott.down': 0.75,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.022, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.level': 0, 'oscB.table': 0, 'oscB.level': 0.9,
    'noise.level': 0.12, 'noise.color': 0.45, 'aenv.dec': 0.42, 'lvl': 0.6383,
  }),
  fp('SD RIM', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.16, 'fx.ott.time': 1.5, 'fx.ott.up': 0.4, 'fx.ott.down': 0.65,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.065, 'fx.comp.ratio': 2.5,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 1, 'oscA.tune': 0, 'penv.amt': 2, 'penv.dec': 0.015,
    'noise.level': 0.18, 'noise.color': 0.6, 'aenv.dec': 0.08, 'lvl': 0.5786,
  }),
  // Clap — sampled 808 clap with a room-friendly tail.
  fp('CP 808', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.18, 'fx.ott.time': 1.6, 'fx.ott.up': 0.45, 'fx.ott.down': 0.7,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.028, 'fx.comp.rel': 0.11, 'fx.comp.ratio': 2.5,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.level': 0, 'oscB.table': 1, 'oscB.level': 0.9,
    'aenv.hold': 0.02, 'aenv.dec': 0.65, 'aenv.curve': 0.4, 'lvl': 0.6042,
  }),
  // Hats — sampled 808 hats, high-passed to sit above the kit.
  fp('HH 808', {
    'oscA.level': 0, 'oscB.table': 2, 'oscB.level': 0.9, 'aenv.dec': 0.12, 'flt.on': 1, 'flt.type': 3,
    'flt.cut': 7200, 'ring.freq': 6389, 'ring.mix': 0.18, 'lvl': 0.7,
  }),
  fp('HH TIGHT', {
    'oscA.level': 0, 'oscB.table': 2, 'oscB.level': 0.9, 'aenv.dec': 0.055, 'flt.on': 1, 'flt.type': 3,
    'flt.cut': 9200, 'ring.freq': 7919, 'ring.mix': 0.22, 'lvl': 0.65,
  }),
  fp('OH 808', {
    'oscA.level': 0, 'oscB.table': 3, 'oscB.level': 0.9, 'aenv.dec': 0.55, 'flt.on': 1, 'flt.type': 3,
    'flt.cut': 5200, 'ring.freq': 5197, 'ring.mix': 0.28, 'lvl': 0.525,
  }),
  // Cymbal — long sizzle.
  fp('CY 808', {
    'oscA.level': 0, 'oscB.table': 4, 'oscB.level': 0.9,
    'aenv.dec': 1.7, 'aenv.curve': 0.25, 'flt.on': 1,
    'flt.type': 3, 'flt.cut': 3800, 'ring.freq': 2741, 'ring.mix': 0.62,
    'lvl': 0.72,
  }),
  // Toms — THUD tuned across the range with a modest pitch sweep.
  fp('TM LO', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.16, 'fx.ott.time': 1.6, 'fx.ott.up': 0.4, 'fx.ott.down': 0.7,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 0, 'oscA.tune': -19, 'penv.amt': 12, 'penv.dec': 0.07,
    'aenv.dec': 0.28, 'lvl': 0.5809,
  }),
  fp('TM MID', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.18, 'fx.ott.time': 1.6, 'fx.ott.up': 0.45, 'fx.ott.down': 0.7,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.024, 'fx.comp.rel': 0.1, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 0, 'oscA.tune': -12, 'penv.amt': 10, 'penv.dec': 0.06,
    'aenv.dec': 0.24, 'lvl': 0.5812,
  }),
  fp('TM HI', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.18, 'fx.ott.time': 1.6, 'fx.ott.up': 0.45, 'fx.ott.down': 0.7,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.022, 'fx.comp.rel': 0.09, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 0, 'oscA.tune': -5, 'penv.amt': 8, 'penv.dec': 0.05,
    'aenv.dec': 0.2, 'lvl': 0.5858,
  }),
  // Perc / vox / glitch flavors. The fixed-Hz ring carrier creates
  // inharmonic sidebands, avoiding the cartoonish pitched-table character.
  fp('PC TINE', {
    'oscA.table': 2, 'oscA.tune': 7, 'oscA.fine': -5, 'ring.freq': 1187,
    'ring.mix': 0.62, 'aenv.dec': 0.42, 'aenv.curve': 0.28, 'lvl': 0.75,
  }),
  fp('PC BELL', {
    'oscA.table': 8, 'oscA.tune': -5, 'oscA.level': 0.7, 'ring.freq': 731,
    'ring.mix': 0.78, 'aenv.att': 0.0005, 'aenv.hold': 0.018,
    'aenv.dec': 1.35, 'aenv.curve': 0.2, 'flt.on': 1, 'flt.type': 2,
    'flt.cut': 2400, 'flt.res': 0.35, 'lvl': 0.78,
  }),
  fp('PC CYMBAL', {
    'oscA.table': 3, 'oscA.pos': 0.38, 'oscA.tune': 17, 'noise.level': 0.22,
    'noise.color': 0.75, 'ring.freq': 3271, 'ring.mix': 0.88,
    'aenv.hold': 0.014, 'aenv.dec': 1.6, 'aenv.curve': 0.24,
    'flt.on': 1, 'flt.type': 3, 'flt.cut': 3600, 'lvl': 0.72,
  }),
  fp('PC VOX', {
    'oscA.table': 7, 'oscA.tune': -5, 'aenv.dec': 0.48, 'aenv.curve': 0.3,
    'lvl': 0.78,
  }),
  fp('PC GLITCH', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.32, 'fx.ott.time': 1.1, 'fx.ott.up': 0.8, 'fx.ott.down': 0.8,
    'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.08, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.22, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 3, 'oscA.tune': -12, 'oscA.pos': 0.5, 'penv.amt': 9,
    'penv.dec': 0.04, 'aenv.dec': 0.22, 'lvl': 0.4131,
  }),
  // Hybrid voices — procedural transient/body layered with the new raw banks.
  fp('HX BD UZU', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.18, 'fx.ott.time': 1.7, 'fx.ott.up': 0.4, 'fx.ott.down': 0.7,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 0, 'oscA.tune': -26, 'oscA.level': 0.50,
    'oscB.table': 16, 'oscB.level': 0.72, 'penv.amt': 22, 'penv.dec': 0.045,
    'aenv.dec': 0.60, 'flt.on': 1, 'flt.type': 0, 'flt.cut': 1400, 'lvl': 0.6367, 'fx.reverb.on': 0,
  }),
  fp('HX BD 808', {
    'oscA.table': 0, 'oscA.tune': -31, 'oscA.level': 0.45,
    'oscB.table': 5, 'oscB.level': 0.68, 'penv.amt': 18, 'penv.dec': 0.055,
    'aenv.dec': 0.72, 'flt.on': 1, 'flt.type': 0, 'flt.cut': 1100, 'lvl': 0.92, 'fx.reverb.on': 0,
  }),
  fp('HX SD UZU', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.5, 'fx.ott.up': 0.55, 'fx.ott.down': 0.8,
    'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.024, 'fx.comp.rel': 0.11, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 1, 'oscA.tune': -12, 'oscA.level': 0.42,
    'oscB.table': 18, 'oscB.level': 0.70, 'noise.level': 0.16,
    'aenv.dec': 0.50, 'flt.on': 1, 'flt.type': 3, 'flt.cut': 900, 'lvl': 0.5877,
  }),
  fp('HX CP CROSS', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.2, 'fx.ott.time': 1.6, 'fx.ott.up': 0.5, 'fx.ott.down': 0.7,
    'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.028, 'fx.comp.rel': 0.11, 'fx.comp.ratio': 2.5,
    'fx.drive.on': 1, 'fx.drive.amt': 0.14, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 1, 'oscA.tune': 7, 'oscA.level': 0.25,
    'oscB.table': 1, 'oscB.level': 0.76, 'noise.level': 0.12,
    'aenv.hold': 0.02, 'aenv.dec': 0.70, 'lvl': 0.5711,
  }),
  fp('HX RIM', {
    'oscA.table': 2, 'oscA.tune': 19, 'oscA.level': 0.40,
    'oscB.table': 20, 'oscB.level': 0.65, 'ring.freq': 1831, 'ring.mix': 0.34,
    'aenv.dec': 0.20, 'flt.on': 1, 'flt.type': 2, 'flt.cut': 2900, 'lvl': 0.78,
  }),
  fp('HX HH', {
    'oscA.table': 3, 'oscA.tune': 24, 'oscA.level': 0.18,
    'oscB.table': 21, 'oscB.level': 0.76, 'ring.freq': 6389, 'ring.mix': 0.24,
    'aenv.dec': 0.15, 'flt.on': 1, 'flt.type': 3, 'flt.cut': 6900, 'lvl': 0.68,
  }),
  fp('HX OH', {
    'oscA.table': 3, 'oscA.tune': 17, 'oscA.level': 0.16,
    'oscB.table': 3, 'oscB.level': 0.76, 'ring.freq': 5197, 'ring.mix': 0.26,
    'aenv.dec': 0.70, 'flt.on': 1, 'flt.type': 3, 'flt.cut': 4800, 'lvl': 0.70,
  }),
  fp('HX RD', {
    'oscA.table': 8, 'oscA.tune': 7, 'oscA.level': 0.12,
    'oscB.table': 23, 'oscB.level': 0.72, 'ring.freq': 2741, 'ring.mix': 0.38,
    'aenv.dec': 1.20, 'flt.on': 1, 'flt.type': 3, 'flt.cut': 3300, 'lvl': 0.70,
  }),
  fp('HX LT', {
    'oscA.table': 0, 'oscA.tune': -19, 'oscA.level': 0.45,
    'oscB.table': 13, 'oscB.level': 0.66, 'penv.amt': 8, 'penv.dec': 0.065,
    'aenv.dec': 0.60, 'lvl': 0.84,
  }),
  fp('HX MT', {
    'oscA.table': 0, 'oscA.tune': -12, 'oscA.level': 0.42,
    'oscB.table': 25, 'oscB.level': 0.68, 'penv.amt': 7, 'penv.dec': 0.055,
    'aenv.dec': 0.60, 'lvl': 0.84,
  }),
  fp('HX HT', {
    'oscA.table': 0, 'oscA.tune': -5, 'oscA.level': 0.40,
    'oscB.table': 15, 'oscB.level': 0.68, 'penv.amt': 6, 'penv.dec': 0.05,
    'aenv.dec': 0.60, 'lvl': 0.84,
  }),
  fp('HX CR', {
    'oscA.table': 3, 'oscA.pos': 0.38, 'oscA.tune': 17, 'oscA.level': 0.12,
    'oscB.table': 27, 'oscB.level': 0.72, 'ring.freq': 3271, 'ring.mix': 0.48,
    'aenv.dec': 1.20, 'flt.on': 1, 'flt.type': 3, 'flt.cut': 3200, 'lvl': 0.70,
  }),
  fp('HX CB', {
    'oscA.table': 8, 'oscA.tune': -5, 'oscA.level': 0.25,
    'oscB.table': 7, 'oscB.level': 0.62, 'ring.freq': 731, 'ring.mix': 0.42,
    'aenv.dec': 0.50, 'flt.on': 1, 'flt.type': 2, 'flt.cut': 2400, 'lvl': 0.76,
  }),
  fp('HX SH', {
    'oscA.table': 2, 'oscA.tune': 24, 'oscA.level': 0.22,
    'oscB.table': 29, 'oscB.level': 0.70, 'noise.level': 0.14,
    'aenv.dec': 0.10, 'flt.on': 1, 'flt.type': 3, 'flt.cut': 6200, 'lvl': 0.70,
  }),
  fp('HX TB', {
    'oscA.table': 7, 'oscA.tune': -5, 'oscA.level': 0.30,
    'oscB.table': 30, 'oscB.level': 0.66, 'ring.freq': 1187, 'ring.mix': 0.28,
    'aenv.dec': 0.60, 'flt.on': 1, 'flt.type': 2, 'flt.cut': 1800, 'lvl': 0.76,
  }),
  fp('HX MOD', {
    'fx.ott.on': 1, 'fx.ott.depth': 0.3, 'fx.ott.time': 1.2, 'fx.ott.up': 0.75, 'fx.ott.down': 0.8,
    'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.09, 'fx.comp.ratio': 3,
    'fx.drive.on': 1, 'fx.drive.amt': 0.22, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
    'oscA.table': 9, 'oscA.pos': 0.55, 'oscA.tune': -12, 'oscA.level': 0.35,
    'oscB.table': 31, 'oscB.level': 0.68, 'ring.freq': 2203, 'ring.mix': 0.32,
    'aenv.dec': 0.25, 'flt.on': 1, 'flt.type': 2, 'flt.cut': 2600, 'lvl': 0.4553,
  }),
];

// -- Apply / extract ----------------------------------------------------------

// Absolute id->value entries that apply `patch` to pad `padI`: defaults ∪
// overrides for every included field. `out`/`choke` are untouched (not
// returned), so their current values in `params` survive.
export function applyPatchToParams(
  _params: ParamValues,
  padI: number,
  patch: PadPatch,
): Record<string, number> {
  const entries: Record<string, number> = {};
  for (const field of PATCH_FIELDS) {
    const id = pad(padI, field);
    entries[id] = patch.params[field] ?? DRUM_PARAMS[id].def;
  }
  return entries;
}

// Snapshot pad `padI`'s current sound as a patch (all included fields).
export function extractPatch(params: ParamValues, padI: number, name: string): PadPatch {
  const patch: PadPatch = { v: 1, name, params: {} };
  for (const field of PATCH_FIELDS) {
    const id = pad(padI, field);
    patch.params[field] = params[id] ?? DRUM_PARAMS[id].def;
  }
  return patch;
}

// -- User patch persistence (same resilience pattern as kits.ts) --------------

const LS_KEY = 'fable-dr-patches';
const memoryStorage = new Map<string, string>();

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryStorage.set(key, value);
  }
}

export function loadUserPatches(): PadPatch[] {
  try {
    const parsed = JSON.parse(readStored(LS_KEY) as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserPatch(name: string, patch: PadPatch): PadPatch[] {
  const list = loadUserPatches().filter((entry) => entry.name !== name);
  list.push({ ...patch, name });
  writeStored(LS_KEY, JSON.stringify(list));
  return list;
}

// -- Options (factory then user, value keys f0…/u0… like kitOptions) ----------

export interface PatchOption {
  value: string;
  name: string;
  group: 'FACTORY' | 'USER';
}

export function patchOptions(userPatches: PadPatch[]): PatchOption[] {
  const options: PatchOption[] = FACTORY_PATCHES.map((patch, i) => ({
    value: `f${i}`,
    name: patch.name,
    group: 'FACTORY' as const,
  }));
  userPatches.forEach((patch, i) => options.push({ value: `u${i}`, name: patch.name, group: 'USER' }));
  return options;
}
