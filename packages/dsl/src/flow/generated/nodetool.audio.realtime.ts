// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { AudioRef } from "../../types.js";

// Streaming Bitcrush — nodetool.audio.realtime.StreamingBitcrush
export type StreamingBitcrushInputs = {
  bit_depth?: number | number[];
  sample_rate_reduction?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingBitcrushOutputs {
  chunk: unknown;
}

export function streamingBitcrush(inputs: StreamingBitcrushInputs): Promise<StreamingBitcrushOutputs> {
  return callNode<StreamingBitcrushOutputs>("nodetool.audio.realtime.StreamingBitcrush", inputs);
}

streamingBitcrush.stream = function (inputs: StreamingBitcrushInputs): AsyncIterable<{ slot: keyof StreamingBitcrushOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingBitcrushOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingBitcrush", inputs);
};

// Streaming Compress — nodetool.audio.realtime.StreamingCompress
export type StreamingCompressInputs = {
  threshold?: number | number[];
  ratio?: number | number[];
  attack?: number | number[];
  release?: number | number[];
  auto_gain?: boolean | boolean[];
  chunk?: unknown | unknown[];
};

export interface StreamingCompressOutputs {
  chunk: unknown;
}

export function streamingCompress(inputs: StreamingCompressInputs): Promise<StreamingCompressOutputs> {
  return callNode<StreamingCompressOutputs>("nodetool.audio.realtime.StreamingCompress", inputs);
}

streamingCompress.stream = function (inputs: StreamingCompressInputs): AsyncIterable<{ slot: keyof StreamingCompressOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingCompressOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingCompress", inputs);
};

// Streaming Distortion — nodetool.audio.realtime.StreamingDistortion
export type StreamingDistortionInputs = {
  drive_db?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingDistortionOutputs {
  chunk: unknown;
}

export function streamingDistortion(inputs: StreamingDistortionInputs): Promise<StreamingDistortionOutputs> {
  return callNode<StreamingDistortionOutputs>("nodetool.audio.realtime.StreamingDistortion", inputs);
}

streamingDistortion.stream = function (inputs: StreamingDistortionInputs): AsyncIterable<{ slot: keyof StreamingDistortionOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingDistortionOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingDistortion", inputs);
};

// Streaming Limiter — nodetool.audio.realtime.StreamingLimiter
export type StreamingLimiterInputs = {
  threshold_db?: number | number[];
  release_ms?: number | number[];
  auto_gain?: boolean | boolean[];
  chunk?: unknown | unknown[];
};

export interface StreamingLimiterOutputs {
  chunk: unknown;
}

export function streamingLimiter(inputs: StreamingLimiterInputs): Promise<StreamingLimiterOutputs> {
  return callNode<StreamingLimiterOutputs>("nodetool.audio.realtime.StreamingLimiter", inputs);
}

streamingLimiter.stream = function (inputs: StreamingLimiterInputs): AsyncIterable<{ slot: keyof StreamingLimiterOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingLimiterOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingLimiter", inputs);
};

// Streaming Reverb — nodetool.audio.realtime.StreamingReverb
export type StreamingReverbInputs = {
  room_scale?: number | number[];
  damping?: number | number[];
  wet_level?: number | number[];
  dry_level?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingReverbOutputs {
  chunk: unknown;
}

export function streamingReverb(inputs: StreamingReverbInputs): Promise<StreamingReverbOutputs> {
  return callNode<StreamingReverbOutputs>("nodetool.audio.realtime.StreamingReverb", inputs);
}

streamingReverb.stream = function (inputs: StreamingReverbInputs): AsyncIterable<{ slot: keyof StreamingReverbOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingReverbOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingReverb", inputs);
};

// Streaming Noise Gate — nodetool.audio.realtime.StreamingNoiseGate
export type StreamingNoiseGateInputs = {
  threshold_db?: number | number[];
  attack_ms?: number | number[];
  release_ms?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingNoiseGateOutputs {
  chunk: unknown;
}

export function streamingNoiseGate(inputs: StreamingNoiseGateInputs): Promise<StreamingNoiseGateOutputs> {
  return callNode<StreamingNoiseGateOutputs>("nodetool.audio.realtime.StreamingNoiseGate", inputs);
}

streamingNoiseGate.stream = function (inputs: StreamingNoiseGateInputs): AsyncIterable<{ slot: keyof StreamingNoiseGateOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingNoiseGateOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingNoiseGate", inputs);
};

// Streaming Phaser — nodetool.audio.realtime.StreamingPhaser
export type StreamingPhaserInputs = {
  rate_hz?: number | number[];
  depth?: number | number[];
  centre_frequency_hz?: number | number[];
  feedback?: number | number[];
  mix?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingPhaserOutputs {
  chunk: unknown;
}

export function streamingPhaser(inputs: StreamingPhaserInputs): Promise<StreamingPhaserOutputs> {
  return callNode<StreamingPhaserOutputs>("nodetool.audio.realtime.StreamingPhaser", inputs);
}

streamingPhaser.stream = function (inputs: StreamingPhaserInputs): AsyncIterable<{ slot: keyof StreamingPhaserOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingPhaserOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingPhaser", inputs);
};

// Streaming Delay — nodetool.audio.realtime.StreamingDelay
export type StreamingDelayInputs = {
  delay_seconds?: number | number[];
  feedback?: number | number[];
  mix?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingDelayOutputs {
  chunk: unknown;
}

export function streamingDelay(inputs: StreamingDelayInputs): Promise<StreamingDelayOutputs> {
  return callNode<StreamingDelayOutputs>("nodetool.audio.realtime.StreamingDelay", inputs);
}

streamingDelay.stream = function (inputs: StreamingDelayInputs): AsyncIterable<{ slot: keyof StreamingDelayOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingDelayOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingDelay", inputs);
};

// Streaming High Shelf — nodetool.audio.realtime.StreamingHighShelf
export type StreamingHighShelfInputs = {
  cutoff_frequency_hz?: number | number[];
  gain_db?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingHighShelfOutputs {
  chunk: unknown;
}

export function streamingHighShelf(inputs: StreamingHighShelfInputs): Promise<StreamingHighShelfOutputs> {
  return callNode<StreamingHighShelfOutputs>("nodetool.audio.realtime.StreamingHighShelf", inputs);
}

streamingHighShelf.stream = function (inputs: StreamingHighShelfInputs): AsyncIterable<{ slot: keyof StreamingHighShelfOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingHighShelfOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingHighShelf", inputs);
};

// Streaming Low Shelf — nodetool.audio.realtime.StreamingLowShelf
export type StreamingLowShelfInputs = {
  cutoff_frequency_hz?: number | number[];
  gain_db?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingLowShelfOutputs {
  chunk: unknown;
}

export function streamingLowShelf(inputs: StreamingLowShelfInputs): Promise<StreamingLowShelfOutputs> {
  return callNode<StreamingLowShelfOutputs>("nodetool.audio.realtime.StreamingLowShelf", inputs);
}

streamingLowShelf.stream = function (inputs: StreamingLowShelfInputs): AsyncIterable<{ slot: keyof StreamingLowShelfOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingLowShelfOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingLowShelf", inputs);
};

// Streaming Peak — nodetool.audio.realtime.StreamingPeak
export type StreamingPeakInputs = {
  cutoff_frequency_hz?: number | number[];
  q_factor?: number | number[];
  gain_db?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingPeakOutputs {
  chunk: unknown;
}

export function streamingPeak(inputs: StreamingPeakInputs): Promise<StreamingPeakOutputs> {
  return callNode<StreamingPeakOutputs>("nodetool.audio.realtime.StreamingPeak", inputs);
}

streamingPeak.stream = function (inputs: StreamingPeakInputs): AsyncIterable<{ slot: keyof StreamingPeakOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingPeakOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingPeak", inputs);
};

// Audio To Chunks — nodetool.audio.realtime.AudioToChunks
export type AudioToChunksInputs = {
  audio?: AudioRef;
  chunk_duration?: number;
  loop?: boolean;
};

export interface AudioToChunksOutputs {
  chunk: unknown;
}

export function audioToChunks(inputs: AudioToChunksInputs): Promise<AudioToChunksOutputs> {
  return callNode<AudioToChunksOutputs>("nodetool.audio.realtime.AudioToChunks", inputs);
}

audioToChunks.stream = function (inputs: AudioToChunksInputs): AsyncIterable<Partial<AudioToChunksOutputs>> {
  return streamNode<Partial<AudioToChunksOutputs>>("nodetool.audio.realtime.AudioToChunks", inputs);
};

// Audio Out — nodetool.audio.realtime.AudioOutput
export type AudioOutputInputs = {
  chunk?: unknown | unknown[];
};

export interface AudioOutputOutputs {
  chunk: unknown;
}

export function audioOutput(inputs: AudioOutputInputs): Promise<AudioOutputOutputs> {
  return callNode<AudioOutputOutputs>("nodetool.audio.realtime.AudioOutput", inputs);
}

audioOutput.stream = function (inputs: AudioOutputInputs): AsyncIterable<{ slot: keyof AudioOutputOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof AudioOutputOutputs & string; value: unknown }>("nodetool.audio.realtime.AudioOutput", inputs);
};

// Chunks To Audio — nodetool.audio.realtime.ChunksToAudio
export type ChunksToAudioInputs = {
  duration?: number | number[];
  chunk?: unknown | unknown[];
};

export interface ChunksToAudioOutputs {
  audio: AudioRef;
}

export function chunksToAudio(inputs: ChunksToAudioInputs): Promise<ChunksToAudioOutputs> {
  return callNode<ChunksToAudioOutputs>("nodetool.audio.realtime.ChunksToAudio", inputs);
}

chunksToAudio.stream = function (inputs: ChunksToAudioInputs): AsyncIterable<{ slot: keyof ChunksToAudioOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof ChunksToAudioOutputs & string; value: unknown }>("nodetool.audio.realtime.ChunksToAudio", inputs);
};

// Streaming Gain — nodetool.audio.realtime.StreamingGain
export type StreamingGainInputs = {
  gain_db?: number | number[];
  chunk?: unknown | unknown[];
};

export interface StreamingGainOutputs {
  chunk: unknown;
}

export function streamingGain(inputs: StreamingGainInputs): Promise<StreamingGainOutputs> {
  return callNode<StreamingGainOutputs>("nodetool.audio.realtime.StreamingGain", inputs);
}

streamingGain.stream = function (inputs: StreamingGainInputs): AsyncIterable<{ slot: keyof StreamingGainOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingGainOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingGain", inputs);
};

// Streaming Low Pass — nodetool.audio.realtime.StreamingLowPass
export type StreamingLowPassInputs = {
  cutoff_frequency_hz?: number | number[];
  chunk?: unknown | unknown[];
  q?: number | number[];
};

export interface StreamingLowPassOutputs {
  chunk: unknown;
}

export function streamingLowPass(inputs: StreamingLowPassInputs): Promise<StreamingLowPassOutputs> {
  return callNode<StreamingLowPassOutputs>("nodetool.audio.realtime.StreamingLowPass", inputs);
}

streamingLowPass.stream = function (inputs: StreamingLowPassInputs): AsyncIterable<{ slot: keyof StreamingLowPassOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingLowPassOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingLowPass", inputs);
};

// Streaming High Pass — nodetool.audio.realtime.StreamingHighPass
export type StreamingHighPassInputs = {
  cutoff_frequency_hz?: number | number[];
  chunk?: unknown | unknown[];
  q?: number | number[];
};

export interface StreamingHighPassOutputs {
  chunk: unknown;
}

export function streamingHighPass(inputs: StreamingHighPassInputs): Promise<StreamingHighPassOutputs> {
  return callNode<StreamingHighPassOutputs>("nodetool.audio.realtime.StreamingHighPass", inputs);
}

streamingHighPass.stream = function (inputs: StreamingHighPassInputs): AsyncIterable<{ slot: keyof StreamingHighPassOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof StreamingHighPassOutputs & string; value: unknown }>("nodetool.audio.realtime.StreamingHighPass", inputs);
};
