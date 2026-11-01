// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { AudioRef } from "../types.js";

// Text To Speech — gemini.audio.TextToSpeech
export type TextToSpeechInputs = {
  text?: Connectable<string>;
  model?: Connectable<unknown>;
  voice_name?: Connectable<"achernar" | "achird" | "algenib" | "algieba" | "alnilam" | "aoede" | "autonoe" | "callirrhoe" | "charon" | "despina" | "enceladus" | "erinome" | "fenrir" | "gacrux" | "iapetus" | "kore" | "laomedeia" | "leda" | "orus" | "puck" | "pulcherrima" | "rasalgethi" | "sadachbia" | "sadaltager" | "schedar" | "sulafat" | "umbriel" | "vindemiatrix" | "zephyr" | "zubenelgenubi">;
  style_prompt?: Connectable<string>;
};

export interface TextToSpeechOutputs {
  output: AudioRef;
}

export function textToSpeech(inputs: TextToSpeechInputs, options?: NodeOptions): NodeWithOutputs<TextToSpeechOutputs, "output"> {
  return createNode("gemini.audio.TextToSpeech", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Transcribe — gemini.audio.Transcribe
export type TranscribeInputs = {
  audio?: Connectable<AudioRef>;
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
};

export interface TranscribeOutputs {
  output: string;
}

export function transcribe(inputs: TranscribeInputs, options?: NodeOptions): NodeWithOutputs<TranscribeOutputs, "output"> {
  return createNode("gemini.audio.Transcribe", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}
