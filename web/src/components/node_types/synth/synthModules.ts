/**
 * Synth module configs — drives `SynthModuleBody`, the shared bespoke body
 * for the modular-synthesis audio nodes (`nodetool.audio.synth.*`) and the
 * realtime streaming effects. One config per node type: which input handles
 * to render as jacks, which properties become knobs, and the module's
 * accent color and extras (waveform selector, mode toggle, ADSR preview).
 */

export type KnobUnit = "hz" | "s" | "ms" | "db" | "x" | "";

export interface KnobSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** "log" requires min > 0 — used for frequencies and envelope times. */
  scale?: "linear" | "log";
  /** Range straddles 0 with a neutral midpoint — arc fills outward from it. */
  bipolar?: boolean;
  /** Snap to whole numbers — for integer-typed properties (e.g. bit depth). */
  integer?: boolean;
  unit?: KnobUnit;
}

export interface EnumToggleSpec {
  name: string;
  default: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** Boolean on/off toggle for a `bool` property (e.g. compressor auto gain). */
export interface BoolToggleSpec {
  name: string;
  label: string;
  default: boolean;
}

/** Palette key used for the module's accent (knob arcs, waveform icons). */
export type SynthAccent =
  | "primary"
  | "secondary"
  | "warning"
  | "info"
  | "success"
  | "error";

export interface SynthModuleConfig {
  /** Short faceplate label, Eurorack style ("VCO", "ADSR", …). */
  label: string;
  accent: SynthAccent;
  /** Property names rendered as input jacks (the node's `inputFields`). */
  inputs: readonly string[];
  knobs: readonly KnobSpec[];
  /** Waveform enum property, rendered as an icon selector. */
  waveform?: { name: string; default: string; options: readonly string[] };
  /** Generic enum toggle (e.g. VCF lowpass/highpass). */
  modeToggle?: EnumToggleSpec;
  /** Boolean on/off toggles for `bool` properties (e.g. auto makeup gain). */
  toggles?: readonly BoolToggleSpec[];
  /** Render the ADSR envelope preview above the knobs. */
  adsrPreview?: boolean;
}

const ENVELOPE_TIME = { min: 0.0005, max: 10, scale: "log", unit: "s" } as const;

export const SYNTH_MODULE_CONFIGS: Readonly<Record<string, SynthModuleConfig>> =
  {
    "nodetool.audio.synth.Oscillator": {
      label: "VCO",
      accent: "warning",
      inputs: ["pitch_cv", "fm"],
      waveform: {
        name: "waveform",
        default: "sine",
        options: ["sine", "saw", "square", "triangle", "noise"]
      },
      knobs: [
        {
          name: "frequency",
          label: "Freq",
          min: 0.1,
          max: 20000,
          default: 220,
          scale: "log",
          unit: "hz"
        },
        { name: "amplitude", label: "Level", min: 0, max: 1, default: 0.8 },
        {
          name: "pulse_width",
          label: "PW",
          min: 0.05,
          max: 0.95,
          default: 0.5
        },
        { name: "fm_amount", label: "FM Amt", min: 0, max: 10, default: 0 }
      ]
    },
    "nodetool.audio.synth.LFO": {
      label: "LFO",
      accent: "info",
      inputs: ["clock"],
      waveform: {
        name: "waveform",
        default: "sine",
        options: ["sine", "triangle", "saw", "square"]
      },
      knobs: [
        {
          name: "rate_hz",
          label: "Rate",
          min: 0.01,
          max: 100,
          default: 2,
          scale: "log",
          unit: "hz"
        },
        { name: "depth", label: "Depth", min: 0, max: 10, default: 1 },
        {
          name: "offset",
          label: "Offset",
          min: -10,
          max: 10,
          default: 0,
          bipolar: true
        }
      ]
    },
    "nodetool.audio.synth.ADSR": {
      label: "ADSR",
      accent: "success",
      inputs: ["gate"],
      adsrPreview: true,
      knobs: [
        { name: "attack", label: "A", default: 0.01, ...ENVELOPE_TIME },
        { name: "decay", label: "D", default: 0.1, ...ENVELOPE_TIME },
        { name: "sustain", label: "S", min: 0, max: 1, default: 0.7 },
        { name: "release", label: "R", default: 0.3, ...ENVELOPE_TIME }
      ]
    },
    "nodetool.audio.synth.Gate": {
      label: "GATE",
      accent: "error",
      inputs: [],
      knobs: [
        {
          name: "on_duration",
          label: "On",
          min: 0.001,
          max: 60,
          default: 0.25,
          scale: "log",
          unit: "s"
        },
        {
          name: "off_duration",
          label: "Off",
          min: 0.001,
          max: 60,
          default: 0.25,
          scale: "log",
          unit: "s"
        },
        { name: "amplitude", label: "Level", min: 0, max: 10, default: 1 }
      ]
    },
    "nodetool.audio.synth.VCA": {
      label: "VCA",
      accent: "primary",
      inputs: ["audio", "cv"],
      knobs: [{ name: "gain", label: "Gain", min: 0, max: 10, default: 1 }]
    },
    "nodetool.audio.synth.VCF": {
      label: "VCF",
      accent: "secondary",
      inputs: ["audio", "cutoff_cv"],
      modeToggle: {
        name: "mode",
        default: "lowpass",
        options: [
          { value: "lowpass", label: "LP" },
          { value: "highpass", label: "HP" }
        ]
      },
      knobs: [
        {
          name: "cutoff_hz",
          label: "Cutoff",
          min: 20,
          max: 20000,
          default: 1000,
          scale: "log",
          unit: "hz"
        },
        { name: "q", label: "Res", min: 0.1, max: 10, default: 0.707 },
        { name: "cv_amount", label: "CV Amt", min: 0, max: 5, default: 1 }
      ]
    },
    "nodetool.audio.synth.Attenuverter": {
      label: "ATTV",
      accent: "info",
      inputs: ["signal"],
      knobs: [
        {
          name: "scale",
          label: "Scale",
          min: -10,
          max: 10,
          default: 1,
          bipolar: true
        },
        {
          name: "offset",
          label: "Offset",
          min: -10,
          max: 10,
          default: 0,
          bipolar: true
        }
      ]
    },
    "nodetool.audio.synth.SampleHold": {
      label: "S & H",
      accent: "warning",
      inputs: ["signal", "trigger"],
      knobs: []
    },
    "nodetool.audio.synth.Mixer": {
      label: "MIX",
      accent: "primary",
      inputs: ["in1", "in2", "in3", "in4"],
      knobs: [
        { name: "level1", label: "Ch 1", min: 0, max: 2, default: 1 },
        { name: "level2", label: "Ch 2", min: 0, max: 2, default: 1 },
        { name: "level3", label: "Ch 3", min: 0, max: 2, default: 1 },
        { name: "level4", label: "Ch 4", min: 0, max: 2, default: 1 }
      ]
    },
    "nodetool.audio.realtime.StreamingGain": {
      label: "GAIN",
      accent: "primary",
      inputs: ["chunk"],
      knobs: [
        {
          name: "gain_db",
          label: "Gain",
          min: -60,
          max: 24,
          default: 0,
          bipolar: true,
          unit: "db"
        }
      ]
    },
    "nodetool.audio.realtime.StreamingLowPass": {
      label: "LPF",
      accent: "secondary",
      inputs: ["chunk"],
      knobs: [
        {
          name: "cutoff_frequency_hz",
          label: "Cutoff",
          min: 500,
          max: 20000,
          default: 5000,
          scale: "log",
          unit: "hz"
        },
        { name: "q", label: "Res", min: 0.1, max: 10, default: 0.707 }
      ]
    },
    "nodetool.audio.realtime.StreamingHighPass": {
      label: "HPF",
      accent: "secondary",
      inputs: ["chunk"],
      knobs: [
        {
          name: "cutoff_frequency_hz",
          label: "Cutoff",
          min: 20,
          max: 5000,
          default: 80,
          scale: "log",
          unit: "hz"
        },
        { name: "q", label: "Res", min: 0.1, max: 10, default: 0.707 }
      ]
    }
  };

export const SYNTH_NODE_TYPES: readonly string[] = Object.keys(
  SYNTH_MODULE_CONFIGS
);

// ── Knob value math ────────────────────────────────────────────────

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/** Normalize a knob value to t ∈ [0, 1] on the spec's scale. */
export const knobNorm = (spec: KnobSpec, value: number): number => {
  const v = clamp(value, spec.min, spec.max);
  if (spec.scale === "log") {
    return Math.log(v / spec.min) / Math.log(spec.max / spec.min);
  }
  return spec.max === spec.min ? 0 : (v - spec.min) / (spec.max - spec.min);
};

/** Inverse of {@link knobNorm}. */
export const knobDenorm = (spec: KnobSpec, t: number): number => {
  const c = clamp(t, 0, 1);
  if (spec.scale === "log") {
    return spec.min * Math.pow(spec.max / spec.min, c);
  }
  return spec.min + c * (spec.max - spec.min);
};

/** Compact human-readable knob value ("440 Hz", "1.2 kHz", "250 ms", "+3.0 dB"). */
export const formatKnobValue = (spec: KnobSpec, value: number): string => {
  switch (spec.unit) {
    case "hz":
      return value >= 1000
        ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz`
        : `${value < 10 ? value.toFixed(2) : Math.round(value)} Hz`;
    case "s":
      return value < 1
        ? `${Math.round(value * 1000)} ms`
        : `${value.toFixed(value < 10 ? 2 : 1)} s`;
    case "ms":
      return value >= 1000
        ? `${(value / 1000).toFixed(2)} s`
        : `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;
    case "db": {
      const sign = value > 0 ? "+" : "";
      return `${sign}${value.toFixed(1)} dB`;
    }
    case "x":
      return `${Math.round(value * 100) / 100}×`;
    default: {
      if (spec.integer) {
        return `${Math.round(value)}`;
      }
      const rounded = Math.round(value * 100) / 100;
      const sign = spec.bipolar && rounded > 0 ? "+" : "";
      return `${sign}${rounded}`;
    }
  }
};
