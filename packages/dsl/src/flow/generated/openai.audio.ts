// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { AudioRef } from "../../types.js";

// Text To Speech — openai.audio.TextToSpeech
export type TextToSpeechInputs = {
  model?: "tts-1" | "tts-1-hd" | "gpt-4o-mini-tts";
  voice?: "alloy" | "ash" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "sage" | "shimmer" | "verse";
  input?: string;
  speed?: number;
  instructions?: string;
};

export interface TextToSpeechOutputs {
  output: AudioRef;
}

export function textToSpeech(inputs: TextToSpeechInputs): Promise<TextToSpeechOutputs> {
  return callNode<TextToSpeechOutputs>("openai.audio.TextToSpeech", inputs);
}

// Translate — openai.audio.Translate
export type TranslateInputs = {
  audio?: AudioRef;
  temperature?: number;
};

export interface TranslateOutputs {
  output: string;
}

export function translate(inputs: TranslateInputs): Promise<TranslateOutputs> {
  return callNode<TranslateOutputs>("openai.audio.Translate", inputs);
}

// Transcribe — openai.audio.Transcribe
export type TranscribeInputs = {
  model?: "whisper-1" | "gpt-4o-transcribe" | "gpt-4o-mini-transcribe";
  audio?: AudioRef;
  language?: "auto_detect" | "af" | "ar" | "hy" | "az" | "be" | "bn" | "bs" | "bg" | "ca" | "hr" | "cs" | "da" | "nl" | "en" | "et" | "tl" | "fi" | "fr" | "gl" | "de" | "el" | "gu" | "he" | "hi" | "hu" | "is" | "id" | "it" | "ja" | "kn" | "kk" | "ko" | "lv" | "lt" | "mk" | "ms" | "zh" | "mi" | "mr" | "ne" | "no" | "fa" | "pl" | "pt" | "pa" | "ro" | "ru" | "sr" | "sk" | "sl" | "es" | "sw" | "sv" | "ta" | "te" | "th" | "tr" | "uk" | "ur" | "vi" | "cy";
  timestamps?: boolean;
  prompt?: string;
  temperature?: number;
};

export interface TranscribeOutputs {
  text: string;
  words: unknown[];
  segments: unknown[];
}

export function transcribe(inputs: TranscribeInputs): Promise<TranscribeOutputs> {
  return callNode<TranscribeOutputs>("openai.audio.Transcribe", inputs);
}
