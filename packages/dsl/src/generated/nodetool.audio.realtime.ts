// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { AudioRef } from "../types.js";

// Audio To Chunks — nodetool.audio.realtime.AudioToChunks
export type AudioToChunksInputs = {
  audio?: Connectable<AudioRef>;
  chunk_duration?: Connectable<number>;
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
  chunk?: Connectable<unknown>;
  gain_db?: Connectable<number>;
};

export interface StreamingGainOutputs {
  chunk: unknown;
}

export function streamingGain(inputs: StreamingGainInputs, options?: NodeOptions): NodeWithOutputs<StreamingGainOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingGain", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}

// Streaming Low Pass — nodetool.audio.realtime.StreamingLowPass
export type StreamingLowPassInputs = {
  chunk?: Connectable<unknown>;
  cutoff_frequency_hz?: Connectable<number>;
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
  chunk?: Connectable<unknown>;
  cutoff_frequency_hz?: Connectable<number>;
  q?: Connectable<number>;
};

export interface StreamingHighPassOutputs {
  chunk: unknown;
}

export function streamingHighPass(inputs: StreamingHighPassInputs, options?: NodeOptions): NodeWithOutputs<StreamingHighPassOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingHighPass", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streamingInput: true });
}
