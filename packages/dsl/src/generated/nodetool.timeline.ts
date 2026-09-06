// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { VideoRef } from "../types.js";

// Render Timeline — nodetool.timeline.RenderTimeline
export type RenderTimelineInputs = {
  timeline?: Connectable<unknown>;
  include_audio?: Connectable<boolean>;
  format?: Connectable<"mp4" | "webm" | "mov" | "png_sequence">;
  alpha?: Connectable<boolean>;
  video_codec?: Connectable<string>;
  motion_blur_samples?: Connectable<number>;
  shutter_angle?: Connectable<number>;
  bitrate?: Connectable<number>;
  preview_scale?: Connectable<number>;
};

export interface RenderTimelineOutputs {
  output: VideoRef;
  frames: unknown;
}

export function renderTimeline(inputs: RenderTimelineInputs): DslNode<RenderTimelineOutputs> {
  return createNode("nodetool.timeline.RenderTimeline", inputs, { outputNames: ["output", "frames"] });
}

// Timeline Transcript — nodetool.timeline.Transcript
export type TranscriptInputs = {
  timeline?: Connectable<unknown>;
};

export interface TranscriptOutputs {
  text: string;
  lines: string[];
}

export function transcript(inputs: TranscriptInputs): DslNode<TranscriptOutputs> {
  return createNode("nodetool.timeline.Transcript", inputs, { outputNames: ["text", "lines"] });
}

// Add Clips To Timeline — nodetool.timeline.AddClips
export type AddClipsInputs = {
  timeline?: Connectable<unknown>;
  clips?: Connectable<unknown[]>;
  name?: Connectable<string>;
  image_duration_ms?: Connectable<number>;
};

export interface AddClipsOutputs {
  output: unknown;
}

export function addClips(inputs: AddClipsInputs): DslNode<AddClipsOutputs, "output"> {
  return createNode("nodetool.timeline.AddClips", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Fill Timeline Text — nodetool.timeline.FillTimelineText
export type FillTimelineTextInputs = {
  timeline?: Connectable<unknown>;
  values?: Connectable<Record<string, unknown>>;
  name?: Connectable<string>;
};

export interface FillTimelineTextOutputs {
  timeline: unknown;
  filled: string[];
  unresolved: string[];
}

export function fillTimelineText(inputs: FillTimelineTextInputs): DslNode<FillTimelineTextOutputs> {
  return createNode("nodetool.timeline.FillTimelineText", inputs, { outputNames: ["timeline", "filled", "unresolved"] });
}

// Retarget Timeline — nodetool.timeline.RetargetTimeline
export type RetargetTimelineInputs = {
  timeline?: Connectable<unknown>;
  aspect_ratio?: Connectable<string>;
  fit?: Connectable<"cover" | "contain">;
  name?: Connectable<string>;
};

export interface RetargetTimelineOutputs {
  timeline: unknown;
  cropped: string[];
}

export function retargetTimeline(inputs: RetargetTimelineInputs): DslNode<RetargetTimelineOutputs> {
  return createNode("nodetool.timeline.RetargetTimeline", inputs, { outputNames: ["timeline", "cropped"] });
}
