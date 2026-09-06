// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { Entity } from "../../types.js";

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

// Write Script — nodetool.script.WriteScript
export type WriteScriptInputs = {
  model?: unknown;
  brief?: string;
  format?: "voiceover" | "dialogue" | "interview" | "ad-read" | "tutorial";
  cast?: Entity[];
  language?: string;
  pace?: "slow" | "normal" | "fast";
  length_seconds?: number;
  voice_provider?: string;
  voice_model?: string;
  name?: string;
};

export interface WriteScriptOutputs {
  script: unknown;
  line_count: number;
}

export function writeScript(inputs: WriteScriptInputs): Promise<WriteScriptOutputs> {
  return callNode<WriteScriptOutputs>("nodetool.script.WriteScript", inputs);
}

// Fill Script — nodetool.script.FillScript
export type FillScriptInputs = {
  script?: unknown;
  values?: Record<string, unknown>;
  name?: string;
};

export interface FillScriptOutputs {
  script: unknown;
  filled: string[];
  unresolved: string[];
}

export function fillScript(inputs: FillScriptInputs): Promise<FillScriptOutputs> {
  return callNode<FillScriptOutputs>("nodetool.script.FillScript", inputs);
}
