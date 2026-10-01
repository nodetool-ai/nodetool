// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Oscillator — nodetool.audio.synth.Oscillator
export type OscillatorInputs = {
  pitch_cv?: Connectable<unknown>;
  fm?: Connectable<unknown>;
  waveform?: Connectable<"sine" | "saw" | "square" | "triangle" | "noise">;
  frequency?: Connectable<number>;
  amplitude?: Connectable<number>;
  pulse_width?: Connectable<number>;
  fm_amount?: Connectable<number>;
  sample_rate?: Connectable<number>;
};

export interface OscillatorOutputs {
  chunk: unknown;
}

export function oscillator(inputs: OscillatorInputs, options?: NodeOptions): NodeWithOutputs<OscillatorOutputs, "chunk"> {
  return createNode("nodetool.audio.synth.Oscillator", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// LFO — nodetool.audio.synth.LFO
export type LFOInputs = {
  clock?: Connectable<unknown>;
  waveform?: Connectable<"sine" | "triangle" | "saw" | "square">;
  rate_hz?: Connectable<number>;
  depth?: Connectable<number>;
  offset?: Connectable<number>;
  sample_rate?: Connectable<number>;
};

export interface LFOOutputs {
  cv: unknown;
}

export function lfo(inputs: LFOInputs, options?: NodeOptions): NodeWithOutputs<LFOOutputs, "cv"> {
  return createNode("nodetool.audio.synth.LFO", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: {"cv":"cv"}, defaultOutput: "cv", streamingInput: true });
}

// ADSR — nodetool.audio.synth.ADSR
export type ADSRInputs = {
  gate?: Connectable<unknown>;
  attack?: Connectable<number>;
  decay?: Connectable<number>;
  sustain?: Connectable<number>;
  release?: Connectable<number>;
};

export interface ADSROutputs {
  cv: unknown;
}

export function adsr(inputs: ADSRInputs, options?: NodeOptions): NodeWithOutputs<ADSROutputs, "cv"> {
  return createNode("nodetool.audio.synth.ADSR", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: {"cv":"cv"}, defaultOutput: "cv", streamingInput: true });
}

// Gate — nodetool.audio.synth.Gate
export type GateInputs = {
  on_duration?: Connectable<number>;
  off_duration?: Connectable<number>;
  amplitude?: Connectable<number>;
  sample_rate?: Connectable<number>;
};

export interface GateOutputs {
  cv: unknown;
}

export function gate(inputs: GateInputs, options?: NodeOptions): NodeWithOutputs<GateOutputs, "cv"> {
  return createNode("nodetool.audio.synth.Gate", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: {"cv":"cv"}, defaultOutput: "cv", streamingInput: true });
}

// VCA — nodetool.audio.synth.VCA
export type VCAInputs = {
  audio?: Connectable<unknown>;
  cv?: Connectable<unknown>;
  gain?: Connectable<number>;
};

export interface VCAOutputs {
  chunk: unknown;
}

export function vca(inputs: VCAInputs, options?: NodeOptions): NodeWithOutputs<VCAOutputs, "chunk"> {
  return createNode("nodetool.audio.synth.VCA", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// VCF — nodetool.audio.synth.VCF
export type VCFInputs = {
  audio?: Connectable<unknown>;
  cutoff_cv?: Connectable<unknown>;
  mode?: Connectable<"lowpass" | "highpass">;
  cutoff_hz?: Connectable<number>;
  q?: Connectable<number>;
  cv_amount?: Connectable<number>;
};

export interface VCFOutputs {
  chunk: unknown;
}

export function vcf(inputs: VCFInputs, options?: NodeOptions): NodeWithOutputs<VCFOutputs, "chunk"> {
  return createNode("nodetool.audio.synth.VCF", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Attenuverter — nodetool.audio.synth.Attenuverter
export type AttenuverterInputs = {
  signal?: Connectable<unknown>;
  scale?: Connectable<number>;
  offset?: Connectable<number>;
};

export interface AttenuverterOutputs {
  cv: unknown;
}

export function attenuverter(inputs: AttenuverterInputs, options?: NodeOptions): NodeWithOutputs<AttenuverterOutputs, "cv"> {
  return createNode("nodetool.audio.synth.Attenuverter", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: {"cv":"cv"}, defaultOutput: "cv", streamingInput: true });
}

// Sample & Hold — nodetool.audio.synth.SampleHold
export type SampleHoldInputs = {
  signal?: Connectable<unknown>;
  trigger?: Connectable<unknown>;
};

export interface SampleHoldOutputs {
  cv: unknown;
}

export function sampleHold(inputs: SampleHoldInputs, options?: NodeOptions): NodeWithOutputs<SampleHoldOutputs, "cv"> {
  return createNode("nodetool.audio.synth.SampleHold", inputs, { id: options?.id, outputNames: ["cv"], outputTypes: {"cv":"cv"}, defaultOutput: "cv", streamingInput: true });
}

// Mixer — nodetool.audio.synth.Mixer
export type MixerInputs = {
  in1?: Connectable<unknown>;
  in2?: Connectable<unknown>;
  in3?: Connectable<unknown>;
  in4?: Connectable<unknown>;
  level1?: Connectable<number>;
  level2?: Connectable<number>;
  level3?: Connectable<number>;
  level4?: Connectable<number>;
};

export interface MixerOutputs {
  chunk: unknown;
}

export function mixer(inputs: MixerInputs, options?: NodeOptions): NodeWithOutputs<MixerOutputs, "chunk"> {
  return createNode("nodetool.audio.synth.Mixer", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}
