// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Oscillator — nodetool.audio.synth.Oscillator
export type OscillatorInputs = {
  pitch_cv?: unknown | unknown[];
  fm?: unknown | unknown[];
  waveform?: "sine" | "saw" | "square" | "triangle" | "noise" | ("sine" | "saw" | "square" | "triangle" | "noise")[];
  frequency?: number | number[];
  amplitude?: number | number[];
  pulse_width?: number | number[];
  fm_amount?: number | number[];
  sample_rate?: number | number[];
};

export interface OscillatorOutputs {
  chunk: unknown;
}

export function oscillator(inputs: OscillatorInputs): Promise<OscillatorOutputs> {
  return callNode<OscillatorOutputs>("nodetool.audio.synth.Oscillator", inputs);
}

oscillator.stream = function (inputs: OscillatorInputs): AsyncIterable<{ slot: keyof OscillatorOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof OscillatorOutputs & string; value: unknown }>("nodetool.audio.synth.Oscillator", inputs);
};

// LFO — nodetool.audio.synth.LFO
export type LFOInputs = {
  clock?: unknown | unknown[];
  waveform?: "sine" | "triangle" | "saw" | "square" | ("sine" | "triangle" | "saw" | "square")[];
  rate_hz?: number | number[];
  depth?: number | number[];
  offset?: number | number[];
  sample_rate?: number | number[];
};

export interface LFOOutputs {
  cv: unknown;
}

export function lfo(inputs: LFOInputs): Promise<LFOOutputs> {
  return callNode<LFOOutputs>("nodetool.audio.synth.LFO", inputs);
}

lfo.stream = function (inputs: LFOInputs): AsyncIterable<{ slot: keyof LFOOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof LFOOutputs & string; value: unknown }>("nodetool.audio.synth.LFO", inputs);
};

// ADSR — nodetool.audio.synth.ADSR
export type ADSRInputs = {
  gate?: unknown | unknown[];
  attack?: number | number[];
  decay?: number | number[];
  sustain?: number | number[];
  release?: number | number[];
};

export interface ADSROutputs {
  cv: unknown;
}

export function adsr(inputs: ADSRInputs): Promise<ADSROutputs> {
  return callNode<ADSROutputs>("nodetool.audio.synth.ADSR", inputs);
}

adsr.stream = function (inputs: ADSRInputs): AsyncIterable<{ slot: keyof ADSROutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof ADSROutputs & string; value: unknown }>("nodetool.audio.synth.ADSR", inputs);
};

// Gate — nodetool.audio.synth.Gate
export type GateInputs = {
  on_duration?: number | number[];
  off_duration?: number | number[];
  amplitude?: number | number[];
  sample_rate?: number | number[];
};

export interface GateOutputs {
  cv: unknown;
}

export function gate(inputs: GateInputs): Promise<GateOutputs> {
  return callNode<GateOutputs>("nodetool.audio.synth.Gate", inputs);
}

gate.stream = function (inputs: GateInputs): AsyncIterable<{ slot: keyof GateOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof GateOutputs & string; value: unknown }>("nodetool.audio.synth.Gate", inputs);
};

// VCA — nodetool.audio.synth.VCA
export type VCAInputs = {
  audio?: unknown | unknown[];
  cv?: unknown | unknown[];
  gain?: number | number[];
};

export interface VCAOutputs {
  chunk: unknown;
}

export function vca(inputs: VCAInputs): Promise<VCAOutputs> {
  return callNode<VCAOutputs>("nodetool.audio.synth.VCA", inputs);
}

vca.stream = function (inputs: VCAInputs): AsyncIterable<{ slot: keyof VCAOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof VCAOutputs & string; value: unknown }>("nodetool.audio.synth.VCA", inputs);
};

// VCF — nodetool.audio.synth.VCF
export type VCFInputs = {
  audio?: unknown | unknown[];
  cutoff_cv?: unknown | unknown[];
  mode?: "lowpass" | "highpass" | ("lowpass" | "highpass")[];
  cutoff_hz?: number | number[];
  q?: number | number[];
  cv_amount?: number | number[];
};

export interface VCFOutputs {
  chunk: unknown;
}

export function vcf(inputs: VCFInputs): Promise<VCFOutputs> {
  return callNode<VCFOutputs>("nodetool.audio.synth.VCF", inputs);
}

vcf.stream = function (inputs: VCFInputs): AsyncIterable<{ slot: keyof VCFOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof VCFOutputs & string; value: unknown }>("nodetool.audio.synth.VCF", inputs);
};

// Attenuverter — nodetool.audio.synth.Attenuverter
export type AttenuverterInputs = {
  signal?: unknown | unknown[];
  scale?: number | number[];
  offset?: number | number[];
};

export interface AttenuverterOutputs {
  cv: unknown;
}

export function attenuverter(inputs: AttenuverterInputs): Promise<AttenuverterOutputs> {
  return callNode<AttenuverterOutputs>("nodetool.audio.synth.Attenuverter", inputs);
}

attenuverter.stream = function (inputs: AttenuverterInputs): AsyncIterable<{ slot: keyof AttenuverterOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof AttenuverterOutputs & string; value: unknown }>("nodetool.audio.synth.Attenuverter", inputs);
};

// Sample & Hold — nodetool.audio.synth.SampleHold
export type SampleHoldInputs = {
  signal?: unknown | unknown[];
  trigger?: unknown | unknown[];
};

export interface SampleHoldOutputs {
  cv: unknown;
}

export function sampleHold(inputs: SampleHoldInputs): Promise<SampleHoldOutputs> {
  return callNode<SampleHoldOutputs>("nodetool.audio.synth.SampleHold", inputs);
}

sampleHold.stream = function (inputs: SampleHoldInputs): AsyncIterable<{ slot: keyof SampleHoldOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof SampleHoldOutputs & string; value: unknown }>("nodetool.audio.synth.SampleHold", inputs);
};

// Mixer — nodetool.audio.synth.Mixer
export type MixerInputs = {
  in1?: unknown | unknown[];
  in2?: unknown | unknown[];
  in3?: unknown | unknown[];
  in4?: unknown | unknown[];
  level1?: number | number[];
  level2?: number | number[];
  level3?: number | number[];
  level4?: number | number[];
};

export interface MixerOutputs {
  chunk: unknown;
}

export function mixer(inputs: MixerInputs): Promise<MixerOutputs> {
  return callNode<MixerOutputs>("nodetool.audio.synth.Mixer", inputs);
}

mixer.stream = function (inputs: MixerInputs): AsyncIterable<{ slot: keyof MixerOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof MixerOutputs & string; value: unknown }>("nodetool.audio.synth.Mixer", inputs);
};
