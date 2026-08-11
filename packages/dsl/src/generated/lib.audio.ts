// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Gain — lib.audio.Gain
export type GainInputs = {
  audio?: Connectable<AudioRef>;
  gain_db?: Connectable<number>;
};

export interface GainOutputs {
  output: AudioRef;
}

export function gain(inputs: GainInputs): DslNode<GainOutputs, "output"> {
  return createNode("lib.audio.Gain", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Delay — lib.audio.Delay
export type DelayInputs = {
  audio?: Connectable<AudioRef>;
  delay_seconds?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
};

export interface DelayOutputs {
  output: AudioRef;
}

export function delay(inputs: DelayInputs): DslNode<DelayOutputs, "output"> {
  return createNode("lib.audio.Delay", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// High Pass Filter — lib.audio.HighPassFilter
export type HighPassFilterInputs = {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
};

export interface HighPassFilterOutputs {
  output: AudioRef;
}

export function highPassFilter(inputs: HighPassFilterInputs): DslNode<HighPassFilterOutputs, "output"> {
  return createNode("lib.audio.HighPassFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Low Pass Filter — lib.audio.LowPassFilter
export type LowPassFilterInputs = {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
};

export interface LowPassFilterOutputs {
  output: AudioRef;
}

export function lowPassFilter(inputs: LowPassFilterInputs): DslNode<LowPassFilterOutputs, "output"> {
  return createNode("lib.audio.LowPassFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// High Shelf Filter — lib.audio.HighShelfFilter
export type HighShelfFilterInputs = {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
};

export interface HighShelfFilterOutputs {
  output: AudioRef;
}

export function highShelfFilter(inputs: HighShelfFilterInputs): DslNode<HighShelfFilterOutputs, "output"> {
  return createNode("lib.audio.HighShelfFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Low Shelf Filter — lib.audio.LowShelfFilter
export type LowShelfFilterInputs = {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
};

export interface LowShelfFilterOutputs {
  output: AudioRef;
}

export function lowShelfFilter(inputs: LowShelfFilterInputs): DslNode<LowShelfFilterOutputs, "output"> {
  return createNode("lib.audio.LowShelfFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Peak Filter — lib.audio.PeakFilter
export type PeakFilterInputs = {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  q_factor?: Connectable<number>;
  gain_db?: Connectable<number>;
};

export interface PeakFilterOutputs {
  output: AudioRef;
}

export function peakFilter(inputs: PeakFilterInputs): DslNode<PeakFilterOutputs, "output"> {
  return createNode("lib.audio.PeakFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Bitcrush — lib.audio.Bitcrush
export type BitcrushInputs = {
  audio?: Connectable<AudioRef>;
  bit_depth?: Connectable<number>;
  sample_rate_reduction?: Connectable<number>;
};

export interface BitcrushOutputs {
  output: AudioRef;
}

export function bitcrush(inputs: BitcrushInputs): DslNode<BitcrushOutputs, "output"> {
  return createNode("lib.audio.Bitcrush", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Compress — lib.audio.Compress
export type CompressInputs = {
  audio?: Connectable<AudioRef>;
  threshold?: Connectable<number>;
  ratio?: Connectable<number>;
  attack?: Connectable<number>;
  release?: Connectable<number>;
  auto_gain?: Connectable<boolean>;
};

export interface CompressOutputs {
  output: AudioRef;
}

export function compress(inputs: CompressInputs): DslNode<CompressOutputs, "output"> {
  return createNode("lib.audio.Compress", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Distortion — lib.audio.Distortion
export type DistortionInputs = {
  audio?: Connectable<AudioRef>;
  drive_db?: Connectable<number>;
};

export interface DistortionOutputs {
  output: AudioRef;
}

export function distortion(inputs: DistortionInputs): DslNode<DistortionOutputs, "output"> {
  return createNode("lib.audio.Distortion", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Limiter — lib.audio.Limiter
export type LimiterInputs = {
  audio?: Connectable<AudioRef>;
  threshold_db?: Connectable<number>;
  release_ms?: Connectable<number>;
  auto_gain?: Connectable<boolean>;
};

export interface LimiterOutputs {
  output: AudioRef;
}

export function limiter(inputs: LimiterInputs): DslNode<LimiterOutputs, "output"> {
  return createNode("lib.audio.Limiter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Reverb — lib.audio.Reverb
export type ReverbInputs = {
  audio?: Connectable<AudioRef>;
  room_scale?: Connectable<number>;
  damping?: Connectable<number>;
  wet_level?: Connectable<number>;
  dry_level?: Connectable<number>;
};

export interface ReverbOutputs {
  output: AudioRef;
}

export function reverb(inputs: ReverbInputs): DslNode<ReverbOutputs, "output"> {
  return createNode("lib.audio.Reverb", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Noise Gate — lib.audio.NoiseGate
export type NoiseGateInputs = {
  audio?: Connectable<AudioRef>;
  threshold_db?: Connectable<number>;
  attack_ms?: Connectable<number>;
  release_ms?: Connectable<number>;
};

export interface NoiseGateOutputs {
  output: AudioRef;
}

export function noiseGate(inputs: NoiseGateInputs): DslNode<NoiseGateOutputs, "output"> {
  return createNode("lib.audio.NoiseGate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Phaser — lib.audio.Phaser
export type PhaserInputs = {
  audio?: Connectable<AudioRef>;
  rate_hz?: Connectable<number>;
  depth?: Connectable<number>;
  centre_frequency_hz?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
};

export interface PhaserOutputs {
  output: AudioRef;
}

export function phaser(inputs: PhaserInputs): DslNode<PhaserOutputs, "output"> {
  return createNode("lib.audio.Phaser", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Pitch Shift — lib.audio.PitchShift
export type PitchShiftInputs = {
  audio?: Connectable<AudioRef>;
  semitones?: Connectable<number>;
};

export interface PitchShiftOutputs {
  output: AudioRef;
}

export function pitchShift(inputs: PitchShiftInputs): DslNode<PitchShiftOutputs, "output"> {
  return createNode("lib.audio.PitchShift", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Time Stretch — lib.audio.TimeStretch
export type TimeStretchInputs = {
  audio?: Connectable<AudioRef>;
  rate?: Connectable<number>;
};

export interface TimeStretchOutputs {
  output: AudioRef;
}

export function timeStretch(inputs: TimeStretchInputs): DslNode<TimeStretchOutputs, "output"> {
  return createNode("lib.audio.TimeStretch", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
