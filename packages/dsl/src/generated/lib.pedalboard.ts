// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Gain — lib.pedalboard.Gain
export interface GainInputs {
  audio?: Connectable<AudioRef>;
  gain_db?: Connectable<number>;
}

export interface GainOutputs {
  output: AudioRef;
}

export function gain(inputs: GainInputs): DslNode<GainOutputs, "output"> {
  return createNode("lib.pedalboard.Gain", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Delay — lib.pedalboard.Delay
export interface DelayInputs {
  audio?: Connectable<AudioRef>;
  delay_seconds?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
}

export interface DelayOutputs {
  output: AudioRef;
}

export function delay(inputs: DelayInputs): DslNode<DelayOutputs, "output"> {
  return createNode("lib.pedalboard.Delay", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// High Pass Filter — lib.pedalboard.HighPassFilter
export interface HighPassFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
}

export interface HighPassFilterOutputs {
  output: AudioRef;
}

export function highPassFilter(
  inputs: HighPassFilterInputs
): DslNode<HighPassFilterOutputs, "output"> {
  return createNode(
    "lib.pedalboard.HighPassFilter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Low Pass Filter — lib.pedalboard.LowPassFilter
export interface LowPassFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
}

export interface LowPassFilterOutputs {
  output: AudioRef;
}

export function lowPassFilter(
  inputs: LowPassFilterInputs
): DslNode<LowPassFilterOutputs, "output"> {
  return createNode(
    "lib.pedalboard.LowPassFilter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// High Shelf Filter — lib.pedalboard.HighShelfFilter
export interface HighShelfFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
}

export interface HighShelfFilterOutputs {
  output: AudioRef;
}

export function highShelfFilter(
  inputs: HighShelfFilterInputs
): DslNode<HighShelfFilterOutputs, "output"> {
  return createNode(
    "lib.pedalboard.HighShelfFilter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Low Shelf Filter — lib.pedalboard.LowShelfFilter
export interface LowShelfFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
}

export interface LowShelfFilterOutputs {
  output: AudioRef;
}

export function lowShelfFilter(
  inputs: LowShelfFilterInputs
): DslNode<LowShelfFilterOutputs, "output"> {
  return createNode(
    "lib.pedalboard.LowShelfFilter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Peak Filter — lib.pedalboard.PeakFilter
export interface PeakFilterInputs {
  audio?: Connectable<AudioRef>;
  cutoff_frequency_hz?: Connectable<number>;
  q_factor?: Connectable<number>;
}

export interface PeakFilterOutputs {
  output: AudioRef;
}

export function peakFilter(
  inputs: PeakFilterInputs
): DslNode<PeakFilterOutputs, "output"> {
  return createNode(
    "lib.pedalboard.PeakFilter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Bitcrush — lib.pedalboard.Bitcrush
export interface BitcrushInputs {
  audio?: Connectable<AudioRef>;
  bit_depth?: Connectable<number>;
  sample_rate_reduction?: Connectable<number>;
}

export interface BitcrushOutputs {
  output: AudioRef;
}

export function bitcrush(
  inputs: BitcrushInputs
): DslNode<BitcrushOutputs, "output"> {
  return createNode(
    "lib.pedalboard.Bitcrush",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Compress — lib.pedalboard.Compress
export interface CompressInputs {
  audio?: Connectable<AudioRef>;
  threshold?: Connectable<number>;
  ratio?: Connectable<number>;
  attack?: Connectable<number>;
  release?: Connectable<number>;
}

export interface CompressOutputs {
  output: AudioRef;
}

export function compress(
  inputs: CompressInputs
): DslNode<CompressOutputs, "output"> {
  return createNode(
    "lib.pedalboard.Compress",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Distortion — lib.pedalboard.Distortion
export interface DistortionInputs {
  audio?: Connectable<AudioRef>;
  drive_db?: Connectable<number>;
}

export interface DistortionOutputs {
  output: AudioRef;
}

export function distortion(
  inputs: DistortionInputs
): DslNode<DistortionOutputs, "output"> {
  return createNode(
    "lib.pedalboard.Distortion",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Limiter — lib.pedalboard.Limiter
export interface LimiterInputs {
  audio?: Connectable<AudioRef>;
  threshold_db?: Connectable<number>;
  release_ms?: Connectable<number>;
}

export interface LimiterOutputs {
  output: AudioRef;
}

export function limiter(
  inputs: LimiterInputs
): DslNode<LimiterOutputs, "output"> {
  return createNode(
    "lib.pedalboard.Limiter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Reverb — lib.pedalboard.Reverb
export interface ReverbInputs {
  audio?: Connectable<AudioRef>;
  room_scale?: Connectable<number>;
  damping?: Connectable<number>;
  wet_level?: Connectable<number>;
  dry_level?: Connectable<number>;
}

export interface ReverbOutputs {
  output: AudioRef;
}

export function reverb(inputs: ReverbInputs): DslNode<ReverbOutputs, "output"> {
  return createNode(
    "lib.pedalboard.Reverb",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Pitch Shift — lib.pedalboard.PitchShift
export interface PitchShiftInputs {
  audio?: Connectable<AudioRef>;
  semitones?: Connectable<number>;
}

export interface PitchShiftOutputs {
  output: AudioRef;
}

export function pitchShift(
  inputs: PitchShiftInputs
): DslNode<PitchShiftOutputs, "output"> {
  return createNode(
    "lib.pedalboard.PitchShift",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Time Stretch — lib.pedalboard.TimeStretch
export interface TimeStretchInputs {
  audio?: Connectable<AudioRef>;
  rate?: Connectable<number>;
}

export interface TimeStretchOutputs {
  output: AudioRef;
}

export function timeStretch(
  inputs: TimeStretchInputs
): DslNode<TimeStretchOutputs, "output"> {
  return createNode(
    "lib.pedalboard.TimeStretch",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Noise Gate — lib.pedalboard.NoiseGate
export interface NoiseGateInputs {
  audio?: Connectable<AudioRef>;
  threshold_db?: Connectable<number>;
  attack_ms?: Connectable<number>;
  release_ms?: Connectable<number>;
}

export interface NoiseGateOutputs {
  output: AudioRef;
}

export function noiseGate(
  inputs: NoiseGateInputs
): DslNode<NoiseGateOutputs, "output"> {
  return createNode(
    "lib.pedalboard.NoiseGate",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface PhaserOutputs {
  output: AudioRef;
}

export function phaser(inputs: PhaserInputs): DslNode<PhaserOutputs, "output"> {
  return createNode(
    "lib.pedalboard.Phaser",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
