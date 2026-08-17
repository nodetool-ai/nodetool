// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { AudioRef } from "../../types.js";

// Realtime Agent — openai.agents.RealtimeAgent
export type RealtimeAgentInputs = {
  model?: "gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview" | ("gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview")[];
  system?: string | string[];
  chunk?: unknown | unknown[];
  voice?: "none" | "ash" | "alloy" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "sage" | "verse" | ("none" | "ash" | "alloy" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "sage" | "verse")[];
  speed?: number | number[];
  temperature?: number | number[];
};

export interface RealtimeAgentOutputs {
  chunk: unknown;
  audio: AudioRef;
  text: string;
}

export function realtimeAgent(inputs: RealtimeAgentInputs): Promise<RealtimeAgentOutputs> {
  return callNode<RealtimeAgentOutputs>("openai.agents.RealtimeAgent", inputs);
}

realtimeAgent.stream = function (inputs: RealtimeAgentInputs): AsyncIterable<{ slot: keyof RealtimeAgentOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof RealtimeAgentOutputs & string; value: unknown }>("openai.agents.RealtimeAgent", inputs);
};

// Realtime Transcription — openai.agents.RealtimeTranscription
export type RealtimeTranscriptionInputs = {
  model?: "gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview" | ("gpt-4o-realtime-preview" | "gpt-4o-mini-realtime-preview")[];
  chunk?: unknown | unknown[];
  system?: string | string[];
  temperature?: number | number[];
};

export interface RealtimeTranscriptionOutputs {
  text: string;
  chunk: unknown;
}

export function realtimeTranscription(inputs: RealtimeTranscriptionInputs): Promise<RealtimeTranscriptionOutputs> {
  return callNode<RealtimeTranscriptionOutputs>("openai.agents.RealtimeTranscription", inputs);
}

realtimeTranscription.stream = function (inputs: RealtimeTranscriptionInputs): AsyncIterable<{ slot: keyof RealtimeTranscriptionOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof RealtimeTranscriptionOutputs & string; value: unknown }>("openai.agents.RealtimeTranscription", inputs);
};
