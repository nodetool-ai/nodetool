// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Text To Speech — openai.audio.TextToSpeech
export interface TextToSpeechInputs {
  model?: Connectable<unknown>;
  voice?: Connectable<unknown>;
  input?: Connectable<string>;
  speed?: Connectable<number>;
}

export interface TextToSpeechOutputs {
  output: AudioRef;
}

export function textToSpeech(
  inputs: TextToSpeechInputs
): DslNode<TextToSpeechOutputs, "output"> {
  return createNode(
    "openai.audio.TextToSpeech",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Translate — openai.audio.Translate
export interface TranslateInputs {
  audio?: Connectable<AudioRef>;
  temperature?: Connectable<number>;
}

export interface TranslateOutputs {
  output: string;
}

export function translate(
  inputs: TranslateInputs
): DslNode<TranslateOutputs, "output"> {
  return createNode(
    "openai.audio.Translate",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Transcribe — openai.audio.Transcribe
export interface TranscribeInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
  language?: Connectable<unknown>;
  timestamps?: Connectable<boolean>;
  prompt?: Connectable<string>;
  temperature?: Connectable<number>;
}

export interface TranscribeOutputs {
  text: string;
  words: unknown[];
  segments: unknown[];
}

export function transcribe(
  inputs: TranscribeInputs
): DslNode<TranscribeOutputs> {
  return createNode(
    "openai.audio.Transcribe",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "words", "segments"] }
  );
}
