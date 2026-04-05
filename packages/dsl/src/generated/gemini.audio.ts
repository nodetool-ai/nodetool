// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Text To Speech — gemini.audio.TextToSpeech
export interface TextToSpeechInputs {
  text?: Connectable<string>;
  model?: Connectable<unknown>;
  voice_name?: Connectable<unknown>;
  style_prompt?: Connectable<string>;
}

export interface TextToSpeechOutputs {
  output: AudioRef;
}

export function textToSpeech(
  inputs: TextToSpeechInputs
): DslNode<TextToSpeechOutputs, "output"> {
  return createNode(
    "gemini.audio.TextToSpeech",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Transcribe — gemini.audio.Transcribe
export interface TranscribeInputs {
  audio?: Connectable<AudioRef>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
}

export interface TranscribeOutputs {
  output: string;
}

export function transcribe(
  inputs: TranscribeInputs
): DslNode<TranscribeOutputs, "output"> {
  return createNode(
    "gemini.audio.Transcribe",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
