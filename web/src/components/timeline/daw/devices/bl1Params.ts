/**
 * BL-1 parameters and the core `BassMidiInstrument` fields, both ways.
 *
 * The device plays the full FableSynth parameter record. The core fields
 * drive the server render, so every BL-1 param with a core counterpart is
 * written there, and only the params without one live in `fableParams`. The
 * record the device plays is defaults, then the values derived from the core
 * fields, then `fableParams`, so a document saved before BL-1 had a live
 * device opens with knobs that match its core fields.
 */

import type {
  BassMidiInstrument,
  MidiFilterType,
  MidiWavetableName
} from "@nodetool-ai/timeline";

import type { ParamValues } from "../fablesynth/params";
import { BASS_PARAMS, defaultBassParams } from "../fablesynth/bass/params";
import { FACTORY_PATCHES, patchToState } from "../fablesynth/bass/patches";

const TABLES: readonly MidiWavetableName[] = [
  "prime",
  "bloom",
  "pulse",
  "vox",
  "chime",
  "glitch"
];
const FILTERS: readonly MidiFilterType[] = ["lp12", "lp24", "bp12", "hp12", "notch"];

/** Octaves of filter sweep in the core render at `flt.env` = 1. */
export const BL1_ENV_OCTAVES = 4;
/** `master.volume` that plays at the core's -6 dB reference gain. */
const VOLUME_REF = 0.78;
const GAIN_REF_DB = -6;
const GAIN_FLOOR_DB = -60;

/** Upstream transport params: the timeline owns tempo and swing, so they are never stored. */
const TRANSPORT_PARAMS: ReadonlySet<string> = new Set(["seq.bpm", "master.swing"]);

/** Every BL-1 param written to a core field. The rest stay in `fableParams`. */
export const BL1_CORE_PARAMS: ReadonlySet<string> = new Set([
  "osc.table",
  "osc.pos",
  "osc.tune",
  "sub.shape",
  "sub.oct",
  "sub.level",
  "flt.type",
  "flt.cut",
  "flt.res",
  "flt.drive",
  "flt.env",
  "flt.track",
  "fenv.att",
  "fenv.dec",
  "aenv.att",
  "aenv.dec",
  "aenv.sus",
  "aenv.rel",
  "acc.amt",
  "acc.vel",
  "slide.time",
  "master.volume"
]);

/** Clamp a value into a param's declared range (and to an integer for int params). NaN becomes the param's default. */
export function clampBl1Param(id: string, value: number): number {
  const def = BASS_PARAMS[id];
  if (!def) return value;
  if (Number.isNaN(value)) return def.def;
  let v = value;
  if (def.min !== undefined && def.max !== undefined) {
    v = Math.min(def.max, Math.max(def.min, v));
  } else if (def.options) {
    v = Math.min(def.options.length - 1, Math.max(0, Math.round(v)));
  } else if (def.type === "bool") {
    v = v > 0.5 ? 1 : 0;
  }
  return def.curve === "int" ? Math.round(v) : v;
}

function volumeFromGainDb(gainDb: number): number {
  return VOLUME_REF * Math.pow(10, (gainDb - GAIN_REF_DB) / 40);
}

function gainDbFromVolume(volume: number): number {
  if (volume <= 0) return GAIN_FLOOR_DB;
  return Math.max(GAIN_FLOOR_DB, GAIN_REF_DB + 40 * Math.log10(volume / VOLUME_REF));
}

