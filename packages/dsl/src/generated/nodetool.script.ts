// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

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
