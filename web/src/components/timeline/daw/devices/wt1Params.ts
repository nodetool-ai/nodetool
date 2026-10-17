/**
 * FableSynth WT-1 parameters ⇄ the timeline's `WavetableMidiInstrument`.
 *
 * The live device plays the full WT-1 parameter record. The document keeps
 * the core fields (oscillators, sub, noise, filter, envelopes, gain) because
 * the server render reads them, and stores every other WT-1 parameter that
 * differs from its default in `instrument.fableParams`.
 *
 * Reading resolves `defaults ⊕ fableParams` and then lets the core fields win
 * wherever they disagree with what those params map to: a document written
 * before WT-1 had a UI (core fields only) opens with matching knobs, and an
 * edit made to a core field elsewhere is not hidden by a stale fableParams
 * entry.
 */

import type {
  MidiEnvelope,
  MidiFilterType,
  MidiWavetableName,
  WavetableMidiInstrument,
  WavetableOscillator
} from "@nodetool-ai/timeline";

import { defaultParams, PARAMS, type ParamValues } from "../fablesynth/params";

export type Wt1CoreFields = Omit<WavetableMidiInstrument, "type" | "fableParams">;

const TABLES: readonly MidiWavetableName[] = ["prime", "bloom", "pulse", "vox", "chime", "glitch"];
/** WT-1 filter types by index. COMB and VOWEL (5, 6) have no core equivalent. */
const FILTERS: readonly MidiFilterType[] = ["lp12", "lp24", "bp12", "hp12", "notch"];
/** The core voice's level at the default WT-1 output volume. */
const GAIN_DB_AT_DEFAULT_VOLUME = -8;
const DEFAULT_VOLUME = 0.75;
const ENV_OCTAVES = 4;
const MAX_CORE_UNISON = 7;
const EPS = 1e-6;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const near = (a: number, b: number, tol = 1e-4): boolean =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function clampParam(id: string, v: number): number {
  const def = PARAMS[id];
  if (!def || def.min === undefined || def.max === undefined) return v;
  return clamp(v, def.min, def.max);
}

function oscFromParams(p: ParamValues, prefix: "oscA" | "oscB"): WavetableOscillator {
  const on = p[`${prefix}.on`] > 0.5;
  const table = TABLES[Math.round(p[`${prefix}.table`])] ?? "prime";
  return {
    table,
    position: clamp(p[`${prefix}.pos`], 0, 1),
    semitones: Math.round(p[`${prefix}.oct`]) * 12 + Math.round(p[`${prefix}.semi`]),
    fine: p[`${prefix}.fine`],
    level: on ? clamp(p[`${prefix}.level`], 0, 1) : 0,
    unison: clamp(Math.round(p[`${prefix}.unison`]), 1, MAX_CORE_UNISON),
    detune: clamp(p[`${prefix}.detune`], 0, 1)
  };
}

function envFromParams(p: ParamValues, prefix: "env1" | "env2"): MidiEnvelope {
  return {
    attackMs: p[`${prefix}.a`] * 1000,
    decayMs: p[`${prefix}.d`] * 1000,
    sustain: clamp(p[`${prefix}.s`], 0, 1),
    releaseMs: p[`${prefix}.r`] * 1000
  };
}

/** The core fields a WT-1 parameter record maps to. */
export function wt1CoreFromParams(p: ParamValues): Wt1CoreFields {
  const filterOn = p["filter.on"] > 0.5;
  const filterIndex = Math.round(p["filter.type"]);
  const volume = clamp(p["master.volume"], 0, 1);
  return {
    oscA: oscFromParams(p, "oscA"),
    oscB: oscFromParams(p, "oscB"),
    subLevel: p["sub.on"] > 0.5 ? clamp(p["sub.level"], 0, 1) : 0,
    subOctave: Math.round(p["sub.oct"]) <= -2 ? -2 : -1,
    noiseLevel: p["noise.on"] > 0.5 ? clamp(p["noise.level"], 0, 1) : 0,
    // A bypassed filter is a wide-open lowpass for the core voice.
    filterType: filterOn ? FILTERS[filterIndex] ?? "lp24" : "lp12",
    cutoffHz: filterOn ? p["filter.cutoff"] : 20000,
    resonance: filterOn ? clamp(p["filter.res"], 0, 1) : 0,
    drive: filterOn ? clamp(p["filter.drive"], 0, 1) : 0,
    filterEnvAmount: filterOn ? p["filter.env"] * ENV_OCTAVES : 0,
    keyTrack: filterOn ? clamp(p["filter.key"], 0, 1) : 0,
    ampEnv: envFromParams(p, "env1"),
    modEnv: envFromParams(p, "env2"),
    gainDb:
      volume <= EPS
        ? -96
        : GAIN_DB_AT_DEFAULT_VOLUME + 40 * Math.log10(volume / DEFAULT_VOLUME)
  };
}

type CoreKey = keyof Wt1CoreFields;

function sameOsc(a: WavetableOscillator, b: WavetableOscillator): boolean {
  return (
    a.table === b.table &&
    near(a.position, b.position) &&
    near(a.semitones, b.semitones) &&
    near(a.fine, b.fine) &&
    near(a.level, b.level) &&
    near(a.unison, b.unison) &&
    near(a.detune, b.detune)
  );
}

function sameEnv(a: MidiEnvelope, b: MidiEnvelope): boolean {
  return (
    near(a.attackMs, b.attackMs) &&
    near(a.decayMs, b.decayMs) &&
    near(a.sustain, b.sustain) &&
    near(a.releaseMs, b.releaseMs)
  );
}

