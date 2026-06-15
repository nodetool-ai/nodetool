/**
 * Audio effect / DSP module configs — drives the shared `SynthModuleBody`
 * (the Eurorack-style knob faceplate) for the offline audio effect nodes in
 * `lib.audio.*`: gain, delay, EQ filters, compressor, distortion, limiter,
 * reverb, pitch/time, noise gate and phaser. Same config shape as the synth
 * modules; each effect has a single `audio` input jack and an `output` handle.
 *
 * Ranges/defaults/property names mirror the backend node definitions in
 * `packages/audio-nodes/src/nodes/lib-audio-dsp.ts` and `lib-audio-effects.ts`.
 * Log scaling is reserved for strictly-positive ranges (frequencies, times);
 * dB ranges that include 0 or go negative stay linear.
 */

import type { SynthModuleConfig } from "./synthModules";

export const AUDIO_EFFECT_CONFIGS: Readonly<Record<string, SynthModuleConfig>> =
  {
    "lib.audio.Gain": {
      label: "GAIN",
      accent: "primary",
      inputs: ["audio"],
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
    "lib.audio.Delay": {
      label: "DELAY",
      accent: "info",
      inputs: ["audio"],
      knobs: [
        {
          name: "delay_seconds",
          label: "Time",
          min: 0.01,
          max: 5,
          default: 0.5,
          scale: "log",
          unit: "s"
        },
        { name: "feedback", label: "Fdbk", min: 0, max: 0.99, default: 0.3 },
        { name: "mix", label: "Mix", min: 0, max: 1, default: 0.5 }
      ]
    },
    "lib.audio.HighPassFilter": {
      label: "HPF",
      accent: "secondary",
      inputs: ["audio"],
      knobs: [
        {
          name: "cutoff_frequency_hz",
          label: "Cutoff",
          min: 20,
          max: 5000,
          default: 80,
          scale: "log",
          unit: "hz"
        }
      ]
    },
    "lib.audio.LowPassFilter": {
      label: "LPF",
      accent: "secondary",
      inputs: ["audio"],
      knobs: [
        {
          name: "cutoff_frequency_hz",
          label: "Cutoff",
          min: 500,
          max: 20000,
          default: 5000,
          scale: "log",
          unit: "hz"
        }
      ]
    },
    "lib.audio.HighShelfFilter": {
      label: "HI SHLF",
      accent: "secondary",
      inputs: ["audio"],
      knobs: [
        {
          name: "cutoff_frequency_hz",
          label: "Freq",
          min: 1000,
          max: 20000,
          default: 5000,
          scale: "log",
          unit: "hz"
        },
        {
          name: "gain_db",
          label: "Gain",
          min: -24,
          max: 24,
          default: 0,
          bipolar: true,
          unit: "db"
        }
      ]
    },
    "lib.audio.LowShelfFilter": {
      label: "LO SHLF",
      accent: "secondary",
      inputs: ["audio"],
      knobs: [
        {
          name: "cutoff_frequency_hz",
          label: "Freq",
          min: 20,
          max: 1000,
          default: 200,
          scale: "log",
          unit: "hz"
        },
        {
          name: "gain_db",
          label: "Gain",
          min: -24,
          max: 24,
          default: 0,
          bipolar: true,
          unit: "db"
        }
      ]
    },
    "lib.audio.PeakFilter": {
      label: "PEAK",
      accent: "secondary",
      inputs: ["audio"],
      knobs: [
        {
          name: "cutoff_frequency_hz",
          label: "Freq",
          min: 20,
          max: 20000,
          default: 1000,
          scale: "log",
          unit: "hz"
        },
        { name: "q_factor", label: "Q", min: 0.1, max: 10, default: 1 },
        {
          name: "gain_db",
          label: "Gain",
          min: -24,
          max: 24,
          default: 0,
          bipolar: true,
          unit: "db"
        }
      ]
    },
    "lib.audio.Bitcrush": {
      label: "CRUSH",
      accent: "error",
      inputs: ["audio"],
      knobs: [
        {
          name: "bit_depth",
          label: "Bits",
          min: 1,
          max: 16,
          default: 8,
          integer: true
        },
        {
          name: "sample_rate_reduction",
          label: "Rate",
          min: 1,
          max: 100,
          default: 1,
          integer: true
        }
      ]
    },
    "lib.audio.Compress": {
      label: "COMP",
      accent: "warning",
      inputs: ["audio"],
      knobs: [
        {
          name: "threshold",
          label: "Thresh",
          min: -60,
          max: 0,
          default: -20,
          unit: "db"
        },
        { name: "ratio", label: "Ratio", min: 1, max: 20, default: 4, unit: "x" },
        {
          name: "attack",
          label: "Attack",
          min: 0.1,
          max: 100,
          default: 5,
          scale: "log",
          unit: "ms"
        },
        {
          name: "release",
          label: "Release",
          min: 5,
          max: 1000,
          default: 50,
          scale: "log",
          unit: "ms"
        }
      ]
    },
    "lib.audio.Distortion": {
      label: "DRIVE",
      accent: "error",
      inputs: ["audio"],
      knobs: [
        {
          name: "drive_db",
          label: "Drive",
          min: 0,
          max: 100,
          default: 25,
          unit: "db"
        }
      ]
    },
    "lib.audio.Limiter": {
      label: "LIMIT",
      accent: "warning",
      inputs: ["audio"],
      knobs: [
        {
          name: "threshold_db",
          label: "Ceil",
          min: -60,
          max: 0,
          default: -2,
          unit: "db"
        },
        {
          name: "release_ms",
          label: "Release",
          min: 1,
          max: 1000,
          default: 250,
          scale: "log",
          unit: "ms"
        }
      ]
    },
    "lib.audio.Reverb": {
      label: "VERB",
      accent: "info",
      inputs: ["audio"],
      knobs: [
        { name: "room_scale", label: "Room", min: 0, max: 1, default: 0.5 },
        { name: "damping", label: "Damp", min: 0, max: 1, default: 0.5 },
        { name: "wet_level", label: "Wet", min: 0, max: 1, default: 0.15 },
        { name: "dry_level", label: "Dry", min: 0, max: 1, default: 0.5 }
      ]
    },
    "lib.audio.PitchShift": {
      label: "PITCH",
      accent: "success",
      inputs: ["audio"],
      knobs: [
        {
          name: "semitones",
          label: "Semis",
          min: -12,
          max: 12,
          default: 0,
          bipolar: true
        }
      ]
    },
    "lib.audio.TimeStretch": {
      label: "STRETCH",
      accent: "success",
      inputs: ["audio"],
      knobs: [
        { name: "rate", label: "Rate", min: 0.5, max: 2, default: 1, unit: "x" }
      ]
    },
    "lib.audio.NoiseGate": {
      label: "GATE",
      accent: "warning",
      inputs: ["audio"],
      knobs: [
        {
          name: "threshold_db",
          label: "Thresh",
          min: -90,
          max: 0,
          default: -50,
          unit: "db"
        },
        {
          name: "attack_ms",
          label: "Attack",
          min: 0.1,
          max: 100,
          default: 1,
          scale: "log",
          unit: "ms"
        },
        {
          name: "release_ms",
          label: "Release",
          min: 5,
          max: 1000,
          default: 100,
          scale: "log",
          unit: "ms"
        }
      ]
    },
    "lib.audio.Phaser": {
      label: "PHASER",
      accent: "secondary",
      inputs: ["audio"],
      knobs: [
        {
          name: "rate_hz",
          label: "Rate",
          min: 0.1,
          max: 10,
          default: 1,
          scale: "log",
          unit: "hz"
        },
        { name: "depth", label: "Depth", min: 0, max: 1, default: 0.5 },
        {
          name: "centre_frequency_hz",
          label: "Freq",
          min: 100,
          max: 5000,
          default: 1300,
          scale: "log",
          unit: "hz"
        },
        {
          name: "feedback",
          label: "Fdbk",
          min: -1,
          max: 1,
          default: 0,
          bipolar: true
        },
        { name: "mix", label: "Mix", min: 0, max: 1, default: 0.5 }
      ]
    }
  };

export const AUDIO_EFFECT_NODE_TYPES: readonly string[] = Object.keys(
  AUDIO_EFFECT_CONFIGS
);
