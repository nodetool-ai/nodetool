// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { AudioRef } from "../../types.js";

// Text To Speech — gemini.audio.TextToSpeech
export type TextToSpeechInputs = {
  text?: string;
  model?: "gemini-3.1-flash-tts-preview" | "gemini-2.5-flash-preview-tts" | "gemini-2.5-pro-preview-tts";
  voice_name?: "achernar" | "achird" | "algenib" | "algieba" | "alnilam" | "aoede" | "autonoe" | "callirrhoe" | "charon" | "despina" | "enceladus" | "erinome" | "fenrir" | "gacrux" | "iapetus" | "kore" | "laomedeia" | "leda" | "orus" | "puck" | "pulcherrima" | "rasalgethi" | "sadachbia" | "sadaltager" | "schedar" | "sulafat" | "umbriel" | "vindemiatrix" | "zephyr" | "zubenelgenubi";
  style_prompt?: string;
};

export interface TextToSpeechOutputs {
  output: AudioRef;
}

export function textToSpeech(inputs: TextToSpeechInputs): Promise<TextToSpeechOutputs> {
  return callNode<TextToSpeechOutputs>("gemini.audio.TextToSpeech", inputs);
}

// Transcribe — gemini.audio.Transcribe
export type TranscribeInputs = {
  audio?: AudioRef;
  model?: "gemini-3.5-flash" | "gemini-3.1-flash-lite" | "gemini-2.5-flash";
  prompt?: string;
};

export interface TranscribeOutputs {
  output: string;
}

export function transcribe(inputs: TranscribeInputs): Promise<TranscribeOutputs> {
  return callNode<TranscribeOutputs>("gemini.audio.Transcribe", inputs);
}
