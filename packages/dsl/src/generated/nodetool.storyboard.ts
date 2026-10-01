// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function loadStoryboard(inputs: LoadStoryboardInputs, options?: NodeOptions): NodeWithOutputs<LoadStoryboardOutputs> {
  return createNode("nodetool.storyboard.LoadStoryboard", inputs, { id: options?.id, outputNames: ["storyboard", "shots", "entities", "style", "aspect_ratio", "name", "image_model", "video_model", "shot_count"], outputTypes: {"storyboard":"storyboard","shots":"list[dict]","entities":"list[entity]","style":"str","aspect_ratio":"str","name":"str","image_model":"image_model","video_model":"video_model","shot_count":"int"} });
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

export function storyboardShots(inputs: StoryboardShotsInputs, options?: NodeOptions): NodeWithOutputs<StoryboardShotsOutputs> {
  return createNode("nodetool.storyboard.StoryboardShots", inputs, { id: options?.id, outputNames: ["shot", "index", "slug", "keyframe", "clip", "output"], outputTypes: {"shot":"dict","index":"int","slug":"str","keyframe":"image","clip":"video","output":"list[dict]"}, streaming: true, inputMode: "buffered", outputCorrelation: {"shot":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"},"slug":{"kind":"iteration","source":"__execution__","group":"items"},"keyframe":{"kind":"iteration","source":"__execution__","group":"items"},"clip":{"kind":"iteration","source":"__execution__","group":"items"},"output":{"kind":"single","source":"__execution__"}} });
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

export function recastStoryboard(inputs: RecastStoryboardInputs, options?: NodeOptions): NodeWithOutputs<RecastStoryboardOutputs> {
  return createNode("nodetool.storyboard.RecastStoryboard", inputs, { id: options?.id, outputNames: ["storyboard", "invalidated", "kept"], outputTypes: {"storyboard":"storyboard","invalidated":"list[str]","kept":"list[str]"} });
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

export function renderStills(inputs: RenderStillsInputs, options?: NodeOptions): NodeWithOutputs<RenderStillsOutputs> {
  return createNode("nodetool.storyboard.RenderStills", inputs, { id: options?.id, outputNames: ["storyboard", "keyframes", "rendered", "skipped", "failed"], outputTypes: {"storyboard":"storyboard","keyframes":"list[image]","rendered":"list[str]","skipped":"list[str]","failed":"list[str]"} });
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

export function renderClips(inputs: RenderClipsInputs, options?: NodeOptions): NodeWithOutputs<RenderClipsOutputs> {
  return createNode("nodetool.storyboard.RenderClips", inputs, { id: options?.id, outputNames: ["storyboard", "clips", "rendered", "skipped", "failed"], outputTypes: {"storyboard":"storyboard","clips":"list[video]","rendered":"list[str]","skipped":"list[str]","failed":"list[str]"} });
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

export function assembleTimeline(inputs: AssembleTimelineInputs, options?: NodeOptions): NodeWithOutputs<AssembleTimelineOutputs> {
  return createNode("nodetool.storyboard.AssembleTimeline", inputs, { id: options?.id, outputNames: ["timeline", "skipped_shots", "retimed"], outputTypes: {"timeline":"timeline","skipped_shots":"list[str]","retimed":"list[dict]"} });
}