function sameField(key: CoreKey, a: Wt1CoreFields, b: Wt1CoreFields): boolean {
  switch (key) {
    case "oscA":
    case "oscB":
      return sameOsc(a[key], b[key]);
    case "ampEnv":
    case "modEnv":
      return sameEnv(a[key], b[key]);
    case "filterType":
      return a.filterType === b.filterType;
    case "gainDb":
      return near(a.gainDb, b.gainDb, 1e-3);
    default:
      return near(a[key], b[key]);
  }
}

/** Write one core field into a parameter record (in place). */
function applyCoreField(p: ParamValues, key: CoreKey, core: Wt1CoreFields): void {
  const set = (id: string, v: number) => {
    if (Number.isFinite(v)) p[id] = clampParam(id, v);
  };
  switch (key) {
    case "oscA":
    case "oscB": {
      const o = core[key];
      const table = TABLES.indexOf(o.table);
      // A user table (index past the factory set) stays when the core names
      // the factory table it falls back to.
      if (table >= 0 && !(p[`${key}.table`] >= TABLES.length && table === 0)) {
        set(`${key}.table`, table);
      }
      set(`${key}.pos`, o.position);
      const oct = clamp(Math.round(o.semitones / 12), -3, 3);
      set(`${key}.oct`, oct);
      set(`${key}.semi`, Math.round(o.semitones - oct * 12));
      set(`${key}.fine`, o.fine);
      set(`${key}.on`, o.level > EPS ? 1 : 0);
      if (o.level > EPS) set(`${key}.level`, o.level);
      // The rack allows up to 16 voices; the core only up to 7.
      if (!(o.unison === MAX_CORE_UNISON && p[`${key}.unison`] > MAX_CORE_UNISON)) {
        set(`${key}.unison`, o.unison);
      }
      set(`${key}.detune`, o.detune);
      return;
    }
    case "subLevel":
      set("sub.on", core.subLevel > EPS ? 1 : 0);
      if (core.subLevel > EPS) set("sub.level", core.subLevel);
      return;
    case "subOctave":
      set("sub.oct", core.subOctave <= -2 ? -2 : -1);
      return;
    case "noiseLevel":
      set("noise.on", core.noiseLevel > EPS ? 1 : 0);
      if (core.noiseLevel > EPS) set("noise.level", core.noiseLevel);
      return;
    case "filterType": {
      set("filter.on", 1);
      set("filter.type", Math.max(0, FILTERS.indexOf(core.filterType)));
      return;
    }
    case "cutoffHz":
      set("filter.on", 1);
      set("filter.cutoff", core.cutoffHz);
      return;
    case "resonance":
      set("filter.on", 1);
      set("filter.res", core.resonance);
      return;
    case "drive":
      set("filter.on", 1);
      set("filter.drive", core.drive);
      return;
    case "filterEnvAmount":
      set("filter.on", 1);
      set("filter.env", core.filterEnvAmount / ENV_OCTAVES);
      return;
    case "keyTrack":
      set("filter.on", 1);
      set("filter.key", core.keyTrack);
      return;
    case "ampEnv":
    case "modEnv": {
      const env = core[key];
      const prefix = key === "ampEnv" ? "env1" : "env2";
      set(`${prefix}.a`, env.attackMs / 1000);
      set(`${prefix}.d`, env.decayMs / 1000);
      set(`${prefix}.s`, env.sustain);
      set(`${prefix}.r`, env.releaseMs / 1000);
      return;
    }
    case "gainDb":
      set(
        "master.volume",
        DEFAULT_VOLUME * Math.pow(10, (core.gainDb - GAIN_DB_AT_DEFAULT_VOLUME) / 40)
      );
      return;
  }
}

const CORE_KEYS: readonly CoreKey[] = [
  "oscA",
  "oscB",
  "subLevel",
  "subOctave",
  "noiseLevel",
  "filterType",
  "cutoffHz",
  "resonance",
  "drive",
  "filterEnvAmount",
  "keyTrack",
  "ampEnv",
  "modEnv",
  "gainDb"
];

/** The full WT-1 parameter record an instrument plays. */
export function wt1ParamsFromInstrument(instrument: WavetableMidiInstrument): ParamValues {
  const params = defaultParams();
  for (const [id, v] of Object.entries(instrument.fableParams ?? {})) {
    if (id in params && Number.isFinite(v)) params[id] = v;
  }
  let derived = wt1CoreFromParams(params);
  for (const key of CORE_KEYS) {
    if (instrument[key] === undefined || sameField(key, derived, instrument)) continue;
    applyCoreField(params, key, instrument);
    // The filter fields share `filter.on`: switching it on changes what the
    // remaining filter fields derive to.
    derived = wt1CoreFromParams(params);
  }
  // Re-check every field once the filter is on (a later field can turn it on).
  for (const key of CORE_KEYS) {
    if (instrument[key] !== undefined && !sameField(key, derived, instrument)) {
      applyCoreField(params, key, instrument);
      derived = wt1CoreFromParams(params);
    }
  }
  return params;
}

/** The parameters that differ from their defaults: what `fableParams` stores. */
export function wt1ParamDiff(params: ParamValues): Record<string, number> {
  const defaults = defaultParams();
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(params)) {
    if (id in defaults && Number.isFinite(v) && v !== defaults[id]) out[id] = v;
  }
  return out;
}

/** The instrument after a WT-1 edit: core fields and fableParams both follow `params`. */
export function wt1InstrumentWithParams(
  instrument: WavetableMidiInstrument,
  params: ParamValues
): WavetableMidiInstrument {
  return {
    ...instrument,
    ...wt1CoreFromParams(params),
    type: "wavetable",
    fableParams: wt1ParamDiff(params)
  };
}
