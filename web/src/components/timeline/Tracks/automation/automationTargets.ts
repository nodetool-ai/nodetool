/**
 * The controls a track's automation lanes can drive, with the range a lane
 * draws over and the value the control has without a lane.
 *
 * One list per track: the mixer of an audio or midi track, every numeric
 * parameter of its live instrument (WT-1, BL-1, DR-1) and of its effects, and
 * the animated clip properties of a picture track. A device that adds
 * parameters later (a plugin) adds a branch to `deviceSpecs`; the lane model
 * and the audio graph already address any `device` target by id.
 */

import type { TFunction } from "i18next";
import {
  automationTargetKey,
  clipAutomationIdentity,
  INSTRUMENT_DEVICE_ID,
  type AutomationTarget,
  type MidiInstrument,
  type TimelineTrack,
  type TrackEffect
} from "@nodetool-ai/timeline";

import { BASS_PARAM_DEFS } from "../../daw/fablesynth/bass/params";
import { DRUM_PARAM_DEFS } from "../../daw/fablesynth/drum/params";
import { PARAM_DEFS, PARAMS, type ParamDef } from "../../daw/fablesynth/params";
import { bl1ParamRecord } from "../../daw/devices/bl1Params";
import { dr1PadNames, dr1ParamsFromInstrument } from "../../daw/devices/dr1Params";
import { wt1ParamsFromInstrument } from "../../daw/devices/wt1Params";
import {
  FABLE_FX_LABELS,
  fableFxParamIds,
  resolvedFableFxParams
} from "../../daw/fx/fableFxParams";
import { EFFECT_LABELS } from "../trackEffectsConstants";

export interface AutomationTargetSpec {
  target: AutomationTarget;
  /** `automationTargetKey(target)`. */
  key: string;
  label: string;
  /** The device or section the control belongs to, for grouping a picker. */
  group: string;
  min: number;
  max: number;
  /** How the lane's height maps to the value: straight, or by octaves. */
  curve: "lin" | "log";
  /** The control's own value: where an empty lane draws its line. */
  value: number;
  format: (value: number) => string;
}

const round = (value: number, digits: number): string => value.toFixed(digits);
const formatDb = (value: number): string => `${value > 0 ? "+" : ""}${round(value, 1)} dB`;
const formatHz = (value: number): string =>
  value >= 1000 ? `${round(value / 1000, 2)} kHz` : `${round(value, value < 100 ? 1 : 0)} Hz`;
const formatPan = (value: number): string =>
  Math.abs(value) < 0.01 ? "C" : `${Math.round(Math.abs(value) * 100)}${value < 0 ? "L" : "R"}`;
const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;
const formatTimes = (value: number): string => `${round(value, 2)}×`;
const formatMs = (value: number): string => `${Math.round(value)} ms`;
const formatPlain = (value: number): string => round(value, 2);

/** A FableSynth parameter a lane can sweep: numeric and continuous. */
function automatableDef(def: ParamDef): boolean {
  if (def.type !== undefined || def.curve === "int") return false;
  if (def.min === undefined || def.max === undefined) return false;
  // The document tempo owns the sequencer clock.
  return !def.id.startsWith("seq.");
}

function fableLabel(id: string, def: ParamDef): string {
  const parts = id.split(".");
  const field = def.label ?? parts[parts.length - 1].toUpperCase();
  const section = parts.slice(0, -1).filter((part) => !/^pad\d+$/.test(part));
  return [...section.map((part) => part.toUpperCase()), field].join(" ");
}

function fableSpec(
  deviceId: string,
  group: string,
  def: ParamDef,
  values: Record<string, number>,
  id = def.id
): AutomationTargetSpec {
  const target: AutomationTarget = { kind: "device", deviceId, param: id };
  return {
    target,
    key: automationTargetKey(target),
    label: fableLabel(id, def),
    group,
    min: def.min!,
    max: def.max!,
    curve: def.curve === "log" ? "log" : "lin",
    value: values[id] ?? def.def,
    format: def.fmt ?? formatPlain
  };
}

