// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Realtime Agent — openai.agents.RealtimeAgent
export type RealtimeAgentInputs = {
  model?: Connectable<"gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview">;
  system?: Connectable<string>;
  chunk?: Connectable<unknown>;
  voice?: Connectable<"none" | "ash" | "alloy" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "sage" | "verse">;
  speed?: Connectable<number>;
  temperature?: Connectable<number>;
};

export interface RealtimeAgentOutputs {
  chunk: unknown;
  audio: AudioRef;
  text: string;
}

export function realtimeAgent(inputs: RealtimeAgentInputs): DslNode<RealtimeAgentOutputs> {
  return createNode("openai.agents.RealtimeAgent", inputs, { outputNames: ["chunk", "audio", "text"], streamingInput: true });
}

// Realtime Transcription — openai.agents.RealtimeTranscription
export type RealtimeTranscriptionInputs = {
  model?: Connectable<"gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview">;
  chunk?: Connectable<unknown>;
  system?: Connectable<string>;
  temperature?: Connectable<number>;
};

export interface RealtimeTranscriptionOutputs {
  text: string;
  chunk: unknown;
}

export function realtimeTranscription(inputs: RealtimeTranscriptionInputs): DslNode<RealtimeTranscriptionOutputs> {
  return createNode("openai.agents.RealtimeTranscription", inputs, { outputNames: ["text", "chunk"], streamingInput: true });
}

// Live Agent — openai.agents.LiveAgent
export type LiveAgentInputs = {
  model?: Connectable<"gpt-live-1">;
  instructions?: Connectable<string>;
  chunk?: Connectable<unknown>;
  voice?: Connectable<"marin" | "cedar" | "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse" | "quartz" | "ripple" | "vesper" | "willow" | "stone" | "gleam" | "meridian" | "bossa" | "tempo" | "beacon" | "delta" | "cinder">;
  backend_model?: Connectable<string>;
  backend_instructions?: Connectable<string>;
  web_search?: Connectable<boolean>;
};

export interface LiveAgentOutputs {
  chunk: unknown;
  audio: AudioRef;
  text: string;
  input_transcript: string;
}

export function liveAgent(inputs: LiveAgentInputs): DslNode<LiveAgentOutputs> {
  return createNode("openai.agents.LiveAgent", inputs, { outputNames: ["chunk", "audio", "text", "input_transcript"], streamingInput: true });
}
