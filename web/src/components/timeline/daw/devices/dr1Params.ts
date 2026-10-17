/**
 * DR-1 parameters and the timeline's `DrumMidiInstrument`, mapped both ways.
 *
 * The device runs on the full FableSynth record (`pad<i>.*` plus the group
 * strip). The core fields (`pads`, `gainDb`) are what the server render
 * plays, so every edit writes both, and a document written before
 * `fableParams` existed opens with knobs that match its pads.
 *
 * `instrument.fableParams` holds only the values that differ from the DR-1
 * defaults. When a core field disagrees with what `fableParams` implies (an
 * older document, or an edit made through the core fields alone), the core
 * field wins for the params it maps to.
 */

import type { DrumMidiInstrument, DrumPad, MidiFilterType } from "@nodetool-ai/timeline";

import type { ParamValues } from "../fablesynth/params";
import {
  defaultDrumParams,
  DRUM_PARAMS,
  DRUM_TABLE_NAMES,
  pad,
  PAD_COUNT
} from "../fablesynth/drum/params";
import { FACTORY_KITS, kitToState } from "../fablesynth/drum/kits";

const CORE_TABLES: readonly DrumPad["table"][] = [
  "thud",
  "crack",
  "tine",
  "grit",
  "prime",
  "bloom",
  "pulse",
  "vox",
  "chime",
  "glitch"
];

/** The core render has no 808 resynthesized tables: each plays its nearest procedural one. */
const SAMPLED_TABLE_FALLBACK: Record<string, DrumPad["table"]> = {
  "808SD": "crack",
  "808CP": "crack",
  "808CH": "tine",
  "808OH": "tine",
  "808CY": "tine"
};

const FILTER_TYPES: readonly MidiFilterType[] = ["lp12", "lp24", "bp12", "hp12", "notch"];

/** `master.volume` is a squared fader with 1.6x headroom in the worklet. */
const VOLUME_HEADROOM = 1.6;

let defaults: ParamValues | null = null;

/** DR-1's own parameter defaults, shared and read-only. */
export function dr1Defaults(): Readonly<ParamValues> {
  defaults ??= defaultDrumParams();
  return defaults;
}

