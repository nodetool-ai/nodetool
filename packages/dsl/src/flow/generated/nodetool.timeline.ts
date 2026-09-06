// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { VideoRef } from "../../types.js";

// Render Timeline — nodetool.timeline.RenderTimeline
export type RenderTimelineInputs = {
  timeline?: unknown;
  include_audio?: boolean;
  format?: "mp4" | "webm" | "mov" | "png_sequence";
  alpha?: boolean;
  video_codec?: string;
  motion_blur_samples?: number;
  shutter_angle?: number;
  bitrate?: number;
  preview_scale?: number;
};

export interface RenderTimelineOutputs {
  output: VideoRef;
  frames: unknown;
}

export function renderTimeline(inputs: RenderTimelineInputs): Promise<RenderTimelineOutputs> {
  return callNode<RenderTimelineOutputs>("nodetool.timeline.RenderTimeline", inputs);
}

// Timeline Transcript — nodetool.timeline.Transcript
export type TranscriptInputs = {
  timeline?: unknown;
};

export interface TranscriptOutputs {
  text: string;
  lines: string[];
}

export function transcript(inputs: TranscriptInputs): Promise<TranscriptOutputs> {
  return callNode<TranscriptOutputs>("nodetool.timeline.Transcript", inputs);
}

// Add Clips To Timeline — nodetool.timeline.AddClips
export type AddClipsInputs = {
  timeline?: unknown;
  clips?: unknown[];
  name?: string;
  image_duration_ms?: number;
};

export interface AddClipsOutputs {
  output: unknown;
}

export function addClips(inputs: AddClipsInputs): Promise<AddClipsOutputs> {
  return callNode<AddClipsOutputs>("nodetool.timeline.AddClips", inputs);
}

// Fill Timeline Text — nodetool.timeline.FillTimelineText
export type FillTimelineTextInputs = {
  timeline?: unknown;
  values?: Record<string, unknown>;
  name?: string;
};

export interface FillTimelineTextOutputs {
  timeline: unknown;
  filled: string[];
  unresolved: string[];
}

export function fillTimelineText(inputs: FillTimelineTextInputs): Promise<FillTimelineTextOutputs> {
  return callNode<FillTimelineTextOutputs>("nodetool.timeline.FillTimelineText", inputs);
}

// Retarget Timeline — nodetool.timeline.RetargetTimeline
export type RetargetTimelineInputs = {
  timeline?: unknown;
  aspect_ratio?: string;
  fit?: "cover" | "contain";
  name?: string;
};

export interface RetargetTimelineOutputs {
  timeline: unknown;
  cropped: string[];
}

export function retargetTimeline(inputs: RetargetTimelineInputs): Promise<RetargetTimelineOutputs> {
  return callNode<RetargetTimelineOutputs>("nodetool.timeline.RetargetTimeline", inputs);
}
