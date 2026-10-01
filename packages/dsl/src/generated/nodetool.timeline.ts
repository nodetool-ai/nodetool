// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function renderTimeline(inputs: RenderTimelineInputs, options?: NodeOptions): NodeWithOutputs<RenderTimelineOutputs> {
  return createNode("nodetool.timeline.RenderTimeline", inputs, { id: options?.id, outputNames: ["output", "frames"], outputTypes: {"output":"video","frames":"document"} });
}

// Timeline Transcript — nodetool.timeline.Transcript
export type TranscriptInputs = {
  timeline?: Connectable<unknown>;
};

export interface TranscriptOutputs {
  text: string;
  lines: string[];
}

export function transcript(inputs: TranscriptInputs, options?: NodeOptions): NodeWithOutputs<TranscriptOutputs> {
  return createNode("nodetool.timeline.Transcript", inputs, { id: options?.id, outputNames: ["text", "lines"], outputTypes: {"text":"str","lines":"list[str]"} });
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

export function addClips(inputs: AddClipsInputs, options?: NodeOptions): NodeWithOutputs<AddClipsOutputs, "output"> {
  return createNode("nodetool.timeline.AddClips", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"timeline"}, defaultOutput: "output" });
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

export function fillTimelineText(inputs: FillTimelineTextInputs, options?: NodeOptions): NodeWithOutputs<FillTimelineTextOutputs> {
  return createNode("nodetool.timeline.FillTimelineText", inputs, { id: options?.id, outputNames: ["timeline", "filled", "unresolved"], outputTypes: {"timeline":"timeline","filled":"list[str]","unresolved":"list[str]"} });
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

export function retargetTimeline(inputs: RetargetTimelineInputs, options?: NodeOptions): NodeWithOutputs<RetargetTimelineOutputs> {
  return createNode("nodetool.timeline.RetargetTimeline", inputs, { id: options?.id, outputNames: ["timeline", "cropped"], outputTypes: {"timeline":"timeline","cropped":"list[str]"} });
}
