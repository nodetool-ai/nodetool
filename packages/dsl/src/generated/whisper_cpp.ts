// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Live Transcription — whisper_cpp.LiveTranscription
export type LiveTranscriptionInputs = {
  chunk: Connectable<unknown>;
  model?: Connectable<unknown>;
  language?: Connectable<string>;
  prompt?: Connectable<string>;
  vad_threshold?: Connectable<number>;
  min_silence_ms?: Connectable<number>;
  max_segment_s?: Connectable<number>;
};

export interface LiveTranscriptionOutputs {
  chunk: unknown;
  text: string;
}

export function liveTranscription(inputs: LiveTranscriptionInputs, options?: NodeOptions): NodeWithOutputs<LiveTranscriptionOutputs> {
  return createNode("whisper_cpp.LiveTranscription", inputs, { id: options?.id, outputNames: ["chunk", "text"], outputTypes: {"chunk":"chunk","text":"str"}, streaming: true, streamingInput: true, outputCorrelation: {"chunk":{"kind":"iteration","source":"__execution__","group":"stream"},"text":{"kind":"single","source":"__execution__"}} });
}
