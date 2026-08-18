// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { AudioRef } from "../../types.js";

// Audio To Chunks — nodetool.audio.realtime.AudioToChunks
export type AudioToChunksInputs = {
  audio?: AudioRef;
  chunk_duration?: number;
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
  chunk?: unknown | unknown[];
  gain_db?: number | number[];
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
  chunk?: unknown | unknown[];
  cutoff_frequency_hz?: number | number[];
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
  chunk?: unknown | unknown[];
  cutoff_frequency_hz?: number | number[];
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
