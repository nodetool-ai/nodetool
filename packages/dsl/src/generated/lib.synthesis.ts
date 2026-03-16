// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { AudioRef } from "../types.js";

// Oscillator — lib.synthesis.Oscillator
export interface OscillatorInputs {
  waveform?: Connectable<unknown>;
  frequency?: Connectable<number>;
  amplitude?: Connectable<number>;
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
  pitch_envelope_amount?: Connectable<number>;
  pitch_envelope_time?: Connectable<number>;
  pitch_envelope_curve?: Connectable<unknown>;
}

export function oscillator(inputs: OscillatorInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.synthesis.Oscillator", inputs as Record<string, unknown>);
}

// White Noise — lib.synthesis.WhiteNoise
export interface WhiteNoiseInputs {
  amplitude?: Connectable<number>;
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
}

export function whiteNoise(inputs: WhiteNoiseInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.synthesis.WhiteNoise", inputs as Record<string, unknown>);
}

// Pink Noise — lib.synthesis.PinkNoise
export interface PinkNoiseInputs {
  amplitude?: Connectable<number>;
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
}

export function pinkNoise(inputs: PinkNoiseInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.synthesis.PinkNoise", inputs as Record<string, unknown>);
}

// FM Synthesis — lib.synthesis.FM_Synthesis
export interface FM_SynthesisInputs {
  carrier_freq?: Connectable<number>;
  modulator_freq?: Connectable<number>;
  modulation_index?: Connectable<number>;
  amplitude?: Connectable<number>;
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
}

export function fM_Synthesis(inputs: FM_SynthesisInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.synthesis.FM_Synthesis", inputs as Record<string, unknown>);
}

// Envelope — lib.synthesis.Envelope
export interface EnvelopeInputs {
  audio?: Connectable<AudioRef>;
  attack?: Connectable<number>;
  decay?: Connectable<number>;
  release?: Connectable<number>;
  peak_amplitude?: Connectable<number>;
}

export function envelope(inputs: EnvelopeInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.synthesis.Envelope", inputs as Record<string, unknown>);
}
