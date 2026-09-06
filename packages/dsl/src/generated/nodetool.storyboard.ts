// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, VideoRef, StoryboardRef, Entity } from "../types.js";

// Load Storyboard — nodetool.storyboard.LoadStoryboard
export type LoadStoryboardInputs = {
  storyboard?: Connectable<StoryboardRef>;
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

export function loadStoryboard(inputs: LoadStoryboardInputs): DslNode<LoadStoryboardOutputs> {
  return createNode("nodetool.storyboard.LoadStoryboard", inputs, { outputNames: ["storyboard", "shots", "entities", "style", "aspect_ratio", "name", "image_model", "video_model", "shot_count"] });
}

// Storyboard Shots — nodetool.storyboard.StoryboardShots
export type StoryboardShotsInputs = {
  storyboard?: Connectable<StoryboardRef>;
};

export interface StoryboardShotsOutputs {
  shot: Record<string, unknown>;
  index: number;
  slug: string;
  keyframe: ImageRef;
  clip: VideoRef;
  output: Record<string, unknown>[];
}

export function storyboardShots(inputs: StoryboardShotsInputs): DslNode<StoryboardShotsOutputs> {
  return createNode("nodetool.storyboard.StoryboardShots", inputs, { outputNames: ["shot", "index", "slug", "keyframe", "clip", "output"], streaming: true });
}

// Recast Storyboard — nodetool.storyboard.RecastStoryboard
export type RecastStoryboardInputs = {
  storyboard?: Connectable<StoryboardRef>;
  cast?: Connectable<Entity[]>;
  replaces?: Connectable<string[]>;
  name?: Connectable<string>;
  reuse_existing?: Connectable<boolean>;
};

export interface RecastStoryboardOutputs {
  storyboard: StoryboardRef;
  invalidated: string[];
  kept: string[];
}

export function recastStoryboard(inputs: RecastStoryboardInputs): DslNode<RecastStoryboardOutputs> {
  return createNode("nodetool.storyboard.RecastStoryboard", inputs, { outputNames: ["storyboard", "invalidated", "kept"] });
}

// Render Stills — nodetool.storyboard.RenderStills
export type RenderStillsInputs = {
  storyboard?: Connectable<StoryboardRef>;
  targets?: Connectable<string[]>;
  max_shots?: Connectable<number>;
  concurrency?: Connectable<number>;
  only_stale?: Connectable<boolean>;
  image_model?: Connectable<unknown>;
  allow_writes?: Connectable<boolean>;
};

export interface RenderStillsOutputs {
  storyboard: StoryboardRef;
  keyframes: ImageRef[];
  rendered: string[];
  skipped: string[];
  failed: string[];
}

export function renderStills(inputs: RenderStillsInputs): DslNode<RenderStillsOutputs> {
  return createNode("nodetool.storyboard.RenderStills", inputs, { outputNames: ["storyboard", "keyframes", "rendered", "skipped", "failed"] });
}

// Render Clips — nodetool.storyboard.RenderClips
export type RenderClipsInputs = {
  storyboard?: Connectable<StoryboardRef>;
  targets?: Connectable<string[]>;
  max_shots?: Connectable<number>;
  require_keyframe?: Connectable<boolean>;
  concurrency?: Connectable<number>;
  only_stale?: Connectable<boolean>;
  video_model?: Connectable<unknown>;
  allow_writes?: Connectable<boolean>;
};

export interface RenderClipsOutputs {
  storyboard: StoryboardRef;
  clips: VideoRef[];
  rendered: string[];
  skipped: string[];
  failed: string[];
}

export function renderClips(inputs: RenderClipsInputs): DslNode<RenderClipsOutputs> {
  return createNode("nodetool.storyboard.RenderClips", inputs, { outputNames: ["storyboard", "clips", "rendered", "skipped", "failed"] });
}

// Assemble Timeline — nodetool.storyboard.AssembleTimeline
export type AssembleTimelineInputs = {
  storyboard?: Connectable<StoryboardRef>;
  name?: Connectable<string>;
  fps?: Connectable<number>;
  allow_writes?: Connectable<boolean>;
};

export interface AssembleTimelineOutputs {
  timeline: unknown;
  skipped_shots: string[];
  retimed: Record<string, unknown>[];
}

export function assembleTimeline(inputs: AssembleTimelineInputs): DslNode<AssembleTimelineOutputs> {
  return createNode("nodetool.storyboard.AssembleTimeline", inputs, { outputNames: ["timeline", "skipped_shots", "retimed"] });
}
