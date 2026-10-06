// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Live Transcription — whisper_cpp.LiveTranscription
export type LiveTranscriptionInputs = {
  chunk: unknown | unknown[];
  model?: unknown | unknown[];
  language?: string | string[];
  prompt?: string | string[];
  vad_threshold?: number | number[];
  min_silence_ms?: number | number[];
  max_segment_s?: number | number[];
};

export interface LiveTranscriptionOutputs {
  chunk: unknown;
  text: string;
}

export function liveTranscription(inputs: LiveTranscriptionInputs): Promise<LiveTranscriptionOutputs> {
  return callNode<LiveTranscriptionOutputs>("whisper_cpp.LiveTranscription", inputs);
}

liveTranscription.stream = function (inputs: LiveTranscriptionInputs): AsyncIterable<{ slot: keyof LiveTranscriptionOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof LiveTranscriptionOutputs & string; value: unknown }>("whisper_cpp.LiveTranscription", inputs);
};
