// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export interface OscillatorOutputs {
  output: AudioRef;
}

export function oscillator(
  inputs: OscillatorInputs
): DslNode<OscillatorOutputs, "output"> {
  return createNode(
    "lib.synthesis.Oscillator",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// White Noise — lib.synthesis.WhiteNoise
export interface WhiteNoiseInputs {
  amplitude?: Connectable<number>;
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
}

export interface WhiteNoiseOutputs {
  output: AudioRef;
}

export function whiteNoise(
  inputs: WhiteNoiseInputs
): DslNode<WhiteNoiseOutputs, "output"> {
  return createNode(
    "lib.synthesis.WhiteNoise",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Pink Noise — lib.synthesis.PinkNoise
export interface PinkNoiseInputs {
  amplitude?: Connectable<number>;
  duration?: Connectable<number>;
  sample_rate?: Connectable<number>;
}

export interface PinkNoiseOutputs {
  output: AudioRef;
}

export function pinkNoise(
  inputs: PinkNoiseInputs
): DslNode<PinkNoiseOutputs, "output"> {
  return createNode(
    "lib.synthesis.PinkNoise",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface FM_SynthesisOutputs {
  output: AudioRef;
}

export function fM_Synthesis(
  inputs: FM_SynthesisInputs
): DslNode<FM_SynthesisOutputs, "output"> {
  return createNode(
    "lib.synthesis.FM_Synthesis",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Envelope — lib.synthesis.Envelope
export interface EnvelopeInputs {
  audio?: Connectable<AudioRef>;
  attack?: Connectable<number>;
  decay?: Connectable<number>;
  release?: Connectable<number>;
  peak_amplitude?: Connectable<number>;
}

export interface EnvelopeOutputs {
  output: AudioRef;
}

export function envelope(
  inputs: EnvelopeInputs
): DslNode<EnvelopeOutputs, "output"> {
  return createNode(
    "lib.synthesis.Envelope",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
