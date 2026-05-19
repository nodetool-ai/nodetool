// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef } from "../types.js";

// Text To Speech — gemini.audio.TextToSpeech
export interface TextToSpeechInputs {
  text?: Connectable<string>;
  model?: Connectable<"gemini-2.5-pro-preview-tts">;
  voice_name?: Connectable<"achernar" | "achird" | "algenib" | "algieba" | "alnilam" | "aoede" | "autonoe" | "callirrhoe" | "charon" | "despina" | "enceladus" | "erinome" | "fenrir" | "gacrux" | "iapetus" | "kore" | "laomedeia" | "leda" | "orus" | "puck" | "pulcherrima" | "rasalgethi" | "sadachbia" | "sadaltager" | "schedar" | "sulafat" | "umbriel" | "vindemiatrix" | "zephyr" | "zubenelgenubi">;
  style_prompt?: Connectable<string>;
}

export interface TextToSpeechOutputs {
  output: AudioRef;
}

export function textToSpeech(inputs: TextToSpeechInputs): DslNode<TextToSpeechOutputs, "output"> {
  return createNode("gemini.audio.TextToSpeech", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Transcribe — gemini.audio.Transcribe
export interface TranscribeInputs {
  audio?: Connectable<AudioRef>;
  model?: Connectable<"gemini-2.5-flash" | "gemini-2.0-flash">;
  prompt?: Connectable<string>;
}

export interface TranscribeOutputs {
  output: string;
}

export function transcribe(inputs: TranscribeInputs): DslNode<TranscribeOutputs, "output"> {
  return createNode("gemini.audio.Transcribe", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
