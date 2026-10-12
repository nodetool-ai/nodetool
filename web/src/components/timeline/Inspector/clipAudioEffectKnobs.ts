/**
 * Labels and slider ranges for the clip audio effects the Inspector edits.
 * The ranges stay inside the `clipAudioEffect` schema in
 * `@nodetool-ai/protocol`, so every value a slider writes saves.
 */
import type { ClipAudioEffect } from "@nodetool-ai/timeline";

type ClipAudioEffectType = ClipAudioEffect["type"];

/** A numeric field of `E` a slider can drive. */
type NumericKey<E> = {
  [K in keyof E]-?: E[K] extends number ? K : never;
}[keyof E];

export interface ClipAudioKnob<E> {
  key: NumericKey<E>;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  digits: number;
  /** Neutral value: the slider fills from here and double-click resets to it. */
  origin?: number;
}

type KnobTable = {
  [T in ClipAudioEffectType]: ClipAudioKnob<
    Extract<ClipAudioEffect, { type: T }>
  >[];
};

/** Effects in the order the Add menu lists them. */
export const CLIP_AUDIO_EFFECT_TYPES: readonly ClipAudioEffectType[] = [
  "eq3",
  "filter",
  "compressor",
  "gain",
  "echo",
  "reverb",
  "distortion"
];

export const CLIP_AUDIO_EFFECT_LABELS: Record<ClipAudioEffectType, string> = {
  gain: "Gain",
  eq3: "3-band EQ",
  filter: "Filter",
  compressor: "Compressor",
  echo: "Echo",
  reverb: "Reverb",
  distortion: "Distortion"
};

export const CLIP_AUDIO_KNOBS: KnobTable = {
  gain: [
    { key: "gainDb", label: "Gain", min: -24, max: 24, step: 0.1, unit: "dB", digits: 1, origin: 0 }
  ],
  eq3: [
    { key: "lowGainDb", label: "Low", min: -18, max: 18, step: 0.5, unit: "dB", digits: 1, origin: 0 },
    { key: "lowFreq", label: "Low freq", min: 20, max: 1000, step: 10, unit: "Hz", digits: 0 },
    { key: "midGainDb", label: "Mid", min: -18, max: 18, step: 0.5, unit: "dB", digits: 1, origin: 0 },
    { key: "midFreq", label: "Mid freq", min: 200, max: 8000, step: 10, unit: "Hz", digits: 0 },
    { key: "midQ", label: "Mid Q", min: 0.1, max: 10, step: 0.1, unit: "", digits: 1 },
    { key: "highGainDb", label: "High", min: -18, max: 18, step: 0.5, unit: "dB", digits: 1, origin: 0 },
    { key: "highFreq", label: "High freq", min: 1000, max: 16000, step: 100, unit: "Hz", digits: 0 }
  ],
  filter: [
    { key: "frequency", label: "Frequency", min: 20, max: 20000, step: 10, unit: "Hz", digits: 0 },
    { key: "q", label: "Q", min: 0.1, max: 20, step: 0.1, unit: "", digits: 1 }
  ],
  compressor: [
    { key: "thresholdDb", label: "Threshold", min: -60, max: 0, step: 0.5, unit: "dB", digits: 1 },
    { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, unit: ":1", digits: 1 },
    { key: "attackMs", label: "Attack", min: 0, max: 500, step: 1, unit: "ms", digits: 0 },
    { key: "releaseMs", label: "Release", min: 0, max: 2000, step: 1, unit: "ms", digits: 0 },
    { key: "kneeDb", label: "Knee", min: 0, max: 40, step: 0.5, unit: "dB", digits: 1 }
  ],
  echo: [
    { key: "delayMs", label: "Delay", min: 10, max: 2000, step: 5, unit: "ms", digits: 0 },
    { key: "feedback", label: "Feedback", min: 0, max: 0.95, step: 0.01, unit: "", digits: 2 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "", digits: 2 }
  ],
  reverb: [
    { key: "decaySec", label: "Decay", min: 0.1, max: 10, step: 0.1, unit: "s", digits: 1 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01, unit: "", digits: 2 }
  ],
  distortion: [
    { key: "driveDb", label: "Drive", min: 0, max: 40, step: 0.5, unit: "dB", digits: 1 },
    { key: "outputDb", label: "Output", min: -24, max: 12, step: 0.5, unit: "dB", digits: 1, origin: 0 }
  ]
};

/** The readout a knob shows: `-3.0 dB`, `350 ms`, `4.0:1`, `0.35`. */
export function formatKnob(
  knob: { unit: string; digits: number },
  value: number
): string {
  const text = value.toFixed(knob.digits);
  if (knob.unit === "") return text;
  return knob.unit.startsWith(":") ? `${text}${knob.unit}` : `${text} ${knob.unit}`;
}
