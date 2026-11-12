// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { AudioRef } from "../types.js";

// Streaming Bitcrush — nodetool.audio.realtime.StreamingBitcrush
export type StreamingBitcrushInputs = {
  bit_depth?: Connectable<number>;
  sample_rate_reduction?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingBitcrushOutputs {
  chunk: unknown;
}

export function streamingBitcrush(inputs: StreamingBitcrushInputs, options?: NodeOptions): NodeWithOutputs<StreamingBitcrushOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingBitcrush", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Compress — nodetool.audio.realtime.StreamingCompress
export type StreamingCompressInputs = {
  threshold?: Connectable<number>;
  ratio?: Connectable<number>;
  attack?: Connectable<number>;
  release?: Connectable<number>;
  auto_gain?: Connectable<boolean>;
  chunk?: Connectable<unknown>;
};

export interface StreamingCompressOutputs {
  chunk: unknown;
}

export function streamingCompress(inputs: StreamingCompressInputs, options?: NodeOptions): NodeWithOutputs<StreamingCompressOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingCompress", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Distortion — nodetool.audio.realtime.StreamingDistortion
export type StreamingDistortionInputs = {
  drive_db?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingDistortionOutputs {
  chunk: unknown;
}

export function streamingDistortion(inputs: StreamingDistortionInputs, options?: NodeOptions): NodeWithOutputs<StreamingDistortionOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingDistortion", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Limiter — nodetool.audio.realtime.StreamingLimiter
export type StreamingLimiterInputs = {
  threshold_db?: Connectable<number>;
  release_ms?: Connectable<number>;
  auto_gain?: Connectable<boolean>;
  chunk?: Connectable<unknown>;
};

export interface StreamingLimiterOutputs {
  chunk: unknown;
}

export function streamingLimiter(inputs: StreamingLimiterInputs, options?: NodeOptions): NodeWithOutputs<StreamingLimiterOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingLimiter", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Reverb — nodetool.audio.realtime.StreamingReverb
export type StreamingReverbInputs = {
  room_scale?: Connectable<number>;
  damping?: Connectable<number>;
  wet_level?: Connectable<number>;
  dry_level?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingReverbOutputs {
  chunk: unknown;
}

export function streamingReverb(inputs: StreamingReverbInputs, options?: NodeOptions): NodeWithOutputs<StreamingReverbOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingReverb", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Noise Gate — nodetool.audio.realtime.StreamingNoiseGate
export type StreamingNoiseGateInputs = {
  threshold_db?: Connectable<number>;
  attack_ms?: Connectable<number>;
  release_ms?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingNoiseGateOutputs {
  chunk: unknown;
}

export function streamingNoiseGate(inputs: StreamingNoiseGateInputs, options?: NodeOptions): NodeWithOutputs<StreamingNoiseGateOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingNoiseGate", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Phaser — nodetool.audio.realtime.StreamingPhaser
export type StreamingPhaserInputs = {
  rate_hz?: Connectable<number>;
  depth?: Connectable<number>;
  centre_frequency_hz?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingPhaserOutputs {
  chunk: unknown;
}

export function streamingPhaser(inputs: StreamingPhaserInputs, options?: NodeOptions): NodeWithOutputs<StreamingPhaserOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingPhaser", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Delay — nodetool.audio.realtime.StreamingDelay
export type StreamingDelayInputs = {
  delay_seconds?: Connectable<number>;
  feedback?: Connectable<number>;
  mix?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingDelayOutputs {
  chunk: unknown;
}

export function streamingDelay(inputs: StreamingDelayInputs, options?: NodeOptions): NodeWithOutputs<StreamingDelayOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingDelay", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming High Shelf — nodetool.audio.realtime.StreamingHighShelf
export type StreamingHighShelfInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingHighShelfOutputs {
  chunk: unknown;
}

export function streamingHighShelf(inputs: StreamingHighShelfInputs, options?: NodeOptions): NodeWithOutputs<StreamingHighShelfOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingHighShelf", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Low Shelf — nodetool.audio.realtime.StreamingLowShelf
export type StreamingLowShelfInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  gain_db?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingLowShelfOutputs {
  chunk: unknown;
}

export function streamingLowShelf(inputs: StreamingLowShelfInputs, options?: NodeOptions): NodeWithOutputs<StreamingLowShelfOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingLowShelf", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Peak — nodetool.audio.realtime.StreamingPeak
export type StreamingPeakInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  q_factor?: Connectable<number>;
  gain_db?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingPeakOutputs {
  chunk: unknown;
}

export function streamingPeak(inputs: StreamingPeakInputs, options?: NodeOptions): NodeWithOutputs<StreamingPeakOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingPeak", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Audio To Chunks — nodetool.audio.realtime.AudioToChunks
export type AudioToChunksInputs = {
  audio?: Connectable<AudioRef>;
  chunk_duration?: Connectable<number>;
  loop?: Connectable<boolean>;
};

export interface AudioToChunksOutputs {
  chunk: unknown;
}

export function audioToChunks(inputs: AudioToChunksInputs, options?: NodeOptions): NodeWithOutputs<AudioToChunksOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.AudioToChunks", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streaming: true, outputCorrelation: {"chunk":{"kind":"iteration","source":"__execution__","group":"stream"}} });
}

// Audio Out — nodetool.audio.realtime.AudioOutput
export type AudioOutputInputs = {
  chunk?: Connectable<unknown>;
};

export interface AudioOutputOutputs {
  chunk: unknown;
}

export function audioOutput(inputs: AudioOutputInputs, options?: NodeOptions): NodeWithOutputs<AudioOutputOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.AudioOutput", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Chunks To Audio — nodetool.audio.realtime.ChunksToAudio
export type ChunksToAudioInputs = {
  duration?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface ChunksToAudioOutputs {
  audio: AudioRef;
}

export function chunksToAudio(inputs: ChunksToAudioInputs, options?: NodeOptions): NodeWithOutputs<ChunksToAudioOutputs, "audio"> {
  return createNode("nodetool.audio.realtime.ChunksToAudio", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: {"audio":"audio"}, defaultOutput: "audio", streamingInput: true });
}

// Streaming Gain — nodetool.audio.realtime.StreamingGain
export type StreamingGainInputs = {
  gain_db?: Connectable<number>;
  chunk?: Connectable<unknown>;
};

export interface StreamingGainOutputs {
  chunk: unknown;
}

export function streamingGain(inputs: StreamingGainInputs, options?: NodeOptions): NodeWithOutputs<StreamingGainOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingGain", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Low Pass — nodetool.audio.realtime.StreamingLowPass
export type StreamingLowPassInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  chunk?: Connectable<unknown>;
  q?: Connectable<number>;
};

export interface StreamingLowPassOutputs {
  chunk: unknown;
}

export function streamingLowPass(inputs: StreamingLowPassInputs, options?: NodeOptions): NodeWithOutputs<StreamingLowPassOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingLowPass", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming High Pass — nodetool.audio.realtime.StreamingHighPass
export type StreamingHighPassInputs = {
  cutoff_frequency_hz?: Connectable<number>;
  chunk?: Connectable<unknown>;
  q?: Connectable<number>;
};

export interface StreamingHighPassOutputs {
  chunk: unknown;
}

export function streamingHighPass(inputs: StreamingHighPassInputs, options?: NodeOptions): NodeWithOutputs<StreamingHighPassOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingHighPass", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}
