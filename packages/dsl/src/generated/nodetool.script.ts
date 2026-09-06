// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function loadScript(inputs: LoadScriptInputs): DslNode<LoadScriptOutputs> {
  return createNode("nodetool.script.LoadScript", inputs, { outputNames: ["text", "lines", "name", "line_count"] });
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

export function voiceScript(inputs: VoiceScriptInputs): DslNode<VoiceScriptOutputs> {
  return createNode("nodetool.script.VoiceScript", inputs, { outputNames: ["output", "voiced_count"] });
}

// Script To Timeline — nodetool.script.ScriptToTimeline
export type ScriptToTimelineInputs = {
  script?: Connectable<unknown>;
};

export interface ScriptToTimelineOutputs {
  output: unknown;
}

export function scriptToTimeline(inputs: ScriptToTimelineInputs): DslNode<ScriptToTimelineOutputs, "output"> {
  return createNode("nodetool.script.ScriptToTimeline", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function scriptToSubtitles(inputs: ScriptToSubtitlesInputs): DslNode<ScriptToSubtitlesOutputs> {
  return createNode("nodetool.script.ScriptToSubtitles", inputs, { outputNames: ["subtitles", "cue_count"] });
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

export function writeScript(inputs: WriteScriptInputs): DslNode<WriteScriptOutputs> {
  return createNode("nodetool.script.WriteScript", inputs, { outputNames: ["script", "line_count"] });
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

export function fillScript(inputs: FillScriptInputs): DslNode<FillScriptOutputs> {
  return createNode("nodetool.script.FillScript", inputs, { outputNames: ["script", "filled", "unresolved"] });
}