/** The BL-1 params a core instrument implies. */
export function bl1ParamsFromCore(inst: BassMidiInstrument): ParamValues {
  const raw: ParamValues = {
    "osc.table": Math.max(0, TABLES.indexOf(inst.table)),
    "osc.pos": inst.position,
    "osc.tune": inst.semitones,
    "sub.shape": inst.subShape === "square" ? 1 : 0,
    "sub.oct": inst.subOctave <= -2 ? -2 : -1,
    "sub.level": inst.subLevel,
    "flt.type": Math.max(0, FILTERS.indexOf(inst.filterType)),
    "flt.cut": inst.cutoffHz,
    "flt.res": inst.resonance,
    "flt.drive": inst.drive,
    "flt.env": inst.filterEnvAmount / BL1_ENV_OCTAVES,
    "flt.track": inst.keyTrack,
    "fenv.att": inst.filterAttackMs / 1000,
    "fenv.dec": inst.filterDecayMs / 1000,
    "aenv.att": inst.ampEnv.attackMs / 1000,
    "aenv.dec": inst.ampEnv.decayMs / 1000,
    "aenv.sus": inst.ampEnv.sustain,
    "aenv.rel": inst.ampEnv.releaseMs / 1000,
    "acc.amt": inst.accentAmount,
    "acc.vel": inst.accentVelocity,
    "slide.time": inst.slideMs / 1000,
    "master.volume": volumeFromGainDb(inst.gainDb)
  };
  const out: ParamValues = {};
  for (const [id, value] of Object.entries(raw)) {
    if (Number.isFinite(value)) out[id] = clampBl1Param(id, value);
  }
  return out;
}

/** The full record the device plays: defaults ⊕ core-derived ⊕ `fableParams`. */
export function bl1ParamRecord(inst: BassMidiInstrument): ParamValues {
  const out: ParamValues = { ...defaultBassParams(), ...bl1ParamsFromCore(inst) };
  for (const [id, value] of Object.entries(inst.fableParams ?? {})) {
    if (Number.isFinite(value) && id in BASS_PARAMS) out[id] = value;
  }
  return out;
}

/**
 * The instrument for a full param record: core fields from the params that
 * map to them, every other param in `fableParams`. Fields BL-1 has no param
 * for are kept from `inst`.
 */
export function bl1InstrumentFromParams(
  inst: BassMidiInstrument,
  params: ParamValues
): BassMidiInstrument {
  const p = { ...bl1ParamRecord(inst), ...params };
  const fableParams: Record<string, number> = {};
  for (const [id, value] of Object.entries(p)) {
    if (!BL1_CORE_PARAMS.has(id) && !TRANSPORT_PARAMS.has(id) && id in BASS_PARAMS) {
      fableParams[id] = value;
    }
  }
  return {
    ...inst,
    fableParams,
    table: TABLES[Math.round(p["osc.table"])] ?? inst.table,
    position: p["osc.pos"],
    semitones: Math.round(p["osc.tune"]),
    subShape: Math.round(p["sub.shape"]) === 1 ? "square" : "sine",
    subOctave: Math.round(p["sub.oct"]) <= -2 ? -2 : -1,
    subLevel: p["sub.level"],
    filterType: FILTERS[Math.round(p["flt.type"])] ?? inst.filterType,
    cutoffHz: p["flt.cut"],
    resonance: p["flt.res"],
    drive: p["flt.drive"],
    filterEnvAmount: p["flt.env"] * BL1_ENV_OCTAVES,
    keyTrack: p["flt.track"],
    filterAttackMs: p["fenv.att"] * 1000,
    filterDecayMs: p["fenv.dec"] * 1000,
    ampEnv: {
      attackMs: p["aenv.att"] * 1000,
      decayMs: p["aenv.dec"] * 1000,
      sustain: p["aenv.sus"],
      releaseMs: p["aenv.rel"] * 1000
    },
    accentAmount: p["acc.amt"],
    accentVelocity: Math.round(p["acc.vel"]),
    slideMs: p["slide.time"] * 1000,
    gainDb: gainDbFromVolume(p["master.volume"])
  };
}

/** One param changed, written through to the core field it maps to. */
export function setBl1Param(
  inst: BassMidiInstrument,
  id: string,
  value: number
): BassMidiInstrument {
  return bl1InstrumentFromParams(inst, { [id]: clampBl1Param(id, value) });
}

/** A factory patch's whole sound: every param not in the patch returns to its default. */
export function bl1FactoryPatchParams(index: number): ParamValues | null {
  const patch = FACTORY_PATCHES[index];
  return patch ? patchToState(patch).params : null;
}

/** The ids whose values differ between two records. */
export function changedBl1Params(prev: ParamValues, next: ParamValues): string[] {
  const out: string[] = [];
  for (const id of Object.keys(next)) {
    if (prev[id] !== next[id]) out.push(id);
  }
  return out;
}
