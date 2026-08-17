// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Load Script — nodetool.script.LoadScript
export type LoadScriptInputs = {
  script?: unknown;
};

export interface LoadScriptOutputs {
  text: string;
  lines: string[];
  name: string;
  line_count: number;
}

export function loadScript(inputs: LoadScriptInputs): Promise<LoadScriptOutputs> {
  return callNode<LoadScriptOutputs>("nodetool.script.LoadScript", inputs);
}

// Voice Script — nodetool.script.VoiceScript
export type VoiceScriptInputs = {
  script?: unknown;
  speed?: number;
};

export interface VoiceScriptOutputs {
  output: unknown;
  voiced_count: number;
}

export function voiceScript(inputs: VoiceScriptInputs): Promise<VoiceScriptOutputs> {
  return callNode<VoiceScriptOutputs>("nodetool.script.VoiceScript", inputs);
}

// Script To Timeline — nodetool.script.ScriptToTimeline
export type ScriptToTimelineInputs = {
  script?: unknown;
};

export interface ScriptToTimelineOutputs {
  output: unknown;
}

export function scriptToTimeline(inputs: ScriptToTimelineInputs): Promise<ScriptToTimelineOutputs> {
  return callNode<ScriptToTimelineOutputs>("nodetool.script.ScriptToTimeline", inputs);
}

// Script To Subtitles — nodetool.script.ScriptToSubtitles
export type ScriptToSubtitlesInputs = {
  script?: unknown;
  format?: "srt" | "vtt";
  granularity?: "line" | "word";
};

export interface ScriptToSubtitlesOutputs {
  subtitles: string;
  cue_count: number;
}

export function scriptToSubtitles(inputs: ScriptToSubtitlesInputs): Promise<ScriptToSubtitlesOutputs> {
  return callNode<ScriptToSubtitlesOutputs>("nodetool.script.ScriptToSubtitles", inputs);
}
