// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { Entity } from "../types.js";

// Load Script — nodetool.script.LoadScript
export type LoadScriptInputs = {
  script?: Connectable<unknown>;
};

export interface LoadScriptOutputs {
  text: string;
  lines: string[];
  name: string;
  line_count: number;
}

export function loadScript(inputs: LoadScriptInputs, options?: NodeOptions): NodeWithOutputs<LoadScriptOutputs> {
  return createNode("nodetool.script.LoadScript", inputs, { id: options?.id, outputNames: ["text", "lines", "name", "line_count"], outputTypes: {"text":"str","lines":"list[str]","name":"str","line_count":"int"} });
}

// Voice Script — nodetool.script.VoiceScript
export type VoiceScriptInputs = {
  script?: Connectable<unknown>;
  speed?: Connectable<number>;
};

export interface VoiceScriptOutputs {
  output: unknown;
  voiced_count: number;
}

export function voiceScript(inputs: VoiceScriptInputs, options?: NodeOptions): NodeWithOutputs<VoiceScriptOutputs> {
  return createNode("nodetool.script.VoiceScript", inputs, { id: options?.id, outputNames: ["output", "voiced_count"], outputTypes: {"output":"script","voiced_count":"int"} });
}

// Script To Timeline — nodetool.script.ScriptToTimeline
export type ScriptToTimelineInputs = {
  script?: Connectable<unknown>;
};

export interface ScriptToTimelineOutputs {
  output: unknown;
}

export function scriptToTimeline(inputs: ScriptToTimelineInputs, options?: NodeOptions): NodeWithOutputs<ScriptToTimelineOutputs, "output"> {
  return createNode("nodetool.script.ScriptToTimeline", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"timeline"}, defaultOutput: "output" });
}

// Script To Subtitles — nodetool.script.ScriptToSubtitles
export type ScriptToSubtitlesInputs = {
  script?: Connectable<unknown>;
  format?: Connectable<"srt" | "vtt">;
  granularity?: Connectable<"line" | "word">;
};

export interface ScriptToSubtitlesOutputs {
  subtitles: string;
  cue_count: number;
}

export function scriptToSubtitles(inputs: ScriptToSubtitlesInputs, options?: NodeOptions): NodeWithOutputs<ScriptToSubtitlesOutputs> {
  return createNode("nodetool.script.ScriptToSubtitles", inputs, { id: options?.id, outputNames: ["subtitles", "cue_count"], outputTypes: {"subtitles":"str","cue_count":"int"} });
}

// Write Script — nodetool.script.WriteScript
export type WriteScriptInputs = {
  model?: Connectable<unknown>;
  brief?: Connectable<string>;
  format?: Connectable<"voiceover" | "dialogue" | "interview" | "ad-read" | "tutorial">;
  cast?: Connectable<Entity[]>;
  language?: Connectable<string>;
  pace?: Connectable<"slow" | "normal" | "fast">;
  length_seconds?: Connectable<number>;
  voice_provider?: Connectable<string>;
  voice_model?: Connectable<string>;
  name?: Connectable<string>;
};

export interface WriteScriptOutputs {
  script: unknown;
  line_count: number;
}

export function writeScript(inputs: WriteScriptInputs, options?: NodeOptions): NodeWithOutputs<WriteScriptOutputs> {
  return createNode("nodetool.script.WriteScript", inputs, { id: options?.id, outputNames: ["script", "line_count"], outputTypes: {"script":"script","line_count":"int"} });
}

// Fill Script — nodetool.script.FillScript
export type FillScriptInputs = {
  script?: Connectable<unknown>;
  values?: Connectable<Record<string, unknown>>;
  name?: Connectable<string>;
};

export interface FillScriptOutputs {
  script: unknown;
  filled: string[];
  unresolved: string[];
}

export function fillScript(inputs: FillScriptInputs, options?: NodeOptions): NodeWithOutputs<FillScriptOutputs> {
  return createNode("nodetool.script.FillScript", inputs, { id: options?.id, outputNames: ["script", "filled", "unresolved"], outputTypes: {"script":"script","filled":"list[str]","unresolved":"list[str]"} });
}