function instrumentSpecs(instrument: MidiInstrument | undefined): AutomationTargetSpec[] {
  switch (instrument?.type) {
    case "wavetable": {
      const values = wt1ParamsFromInstrument(instrument);
      return PARAM_DEFS.filter(automatableDef).map((def) =>
        fableSpec(INSTRUMENT_DEVICE_ID, `WT-1 · ${def.id.split(".")[0].toUpperCase()}`, def, values)
      );
    }
    case "bass": {
      const values = bl1ParamRecord(instrument);
      return BASS_PARAM_DEFS.filter(automatableDef).map((def) =>
        fableSpec(INSTRUMENT_DEVICE_ID, `BL-1 · ${def.id.split(".")[0].toUpperCase()}`, def, values)
      );
    }
    case "drum": {
      const values = dr1ParamsFromInstrument(instrument);
      const names = dr1PadNames(instrument);
      return DRUM_PARAM_DEFS.filter(automatableDef).map((def) => {
        const pad = /^pad(\d+)\./.exec(def.id);
        const group = pad ? `DR-1 · ${names[Number(pad[1])]}` : "DR-1";
        return fableSpec(INSTRUMENT_DEVICE_ID, group, def, values);
      });
    }
    default:
      return [];
  }
}

interface FieldRange {
  field: string;
  label: string;
  min: number;
  max: number;
  curve?: "log";
  format: (value: number) => string;
}

const FREQ = { min: 20, max: 20000, curve: "log" as const, format: formatHz };
const GAIN = { min: -24, max: 24, format: formatDb };

/** Built-in audio effect fields with an AudioParam behind them. */
const EFFECT_FIELDS: Partial<Record<TrackEffect["type"], FieldRange[]>> = {
  gain: [{ field: "gainDb", label: "Gain", ...GAIN }],
  eq3: [
    { field: "lowFreq", label: "Low freq", ...FREQ },
    { field: "lowGainDb", label: "Low gain", ...GAIN },
    { field: "midFreq", label: "Mid freq", ...FREQ },
    { field: "midQ", label: "Mid Q", min: 0.1, max: 18, format: formatPlain },
    { field: "midGainDb", label: "Mid gain", ...GAIN },
    { field: "highFreq", label: "High freq", ...FREQ },
    { field: "highGainDb", label: "High gain", ...GAIN }
  ],
  filter: [
    { field: "frequency", label: "Frequency", ...FREQ },
    { field: "q", label: "Q", min: 0.1, max: 20, format: formatPlain }
  ],
  compressor: [
    { field: "thresholdDb", label: "Threshold", min: -60, max: 0, format: formatDb },
    { field: "ratio", label: "Ratio", min: 1, max: 20, format: (v) => `${round(v, 1)}:1` },
    { field: "attackMs", label: "Attack", min: 0, max: 500, format: formatMs },
    { field: "releaseMs", label: "Release", min: 0, max: 2000, format: formatMs },
    { field: "kneeDb", label: "Knee", min: 0, max: 40, format: formatDb }
  ]
};

function effectSpecs(effects: readonly TrackEffect[]): AutomationTargetSpec[] {
  const specs: AutomationTargetSpec[] = [];
  effects.forEach((effect, index) => {
    if (effect.type === "fable") {
      const group = `${index + 1}. ${FABLE_FX_LABELS[effect.kind]}`;
      const values = resolvedFableFxParams(effect);
      for (const id of fableFxParamIds(effect.kind)) {
        const def = PARAMS[id];
        if (def && automatableDef(def)) specs.push(fableSpec(effect.id, group, def, values));
      }
      return;
    }
    const fields = EFFECT_FIELDS[effect.type];
    if (!fields) return;
    const group = `${index + 1}. ${EFFECT_LABELS[effect.type]}`;
    const own = effect as unknown as Record<string, unknown>;
    for (const range of fields) {
      const target: AutomationTarget = { kind: "device", deviceId: effect.id, param: range.field };
      const value = own[range.field];
      specs.push({
        target,
        key: automationTargetKey(target),
        label: range.label,
        group,
        min: range.min,
        max: range.max,
        curve: range.curve ?? "lin",
        value: typeof value === "number" ? value : range.min,
        format: range.format
      });
    }
  });
  return specs;
}

function mixerSpecs(track: TimelineTrack, t: TFunction): AutomationTargetSpec[] {
  const group = t("timelineAutomation.groups.mixer");
  const volume: AutomationTarget = { kind: "mixer", param: "volumeDb" };
  const pan: AutomationTarget = { kind: "mixer", param: "pan" };
  return [
    {
      target: volume,
      key: automationTargetKey(volume),
      label: t("timelineAutomation.params.volume"),
      group,
      min: -60,
      max: 6,
      curve: "lin",
      value: track.volumeDb ?? 0,
      format: formatDb
    },
    {
      target: pan,
      key: automationTargetKey(pan),
      label: t("timelineAutomation.params.pan"),
      group,
      min: -1,
      max: 1,
      curve: "lin",
      value: track.pan ?? 0,
      format: formatPan
    }
  ];
}