function clampParam(id: string, value: number): number {
  const def = DRUM_PARAMS[id];
  if (!def || def.min === undefined || def.max === undefined) return value;
  return Math.min(def.max, Math.max(def.min, value));
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function defaultPadName(i: number): string {
  return `PAD ${String(i + 1).padStart(2, "0")}`;
}

function coreTable(index: number): DrumPad["table"] {
  const i = Math.max(0, Math.round(index));
  if (i < CORE_TABLES.length) return CORE_TABLES[i];
  return SAMPLED_TABLE_FALLBACK[DRUM_TABLE_NAMES[i] ?? ""] ?? "thud";
}

/** The core pad the params of pad `i` describe. */
export function dr1PadFromParams(params: ParamValues, i: number, name: string): DrumPad {
  const p = (field: string): number => params[pad(i, field)] ?? dr1Defaults()[pad(i, field)];
  return {
    name,
    table: coreTable(p("oscA.table")),
    position: p("oscA.pos"),
    semitones: p("oscA.tune") + p("oscA.fine") / 100,
    pitchEnvAmount: p("penv.amt"),
    pitchEnvDecayMs: p("penv.dec") * 1000,
    noiseLevel: p("noise.level"),
    noiseColor: p("noise.color"),
    ringHz: p("ring.freq"),
    ringMix: p("ring.mix"),
    attackMs: p("aenv.att") * 1000,
    holdMs: p("aenv.hold") * 1000,
    decayMs: p("aenv.dec") * 1000,
    curve: p("aenv.curve"),
    filter:
      p("flt.on") >= 0.5
        ? {
            type: FILTER_TYPES[Math.round(p("flt.type"))] ?? "lp12",
            cutoffHz: p("flt.cut"),
            resonance: p("flt.res")
          }
        : null,
    level: p("lvl"),
    velocityToLevel: p("v2l")
  };
}

export function dr1GainDbFromParams(params: ParamValues): number {
  const volume = params["master.volume"] ?? dr1Defaults()["master.volume"];
  const gain = volume * volume * VOLUME_HEADROOM;
  return gain > 0 ? 20 * Math.log10(gain) : -96;
}

function volumeFromGainDb(gainDb: number): number {
  return Math.sqrt(10 ** (gainDb / 20) / VOLUME_HEADROOM);
}

type PadField = Exclude<keyof DrumPad, "name">;

/** Writes one core pad field into the params it maps to. */
function applyPadField(params: ParamValues, i: number, field: PadField, core: DrumPad): void {
  const set = (id: string, value: number) => {
    params[pad(i, id)] = clampParam(pad(i, id), value);
  };
  switch (field) {
    case "table": {
      const index = CORE_TABLES.indexOf(core.table);
      if (index >= 0) set("oscA.table", index);
      return;
    }
    case "position": return set("oscA.pos", core.position);
    case "semitones": {
      const tune = Math.round(core.semitones);
      set("oscA.tune", tune);
      set("oscA.fine", Math.round((core.semitones - tune) * 100));
      return;
    }
    case "pitchEnvAmount": return set("penv.amt", core.pitchEnvAmount);
    case "pitchEnvDecayMs": return set("penv.dec", core.pitchEnvDecayMs / 1000);
    case "noiseLevel": return set("noise.level", core.noiseLevel);
    case "noiseColor": return set("noise.color", core.noiseColor);
    case "ringHz": return set("ring.freq", core.ringHz);
    case "ringMix": return set("ring.mix", core.ringMix);
    case "attackMs": return set("aenv.att", core.attackMs / 1000);
    case "holdMs": return set("aenv.hold", core.holdMs / 1000);
    case "decayMs": return set("aenv.dec", core.decayMs / 1000);
    case "curve": return set("aenv.curve", core.curve);
    case "filter":
      set("flt.on", core.filter ? 1 : 0);
      if (core.filter) {
        set("flt.type", Math.max(0, FILTER_TYPES.indexOf(core.filter.type)));
        set("flt.cut", core.filter.cutoffHz);
        set("flt.res", core.filter.resonance);
      }
      return;
    case "level": return set("lvl", core.level);
    case "velocityToLevel": return set("v2l", core.velocityToLevel);
  }
}

function sameField(field: PadField, a: DrumPad, b: DrumPad): boolean {
  if (field === "filter") {
    if (!a.filter || !b.filter) return a.filter === b.filter;
    return (
      a.filter.type === b.filter.type &&
      close(a.filter.cutoffHz, b.filter.cutoffHz) &&
      close(a.filter.resonance, b.filter.resonance)
    );
  }
  if (field === "table") return a.table === b.table;
  return close(a[field] as number, b[field] as number);
}

const PAD_FIELDS: readonly PadField[] = [
  "table",
  "position",
  "semitones",
  "pitchEnvAmount",
  "pitchEnvDecayMs",
  "noiseLevel",
  "noiseColor",
  "ringHz",
  "ringMix",
  "attackMs",
  "holdMs",
  "decayMs",
  "curve",
  "filter",
  "level",
  "velocityToLevel"
];

/** The full param record a DR-1 device plays for this instrument. */
export function dr1ParamsFromInstrument(instrument: DrumMidiInstrument): ParamValues {
  const params: ParamValues = { ...dr1Defaults() };
  for (const [id, value] of Object.entries(instrument.fableParams ?? {})) {
    if (id in params && Number.isFinite(value)) params[id] = value;
  }
  for (let i = 0; i < PAD_COUNT; i++) {
    const core = instrument.pads[i];
    if (!core) continue;
    const implied = dr1PadFromParams(params, i, core.name);
    for (const field of PAD_FIELDS) {
      if (!sameField(field, core, implied)) applyPadField(params, i, field, core);
    }
  }
  if (!close(dr1GainDbFromParams(params), instrument.gainDb)) {
    params["master.volume"] = clampParam("master.volume", volumeFromGainDb(instrument.gainDb));
  }
  return params;
}

export function dr1PadNames(instrument: DrumMidiInstrument): string[] {
  return Array.from({ length: PAD_COUNT }, (_, i) => instrument.pads[i]?.name ?? defaultPadName(i));
}

/** The params that differ from DR-1's defaults: what `fableParams` stores. */
export function dr1ParamDiff(params: ParamValues): Record<string, number> {
  const base = dr1Defaults();
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(params)) {
    if (id in base && Number.isFinite(value) && value !== base[id]) out[id] = value;
  }
  return out;
}

/**
 * `base` with its DR-1 state replaced by `params` and `padNames`: the
 * `fableParams` diff plus the core pads and gain derived from them. The base
 * note and any other field stay as they were.
 */
export function dr1InstrumentFromParams(
  base: DrumMidiInstrument,
  params: ParamValues,
  padNames: readonly string[]
): DrumMidiInstrument {
  return {
    ...base,
    fableParams: dr1ParamDiff(params),
    pads: Array.from({ length: PAD_COUNT }, (_, i) =>
      dr1PadFromParams(params, i, padNames[i] ?? defaultPadName(i))
    ),
    gainDb: dr1GainDbFromParams(params)
  };
}

/** A factory kit as a whole param record and its pad names. */
export function dr1FactoryKit(index: number): { params: ParamValues; padNames: string[] } | null {
  const kit = FACTORY_KITS[index];
  if (!kit) return null;
  const state = kitToState(kit);
  return { params: state.params, padNames: state.padNames };
}
