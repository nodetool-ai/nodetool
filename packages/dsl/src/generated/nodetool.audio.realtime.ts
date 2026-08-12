// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Audio To Chunks — nodetool.audio.realtime.AudioToChunks
export type AudioToChunksInputs = {
  audio?: Connectable<AudioRef>;
  chunk_duration?: Connectable<number>;
};

export interface AudioToChunksOutputs {
  chunk: unknown;
}

export function audioToChunks(inputs: AudioToChunksInputs): DslNode<AudioToChunksOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.AudioToChunks", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streaming: true });
}

// Audio Out — nodetool.audio.realtime.AudioOutput
export type AudioOutputInputs = {
  chunk?: Connectable<unknown>;
};

export interface AudioOutputOutputs {
  chunk: unknown;
}

export function audioOutput(inputs: AudioOutputInputs): DslNode<AudioOutputOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.AudioOutput", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}

// Chunks To Audio — nodetool.audio.realtime.ChunksToAudio
export type ChunksToAudioInputs = {
  chunk?: Connectable<unknown>;
};

export interface ChunksToAudioOutputs {
  audio: AudioRef;
}

export function chunksToAudio(inputs: ChunksToAudioInputs): DslNode<ChunksToAudioOutputs, "audio"> {
  return createNode("nodetool.audio.realtime.ChunksToAudio", inputs, { outputNames: ["audio"], defaultOutput: "audio", streamingInput: true });
}

// Streaming Gain — nodetool.audio.realtime.StreamingGain
export type StreamingGainInputs = {
  chunk?: Connectable<unknown>;
  gain_db?: Connectable<number>;
};

export interface StreamingGainOutputs {
  chunk: unknown;
}

export function streamingGain(inputs: StreamingGainInputs): DslNode<StreamingGainOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingGain", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
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

export function streamingLowPass(inputs: StreamingLowPassInputs): DslNode<StreamingLowPassOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingLowPass", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
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

export function streamingHighPass(inputs: StreamingHighPassInputs): DslNode<StreamingHighPassOutputs, "chunk"> {
  return createNode("nodetool.audio.realtime.StreamingHighPass", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
