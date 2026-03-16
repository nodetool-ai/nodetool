// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { AudioRef } from "../types.js";

// Gain — lib.pedalboard.Gain
export interface GainInputs {
  audio?: Connectable<AudioRef>;
  gain_db?: Connectable<number>;
}

export function gain(inputs: GainInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Gain", inputs as Record<string, unknown>);
}

// Delay — lib.pedalboard.Delay
export interface DelayInputs {
  audio?: Connectable<AudioRef>;
  delay_seconds?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
}

export function delay(inputs: DelayInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Delay", inputs as Record<string, unknown>);
}

// High Pass Filter — lib.pedalboard.HighPassFilter
export interface HighPassFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
}

export function highPassFilter(inputs: HighPassFilterInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.HighPassFilter", inputs as Record<string, unknown>);
}

// Low Pass Filter — lib.pedalboard.LowPassFilter
export interface LowPassFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
}

export function lowPassFilter(inputs: LowPassFilterInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.LowPassFilter", inputs as Record<string, unknown>);
}

// High Shelf Filter — lib.pedalboard.HighShelfFilter
export interface HighShelfFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
}

export function highShelfFilter(inputs: HighShelfFilterInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.HighShelfFilter", inputs as Record<string, unknown>);
}

// Low Shelf Filter — lib.pedalboard.LowShelfFilter
export interface LowShelfFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
}

export function lowShelfFilter(inputs: LowShelfFilterInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.LowShelfFilter", inputs as Record<string, unknown>);
}

// Peak Filter — lib.pedalboard.PeakFilter
export interface PeakFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  q_factor?: Connectable<number>;
}

export function peakFilter(inputs: PeakFilterInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.PeakFilter", inputs as Record<string, unknown>);
}

// Bitcrush — lib.pedalboard.Bitcrush
export interface BitcrushInputs {
  audio?: Connectable<AudioRef>;
  bit_depth?: Connectable<number>;
  sample_rate_reduction?: Connectable<number>;
}

export function bitcrush(inputs: BitcrushInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Bitcrush", inputs as Record<string, unknown>);
}

// Compress — lib.pedalboard.Compress
export interface CompressInputs {
  audio?: Connectable<AudioRef>;
  threshold?: Connectable<number>;
  ratio?: Connectable<number>;
  attack?: Connectable<number>;
  release?: Connectable<number>;
}

export function compress(inputs: CompressInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Compress", inputs as Record<string, unknown>);
}

// Distortion — lib.pedalboard.Distortion
export interface DistortionInputs {
  audio?: Connectable<AudioRef>;
  drive_db?: Connectable<number>;
}

export function distortion(inputs: DistortionInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Distortion", inputs as Record<string, unknown>);
}

// Limiter — lib.pedalboard.Limiter
export interface LimiterInputs {
  audio?: Connectable<AudioRef>;
  threshold_db?: Connectable<number>;
  release_ms?: Connectable<number>;
}

export function limiter(inputs: LimiterInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Limiter", inputs as Record<string, unknown>);
}

// Reverb — lib.pedalboard.Reverb
export interface ReverbInputs {
  audio?: Connectable<AudioRef>;
  room_scale?: Connectable<number>;
  damping?: Connectable<number>;
  wet_level?: Connectable<number>;
  dry_level?: Connectable<number>;
}

export function reverb(inputs: ReverbInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Reverb", inputs as Record<string, unknown>);
}

// Pitch Shift — lib.pedalboard.PitchShift
export interface PitchShiftInputs {
  audio?: Connectable<AudioRef>;
  semitones?: Connectable<number>;
}

export function pitchShift(inputs: PitchShiftInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.PitchShift", inputs as Record<string, unknown>);
}

// Time Stretch — lib.pedalboard.TimeStretch
export interface TimeStretchInputs {
  audio?: Connectable<AudioRef>;
  rate?: Connectable<number>;
}

export function timeStretch(inputs: TimeStretchInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.TimeStretch", inputs as Record<string, unknown>);
}

// Noise Gate — lib.pedalboard.NoiseGate
export interface NoiseGateInputs {
  audio?: Connectable<AudioRef>;
  threshold_db?: Connectable<number>;
  attack_ms?: Connectable<number>;
  release_ms?: Connectable<number>;
}

export function noiseGate(inputs: NoiseGateInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.NoiseGate", inputs as Record<string, unknown>);
}

// Phaser — lib.pedalboard.Phaser
export interface PhaserInputs {
  audio?: Connectable<AudioRef>;
  rate_hz?: Connectable<number>;
  depth?: Connectable<number>;
  centre_frequency_hz?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
}

export function phaser(inputs: PhaserInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.pedalboard.Phaser", inputs as Record<string, unknown>);
}
