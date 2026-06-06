// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Text To Speech — openai.audio.TextToSpeech
export interface TextToSpeechInputs {
  model?: Connectable<"tts-1" | "tts-1-hd" | "gpt-4o-mini-tts">;
  voice?: Connectable<"alloy" | "ash" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "sage" | "shimmer" | "verse">;
  input?: Connectable<string>;
  speed?: Connectable<number>;
}

export interface TextToSpeechOutputs {
  output: AudioRef;
}

export function textToSpeech(inputs: TextToSpeechInputs): DslNode<TextToSpeechOutputs, "output"> {
  return createNode("openai.audio.TextToSpeech", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Translate — openai.audio.Translate
export interface TranslateInputs {
  audio?: Connectable<AudioRef>;
  temperature?: Connectable<number>;
}

export interface TranslateOutputs {
  output: string;
}

export function translate(inputs: TranslateInputs): DslNode<TranslateOutputs, "output"> {
  return createNode("openai.audio.Translate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Transcribe — openai.audio.Transcribe
export interface TranscribeInputs {
  model?: Connectable<"whisper-1" | "gpt-4o-transcribe" | "gpt-4o-mini-transcribe">;
  audio?: Connectable<AudioRef>;
  language?: Connectable<"auto_detect" | "af" | "ar" | "hy" | "az" | "be" | "bn" | "bs" | "bg" | "ca" | "hr" | "cs" | "da" | "nl" | "en" | "et" | "tl" | "fi" | "fr" | "gl" | "de" | "el" | "gu" | "he" | "hi" | "hu" | "is" | "id" | "it" | "ja" | "kn" | "kk" | "ko" | "lv" | "lt" | "mk" | "ms" | "zh" | "mi" | "mr" | "ne" | "no" | "fa" | "pl" | "pt" | "pa" | "ro" | "ru" | "sr" | "sk" | "sl" | "es" | "sw" | "sv" | "ta" | "te" | "th" | "tr" | "uk" | "ur" | "vi" | "cy">;
  timestamps?: Connectable<boolean>;
  prompt?: Connectable<string>;
  temperature?: Connectable<number>;
}

export interface TranscribeOutputs {
  text: string;
  words: unknown[];
  segments: unknown[];
}

export function transcribe(inputs: TranscribeInputs): DslNode<TranscribeOutputs> {
  return createNode("openai.audio.Transcribe", inputs as Record<string, unknown>, { outputNames: ["text", "words", "segments"] });
}
