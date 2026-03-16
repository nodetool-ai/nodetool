// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";
import type { AudioRef } from "../types.js";

// Realtime Agent — openai.agents.RealtimeAgent
export interface RealtimeAgentInputs {
  model?: Connectable<unknown>;
  system?: Connectable<string>;
  chunk?: Connectable<unknown>;
  voice?: Connectable<unknown>;
  speed?: Connectable<number>;
  temperature?: Connectable<number>;
}

export interface RealtimeAgentOutputs {
  chunk: OutputHandle<unknown>;
  audio: OutputHandle<AudioRef>;
  text: OutputHandle<string>;
}

export function realtimeAgent(inputs: RealtimeAgentInputs): DslNode<RealtimeAgentOutputs> {
  return createNode("openai.agents.RealtimeAgent", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Realtime Transcription — openai.agents.RealtimeTranscription
export interface RealtimeTranscriptionInputs {
  model?: Connectable<unknown>;
  system?: Connectable<string>;
  temperature?: Connectable<number>;
}

export interface RealtimeTranscriptionOutputs {
  text: OutputHandle<string>;
  chunk: OutputHandle<unknown>;
}

export function realtimeTranscription(inputs: RealtimeTranscriptionInputs): DslNode<RealtimeTranscriptionOutputs> {
  return createNode("openai.agents.RealtimeTranscription", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}
