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
  bitrate?: number;
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
