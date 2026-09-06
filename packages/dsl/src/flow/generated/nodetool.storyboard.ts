// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, VideoRef, StoryboardRef, Entity } from "../../types.js";

// Load Storyboard — nodetool.storyboard.LoadStoryboard
export type LoadStoryboardInputs = {
  storyboard?: StoryboardRef;
};

export interface LoadStoryboardOutputs {
  storyboard: StoryboardRef;
  shots: Record<string, unknown>[];
  entities: Entity[];
  style: string;
  aspect_ratio: string;
  name: string;
  image_model: unknown;
  video_model: unknown;
  shot_count: number;
}

export function loadStoryboard(inputs: LoadStoryboardInputs): Promise<LoadStoryboardOutputs> {
  return callNode<LoadStoryboardOutputs>("nodetool.storyboard.LoadStoryboard", inputs);
}

// Storyboard Shots — nodetool.storyboard.StoryboardShots
export type StoryboardShotsInputs = {
  storyboard?: StoryboardRef;
};

export interface StoryboardShotsOutputs {
  shot: Record<string, unknown>;
  index: number;
  slug: string;
  keyframe: ImageRef;
  clip: VideoRef;
  output: Record<string, unknown>[];
}

export function storyboardShots(inputs: StoryboardShotsInputs): Promise<StoryboardShotsOutputs> {
  return callNode<StoryboardShotsOutputs>("nodetool.storyboard.StoryboardShots", inputs);
}

storyboardShots.stream = function (inputs: StoryboardShotsInputs): AsyncIterable<Partial<StoryboardShotsOutputs>> {
  return streamNode<Partial<StoryboardShotsOutputs>>("nodetool.storyboard.StoryboardShots", inputs);
};

// Recast Storyboard — nodetool.storyboard.RecastStoryboard
export type RecastStoryboardInputs = {
  storyboard?: StoryboardRef;
  cast?: Entity[];
  replaces?: string[];
  name?: string;
  reuse_existing?: boolean;
};

export interface RecastStoryboardOutputs {
  storyboard: StoryboardRef;
  invalidated: string[];
  kept: string[];
}

export function recastStoryboard(inputs: RecastStoryboardInputs): Promise<RecastStoryboardOutputs> {
  return callNode<RecastStoryboardOutputs>("nodetool.storyboard.RecastStoryboard", inputs);
}

// Render Stills — nodetool.storyboard.RenderStills
export type RenderStillsInputs = {
  storyboard?: StoryboardRef;
  targets?: string[];
  max_shots?: number;
  concurrency?: number;
  only_stale?: boolean;
  image_model?: unknown;
  allow_writes?: boolean;
};

export interface RenderStillsOutputs {
  storyboard: StoryboardRef;
  keyframes: ImageRef[];
  rendered: string[];
  skipped: string[];
  failed: string[];
}

export function renderStills(inputs: RenderStillsInputs): Promise<RenderStillsOutputs> {
  return callNode<RenderStillsOutputs>("nodetool.storyboard.RenderStills", inputs);
}

// Render Clips — nodetool.storyboard.RenderClips
export type RenderClipsInputs = {
  storyboard?: StoryboardRef;
  targets?: string[];
  max_shots?: number;
  require_keyframe?: boolean;
  concurrency?: number;
  only_stale?: boolean;
  video_model?: unknown;
  allow_writes?: boolean;
};

export interface RenderClipsOutputs {
  storyboard: StoryboardRef;
  clips: VideoRef[];
  rendered: string[];
  skipped: string[];
  failed: string[];
}

export function renderClips(inputs: RenderClipsInputs): Promise<RenderClipsOutputs> {
  return callNode<RenderClipsOutputs>("nodetool.storyboard.RenderClips", inputs);
}

// Assemble Timeline — nodetool.storyboard.AssembleTimeline
export type AssembleTimelineInputs = {
  storyboard?: StoryboardRef;
  name?: string;
  fps?: number;
  allow_writes?: boolean;
};

export interface AssembleTimelineOutputs {
  timeline: unknown;
  skipped_shots: string[];
  retimed: Record<string, unknown>[];
}

export function assembleTimeline(inputs: AssembleTimelineInputs): Promise<AssembleTimelineOutputs> {
  return callNode<AssembleTimelineOutputs>("nodetool.storyboard.AssembleTimeline", inputs);
}