interface ClipPropertyRange {
  property: string;
  labelKey: string;
  min: number;
  max: number;
  format: (value: number) => string;
}

const RADIANS_PER_TURN = Math.PI * 2;

/** Clip properties a picture lane offers, in inspector order. */
const CLIP_PROPERTIES: readonly ClipPropertyRange[] = [
  { property: "opacity", labelKey: "opacity", min: 0, max: 1, format: formatPercent },
  { property: "scale", labelKey: "scale", min: 0, max: 4, format: formatTimes },
  { property: "offsetX", labelKey: "positionX", min: -2000, max: 2000, format: (v) => `${Math.round(v)} px` },
  { property: "offsetY", labelKey: "positionY", min: -2000, max: 2000, format: (v) => `${Math.round(v)} px` },
  {
    property: "rotation",
    labelKey: "rotation",
    min: -RADIANS_PER_TURN,
    max: RADIANS_PER_TURN,
    format: (v) => `${round((v * 180) / Math.PI, 1)}°`
  },
  { property: "brightness", labelKey: "brightness", min: -1, max: 1, format: formatPlain },
  { property: "contrast", labelKey: "contrast", min: 0, max: 2, format: formatTimes },
  { property: "saturation", labelKey: "saturation", min: 0, max: 2, format: formatTimes },
  { property: "hue", labelKey: "hue", min: -180, max: 180, format: (v) => `${Math.round(v)}°` },
  { property: "blur", labelKey: "blur", min: 0, max: 40, format: (v) => `${round(v, 1)} px` }
];

function clipSpecs(t: TFunction): AutomationTargetSpec[] {
  const group = t("timelineAutomation.groups.clips");
  return CLIP_PROPERTIES.map((range) => {
    const target: AutomationTarget = { kind: "clip", property: range.property };
    return {
      target,
      key: automationTargetKey(target),
      label: t(`timelineAutomation.params.${range.labelKey}`),
      group,
      min: range.min,
      max: range.max,
      curve: "lin",
      value: clipAutomationIdentity(range.property),
      format: range.format
    };
  });
}

/** Every control `track` can automate, grouped in picker order. */
export function automationTargetSpecs(track: TimelineTrack, t: TFunction): AutomationTargetSpec[] {
  switch (track.type) {
    case "audio":
      return [...mixerSpecs(track, t), ...effectSpecs(track.effects ?? [])];
    case "midi":
      return [
        ...mixerSpecs(track, t),
        ...instrumentSpecs(track.instrument),
        ...effectSpecs(track.effects ?? [])
      ];
    case "video":
    case "overlay":
      return clipSpecs(t);
    default:
      return [];
  }
}

/** The spec of one lane's target, or null when its device is gone. */
export function automationTargetSpec(
  track: TimelineTrack,
  target: AutomationTarget,
  t: TFunction
): AutomationTargetSpec | null {
  const key = automationTargetKey(target);
  return automationTargetSpecs(track, t).find((spec) => spec.key === key) ?? null;
}

/** Whether a track type takes automation lanes at all. */
export function trackSupportsAutomation(track: Pick<TimelineTrack, "type">): boolean {
  return (
    track.type === "audio" ||
    track.type === "midi" ||
    track.type === "video" ||
    track.type === "overlay"
  );
}

/** A value's height in the lane, 0 (bottom) .. 1 (top). */
export function automationValueToNorm(spec: AutomationTargetSpec, value: number): number {
  const v = Math.min(spec.max, Math.max(spec.min, value));
  if (spec.curve === "log" && spec.min > 0) {
    return Math.log(v / spec.min) / Math.log(spec.max / spec.min);
  }
  return spec.max === spec.min ? 0 : (v - spec.min) / (spec.max - spec.min);
}

/** The value at a height in the lane, 0 (bottom) .. 1 (top). */
export function automationNormToValue(spec: AutomationTargetSpec, norm: number): number {
  const n = Math.min(1, Math.max(0, norm));
  if (spec.curve === "log" && spec.min > 0) {
    return spec.min * Math.pow(spec.max / spec.min, n);
  }
  return spec.min + (spec.max - spec.min) * n;
}
