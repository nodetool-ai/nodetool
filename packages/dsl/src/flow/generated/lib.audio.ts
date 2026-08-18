// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { AudioRef } from "../../types.js";

// Gain — lib.audio.Gain
export type GainInputs = {
  audio?: AudioRef;
  gain_db?: number;
};

export interface GainOutputs {
  output: AudioRef;
}

export function gain(inputs: GainInputs): Promise<GainOutputs> {
  return callNode<GainOutputs>("lib.audio.Gain", inputs);
}

// Delay — lib.audio.Delay
export type DelayInputs = {
  audio?: AudioRef;
  delay_seconds?: number;
  feedback?: number;
  mix?: number;
};

export interface DelayOutputs {
  output: AudioRef;
}

export function delay(inputs: DelayInputs): Promise<DelayOutputs> {
  return callNode<DelayOutputs>("lib.audio.Delay", inputs);
}

// High Pass Filter — lib.audio.HighPassFilter
export type HighPassFilterInputs = {
  audio?: AudioRef;
  cutoff_frequency_hz?: number;
};

export interface HighPassFilterOutputs {
  output: AudioRef;
}

export function highPassFilter(inputs: HighPassFilterInputs): Promise<HighPassFilterOutputs> {
  return callNode<HighPassFilterOutputs>("lib.audio.HighPassFilter", inputs);
}

// Low Pass Filter — lib.audio.LowPassFilter
export type LowPassFilterInputs = {
  audio?: AudioRef;
  cutoff_frequency_hz?: number;
};

export interface LowPassFilterOutputs {
  output: AudioRef;
}

export function lowPassFilter(inputs: LowPassFilterInputs): Promise<LowPassFilterOutputs> {
  return callNode<LowPassFilterOutputs>("lib.audio.LowPassFilter", inputs);
}

// High Shelf Filter — lib.audio.HighShelfFilter
export type HighShelfFilterInputs = {
  audio?: AudioRef;
  cutoff_frequency_hz?: number;
  gain_db?: number;
};

export interface HighShelfFilterOutputs {
  output: AudioRef;
}

export function highShelfFilter(inputs: HighShelfFilterInputs): Promise<HighShelfFilterOutputs> {
  return callNode<HighShelfFilterOutputs>("lib.audio.HighShelfFilter", inputs);
}

// Low Shelf Filter — lib.audio.LowShelfFilter
export type LowShelfFilterInputs = {
  audio?: AudioRef;
  cutoff_frequency_hz?: number;
  gain_db?: number;
};

export interface LowShelfFilterOutputs {
  output: AudioRef;
}

export function lowShelfFilter(inputs: LowShelfFilterInputs): Promise<LowShelfFilterOutputs> {
  return callNode<LowShelfFilterOutputs>("lib.audio.LowShelfFilter", inputs);
}

// Peak Filter — lib.audio.PeakFilter
export type PeakFilterInputs = {
  audio?: AudioRef;
  cutoff_frequency_hz?: number;
  q_factor?: number;
  gain_db?: number;
};

export interface PeakFilterOutputs {
  output: AudioRef;
}

export function peakFilter(inputs: PeakFilterInputs): Promise<PeakFilterOutputs> {
  return callNode<PeakFilterOutputs>("lib.audio.PeakFilter", inputs);
}

// Bitcrush — lib.audio.Bitcrush
export type BitcrushInputs = {
  audio?: AudioRef;
  bit_depth?: number;
  sample_rate_reduction?: number;
};

export interface BitcrushOutputs {
  output: AudioRef;
}

export function bitcrush(inputs: BitcrushInputs): Promise<BitcrushOutputs> {
  return callNode<BitcrushOutputs>("lib.audio.Bitcrush", inputs);
}

// Compress — lib.audio.Compress
export type CompressInputs = {
  audio?: AudioRef;
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  auto_gain?: boolean;
};

export interface CompressOutputs {
  output: AudioRef;
}

export function compress(inputs: CompressInputs): Promise<CompressOutputs> {
  return callNode<CompressOutputs>("lib.audio.Compress", inputs);
}

// Distortion — lib.audio.Distortion
export type DistortionInputs = {
  audio?: AudioRef;
  drive_db?: number;
};

export interface DistortionOutputs {
  output: AudioRef;
}

export function distortion(inputs: DistortionInputs): Promise<DistortionOutputs> {
  return callNode<DistortionOutputs>("lib.audio.Distortion", inputs);
}

// Limiter — lib.audio.Limiter
export type LimiterInputs = {
  audio?: AudioRef;
  threshold_db?: number;
  release_ms?: number;
  auto_gain?: boolean;
};

export interface LimiterOutputs {
  output: AudioRef;
}

export function limiter(inputs: LimiterInputs): Promise<LimiterOutputs> {
  return callNode<LimiterOutputs>("lib.audio.Limiter", inputs);
}

// Reverb — lib.audio.Reverb
export type ReverbInputs = {
  audio?: AudioRef;
  room_scale?: number;
  damping?: number;
  wet_level?: number;
  dry_level?: number;
};

export interface ReverbOutputs {
  output: AudioRef;
}

export function reverb(inputs: ReverbInputs): Promise<ReverbOutputs> {
  return callNode<ReverbOutputs>("lib.audio.Reverb", inputs);
}

// Noise Gate — lib.audio.NoiseGate
export type NoiseGateInputs = {
  audio?: AudioRef;
  threshold_db?: number;
  attack_ms?: number;
  release_ms?: number;
};

export interface NoiseGateOutputs {
  output: AudioRef;
}

export function noiseGate(inputs: NoiseGateInputs): Promise<NoiseGateOutputs> {
  return callNode<NoiseGateOutputs>("lib.audio.NoiseGate", inputs);
}

// Phaser — lib.audio.Phaser
export type PhaserInputs = {
  audio?: AudioRef;
  rate_hz?: number;
  depth?: number;
  centre_frequency_hz?: number;
  feedback?: number;
  mix?: number;
};

export interface PhaserOutputs {
  output: AudioRef;
}

export function phaser(inputs: PhaserInputs): Promise<PhaserOutputs> {
  return callNode<PhaserOutputs>("lib.audio.Phaser", inputs);
}

// Pitch Shift — lib.audio.PitchShift
export type PitchShiftInputs = {
  audio?: AudioRef;
  semitones?: number;
};

export interface PitchShiftOutputs {
  output: AudioRef;
}

export function pitchShift(inputs: PitchShiftInputs): Promise<PitchShiftOutputs> {
  return callNode<PitchShiftOutputs>("lib.audio.PitchShift", inputs);
}

// Time Stretch — lib.audio.TimeStretch
export type TimeStretchInputs = {
  audio?: AudioRef;
  rate?: number;
};

export interface TimeStretchOutputs {
  output: AudioRef;
}

export function timeStretch(inputs: TimeStretchInputs): Promise<TimeStretchOutputs> {
  return callNode<TimeStretchOutputs>("lib.audio.TimeStretch", inputs);
}
