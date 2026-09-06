/**
 * Static effect metadata for TrackEffectsPanel.
 *
 * Extracted from TrackEffectsPanel.tsx to keep the panel component focused on
 * rendering/interaction. These are pure data keyed by TrackEffect["type"].
 */
import type { TrackEffect } from "@nodetool-ai/timeline";

/** Device-rack width (px) per effect type. */
export const DEVICE_WIDTHS = {
  gain: 200,
  eq3: 420,
  filter: 240,
  compressor: 380,
  colorCorrection: 320,
  videoBlur: 220,
  sharpen: 240,
  vignette: 260,
  chromaKey: 280
} satisfies Record<TrackEffect["type"], number>;

/** Human-readable label per effect type. */
export const EFFECT_LABELS = {
  gain: "Gain",
  eq3: "3-Band EQ",
  filter: "Filter",
  compressor: "Compressor",
  colorCorrection: "Color",
  videoBlur: "Blur",
  sharpen: "Sharpen",
  vignette: "Vignette",
  chromaKey: "Chroma Key"
} satisfies Record<TrackEffect["type"], string>;

/** Effect types available on audio tracks. */
export const AUDIO_EFFECT_TYPES: TrackEffect["type"][] = [
  "gain",
  "eq3",
  "filter",
  "compressor"
];

/** Effect types available on video tracks. */
export const VIDEO_EFFECT_TYPES: TrackEffect["type"][] = [
  "colorCorrection",
  "videoBlur",
  "sharpen",
  "vignette",
  "chromaKey"
];

/** A numeric field of `E` a slider can drive. */
type NumericKey<E> = {
  [K in keyof E]-?: E[K] extends number ? K : never;
}[keyof E];

/**
 * One slider on an effect's rack. `digits` overrides `ParamRow`'s own
 * step-derived readout precision and is only set where they differ.
 */
export interface Knob<E> {
  key: NumericKey<E>;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
}

type KnobTable = {
  [T in TrackEffect["type"]]: Knob<Extract<TrackEffect, { type: T }>>[];
};

/**
 * The sliders each effect type exposes, in rack order. `eq3` has none: its
 * whole surface is the draggable curve. The ranges here are the same ones
 * `TrackColorCorrectionEffect` and friends document field by field in
 * `@nodetool-ai/timeline`.
 */
export const KNOBS: KnobTable = {
  gain: [
    { key: "gainDb", label: "Gain", min: -24, max: 24, step: 0.1, unit: "dB", digits: 1 }
  ],
  eq3: [],
  filter: [
    { key: "frequency", label: "Frequency", min: 20, max: 20000, step: 10, unit: "Hz" },
    { key: "q", label: "Q", min: 0.1, max: 20, step: 0.1, digits: 1 }
  ],
  compressor: [
    { key: "attackMs", label: "Attack", min: 0, max: 500, step: 1, unit: "ms" },
    { key: "releaseMs", label: "Release", min: 0, max: 2000, step: 1, unit: "ms" },
    { key: "kneeDb", label: "Knee", min: 0, max: 40, step: 0.5, unit: "dB", digits: 1 }
  ],
  colorCorrection: [
    { key: "brightness", label: "Brightness", min: -1, max: 1, step: 0.01 },
    { key: "contrast", label: "Contrast", min: 0, max: 4, step: 0.01 },
    { key: "saturation", label: "Saturation", min: 0, max: 4, step: 0.01 },
    { key: "hue", label: "Hue", min: -180, max: 180, step: 1, unit: "°" },
    { key: "temperature", label: "Temp", min: -1, max: 1, step: 0.01 },
    { key: "tint", label: "Tint", min: -1, max: 1, step: 0.01 },
    { key: "shadows", label: "Shadows", min: -1, max: 1, step: 0.01 },
    { key: "highlights", label: "Highlights", min: -1, max: 1, step: 0.01 }
  ],
  videoBlur: [
    { key: "radius", label: "Radius", min: 0, max: 40, step: 0.5, unit: "px", digits: 1 }
  ],
  sharpen: [
    { key: "amount", label: "Amount", min: 0, max: 2, step: 0.01 },
    { key: "threshold", label: "Threshold", min: 0, max: 1, step: 0.01 }
  ],
  vignette: [
    { key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
    { key: "radius", label: "Radius", min: 0.1, max: 1.5, step: 0.01 },
    { key: "softness", label: "Softness", min: 0, max: 1, step: 0.01 }
  ],
  chromaKey: [
    { key: "tolerance", label: "Tolerance", min: 0, max: 1, step: 0.01 },
    { key: "softness", label: "Softness", min: 0, max: 1, step: 0.01 },
    { key: "spill", label: "Spill", min: 0, max: 1, step: 0.01 }
  ]
};
