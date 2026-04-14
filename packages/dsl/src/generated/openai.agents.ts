// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Realtime Agent — openai.agents.RealtimeAgent
export interface RealtimeAgentInputs {
  model?: Connectable<"gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview">;
  system?: Connectable<string>;
  chunk?: Connectable<unknown>;
  voice?: Connectable<"none" | "ash" | "alloy" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "sage" | "verse">;
  speed?: Connectable<number>;
  temperature?: Connectable<number>;
}

export interface RealtimeAgentOutputs {
  chunk: unknown;
  audio: AudioRef;
  text: string;
}

export function realtimeAgent(inputs: RealtimeAgentInputs): DslNode<RealtimeAgentOutputs> {
  return createNode("openai.agents.RealtimeAgent", inputs as Record<string, unknown>, { outputNames: ["chunk", "audio", "text"], streaming: true });
}

// Realtime Transcription — openai.agents.RealtimeTranscription
export interface RealtimeTranscriptionInputs {
  model?: Connectable<"gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview">;
  chunk?: Connectable<unknown>;
  system?: Connectable<string>;
  temperature?: Connectable<number>;
}

export interface RealtimeTranscriptionOutputs {
  text: string;
  chunk: unknown;
}

export function realtimeTranscription(inputs: RealtimeTranscriptionInputs): DslNode<RealtimeTranscriptionOutputs> {
  return createNode("openai.agents.RealtimeTranscription", inputs as Record<string, unknown>, { outputNames: ["text", "chunk"], streaming: true });
}
