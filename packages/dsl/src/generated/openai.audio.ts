// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { AudioRef } from "../types.js";

// Text To Speech — openai.audio.TextToSpeech
export interface TextToSpeechInputs {
  model?: Connectable<unknown>;
  voice?: Connectable<unknown>;
  input?: Connectable<string>;
  speed?: Connectable<number>;
}

export function textToSpeech(inputs: TextToSpeechInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("openai.audio.TextToSpeech", inputs as Record<string, unknown>);
}

// Translate — openai.audio.Translate
export interface TranslateInputs {
  audio?: Connectable<AudioRef>;
  temperature?: Connectable<number>;
}

export function translate(inputs: TranslateInputs): DslNode<SingleOutput<string>> {
  return createNode("openai.audio.Translate", inputs as Record<string, unknown>);
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
  text: OutputHandle<string>;
  words: OutputHandle<unknown[]>;
  segments: OutputHandle<unknown[]>;
}

export function transcribe(inputs: TranscribeInputs): DslNode<TranscribeOutputs> {
  return createNode("openai.audio.Transcribe", inputs as Record<string, unknown>, { multiOutput: true });
}
