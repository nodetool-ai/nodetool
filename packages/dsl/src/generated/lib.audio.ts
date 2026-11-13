// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { AudioRef } from "../types.js";

// Gain — lib.audio.Gain
export type GainInputs = {
  gain_db?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface GainOutputs {
  output: AudioRef;
}

export function gain(inputs: GainInputs, options?: NodeOptions): NodeWithOutputs<GainOutputs, "output"> {
  return createNode("lib.audio.Gain", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Delay — lib.audio.Delay
export type DelayInputs = {
  delay_seconds?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface DelayOutputs {
  output: AudioRef;
}

export function delay(inputs: DelayInputs, options?: NodeOptions): NodeWithOutputs<DelayOutputs, "output"> {
  return createNode("lib.audio.Delay", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// High Pass Filter — lib.audio.HighPassFilter
export type HighPassFilterInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface HighPassFilterOutputs {
  output: AudioRef;
}

export function highPassFilter(inputs: HighPassFilterInputs, options?: NodeOptions): NodeWithOutputs<HighPassFilterOutputs, "output"> {
  return createNode("lib.audio.HighPassFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Low Pass Filter — lib.audio.LowPassFilter
export type LowPassFilterInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface LowPassFilterOutputs {
  output: AudioRef;
}

export function lowPassFilter(inputs: LowPassFilterInputs, options?: NodeOptions): NodeWithOutputs<LowPassFilterOutputs, "output"> {
  return createNode("lib.audio.LowPassFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// High Shelf Filter — lib.audio.HighShelfFilter
export type HighShelfFilterInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface HighShelfFilterOutputs {
  output: AudioRef;
}

export function highShelfFilter(inputs: HighShelfFilterInputs, options?: NodeOptions): NodeWithOutputs<HighShelfFilterOutputs, "output"> {
  return createNode("lib.audio.HighShelfFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Low Shelf Filter — lib.audio.LowShelfFilter
export type LowShelfFilterInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface LowShelfFilterOutputs {
  output: AudioRef;
}

export function lowShelfFilter(inputs: LowShelfFilterInputs, options?: NodeOptions): NodeWithOutputs<LowShelfFilterOutputs, "output"> {
  return createNode("lib.audio.LowShelfFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Peak Filter — lib.audio.PeakFilter
export type PeakFilterInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  q_factor?: Connectable<number>;
  gain_db?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface PeakFilterOutputs {
  output: AudioRef;
}

export function peakFilter(inputs: PeakFilterInputs, options?: NodeOptions): NodeWithOutputs<PeakFilterOutputs, "output"> {
  return createNode("lib.audio.PeakFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Bitcrush — lib.audio.Bitcrush
export type BitcrushInputs = {
  bit_depth?: Connectable<number>;
  sample_rate_reduction?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface BitcrushOutputs {
  output: AudioRef;
}

export function bitcrush(inputs: BitcrushInputs, options?: NodeOptions): NodeWithOutputs<BitcrushOutputs, "output"> {
  return createNode("lib.audio.Bitcrush", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Compress — lib.audio.Compress
export type CompressInputs = {
  threshold?: Connectable<number>;
  ratio?: Connectable<number>;
  attack?: Connectable<number>;
  release?: Connectable<number>;
  auto_gain?: Connectable<boolean>;
  audio?: Connectable<AudioRef>;
};

export interface CompressOutputs {
  output: AudioRef;
}

export function compress(inputs: CompressInputs, options?: NodeOptions): NodeWithOutputs<CompressOutputs, "output"> {
  return createNode("lib.audio.Compress", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Distortion — lib.audio.Distortion
export type DistortionInputs = {
  drive_db?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface DistortionOutputs {
  output: AudioRef;
}

export function distortion(inputs: DistortionInputs, options?: NodeOptions): NodeWithOutputs<DistortionOutputs, "output"> {
  return createNode("lib.audio.Distortion", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Limiter — lib.audio.Limiter
export type LimiterInputs = {
  threshold_db?: Connectable<number>;
  release_ms?: Connectable<number>;
  auto_gain?: Connectable<boolean>;
  audio?: Connectable<AudioRef>;
};

export interface LimiterOutputs {
  output: AudioRef;
}

export function limiter(inputs: LimiterInputs, options?: NodeOptions): NodeWithOutputs<LimiterOutputs, "output"> {
  return createNode("lib.audio.Limiter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Reverb — lib.audio.Reverb
export type ReverbInputs = {
  room_scale?: Connectable<number>;
  damping?: Connectable<number>;
  wet_level?: Connectable<number>;
  dry_level?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface ReverbOutputs {
  output: AudioRef;
}

export function reverb(inputs: ReverbInputs, options?: NodeOptions): NodeWithOutputs<ReverbOutputs, "output"> {
  return createNode("lib.audio.Reverb", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Noise Gate — lib.audio.NoiseGate
export type NoiseGateInputs = {
  threshold_db?: Connectable<number>;
  attack_ms?: Connectable<number>;
  release_ms?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface NoiseGateOutputs {
  output: AudioRef;
}

export function noiseGate(inputs: NoiseGateInputs, options?: NodeOptions): NodeWithOutputs<NoiseGateOutputs, "output"> {
  return createNode("lib.audio.NoiseGate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Phaser — lib.audio.Phaser
export type PhaserInputs = {
  rate_hz?: Connectable<number>;
  depth?: Connectable<number>;
  centre_frequency_hz?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
  audio?: Connectable<AudioRef>;
};

export interface PhaserOutputs {
  output: AudioRef;
}

export function phaser(inputs: PhaserInputs, options?: NodeOptions): NodeWithOutputs<PhaserOutputs, "output"> {
  return createNode("lib.audio.Phaser", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Pitch Shift — lib.audio.PitchShift
export type PitchShiftInputs = {
  audio?: Connectable<AudioRef>;
  semitones?: Connectable<number>;
};

export interface PitchShiftOutputs {
  output: AudioRef;
}

export function pitchShift(inputs: PitchShiftInputs, options?: NodeOptions): NodeWithOutputs<PitchShiftOutputs, "output"> {
  return createNode("lib.audio.PitchShift", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Time Stretch — lib.audio.TimeStretch
export type TimeStretchInputs = {
  audio?: Connectable<AudioRef>;
  rate?: Connectable<number>;
};

export interface TimeStretchOutputs {
  output: AudioRef;
}

export function timeStretch(inputs: TimeStretchInputs, options?: NodeOptions): NodeWithOutputs<TimeStretchOutputs, "output"> {
  return createNode("lib.audio.TimeStretch", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}
