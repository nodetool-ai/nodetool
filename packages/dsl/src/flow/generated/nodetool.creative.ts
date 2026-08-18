// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, VideoRef } from "../../types.js";

// Director — nodetool.creative.Director
export type DirectorInputs = {
  model?: unknown;
  brief?: string;
  style?: string;
  shot_count?: number;
  aspect_ratio?: string;
  max_tokens?: number;
};

export interface DirectorOutputs {
  screenplay: Record<string, unknown>;
  narration: string;
  music_prompt: string;
  title: string;
}

export function director(inputs: DirectorInputs): Promise<DirectorOutputs> {
  return callNode<DirectorOutputs>("nodetool.creative.Director", inputs);
}

// Screenplay Shots — nodetool.creative.ScreenplayShots
export type ScreenplayShotsInputs = {
  screenplay?: Record<string, unknown>;
};

export interface ScreenplayShotsOutputs {
  shot: Record<string, unknown>;
  shot_prompt: string;
  index: number;
  output: string[];
}

export function screenplayShots(inputs: ScreenplayShotsInputs): Promise<ScreenplayShotsOutputs> {
  return callNode<ScreenplayShotsOutputs>("nodetool.creative.ScreenplayShots", inputs);
}

screenplayShots.stream = function (inputs: ScreenplayShotsInputs): AsyncIterable<Partial<ScreenplayShotsOutputs>> {
  return streamNode<Partial<ScreenplayShotsOutputs>>("nodetool.creative.ScreenplayShots", inputs);
};

// Apply Entities — nodetool.creative.ApplyEntities
export type ApplyEntitiesInputs = {
  text?: string;
  entities?: Record<string, unknown>[];
};

export interface ApplyEntitiesOutputs {
  prompt: string;
  reference_images: ImageRef[];
}

export function applyEntities(inputs: ApplyEntitiesInputs): Promise<ApplyEntitiesOutputs> {
  return callNode<ApplyEntitiesOutputs>("nodetool.creative.ApplyEntities", inputs);
}

// Shot Batch — nodetool.creative.ShotBatch
export type ShotBatchInputs = {
  screenplay?: Record<string, unknown>;
  aspect_ratio?: string;
  default_duration?: number;
};

export interface ShotBatchOutputs {
  shots: Record<string, unknown>[];
}

export function shotBatch(inputs: ShotBatchInputs): Promise<ShotBatchOutputs> {
  return callNode<ShotBatchOutputs>("nodetool.creative.ShotBatch", inputs);
}

// Shot Chain — nodetool.creative.ShotChain
export type ShotChainInputs = {
  model?: unknown;
  continuation_model?: unknown;
  shots?: Record<string, unknown>[];
  aspect_ratio?: string;
  resolution?: string;
};

export interface ShotChainOutputs {
  videos: VideoRef[];
}

export function shotChain(inputs: ShotChainInputs): Promise<ShotChainOutputs> {
  return callNode<ShotChainOutputs>("nodetool.creative.ShotChain", inputs);
}
