// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Director — nodetool.creative.Director
export type DirectorInputs = {
  model?: Connectable<unknown>;
  brief?: Connectable<string>;
  style?: Connectable<string>;
  shot_count?: Connectable<number>;
  aspect_ratio?: Connectable<string>;
  max_tokens?: Connectable<number>;
};

export interface DirectorOutputs {
  screenplay: Record<string, unknown>;
  narration: string;
  music_prompt: string;
  title: string;
}

export function director(inputs: DirectorInputs): DslNode<DirectorOutputs> {
  return createNode("nodetool.creative.Director", inputs, { outputNames: ["screenplay", "narration", "music_prompt", "title"] });
}

// Screenplay Shots — nodetool.creative.ScreenplayShots
export type ScreenplayShotsInputs = {
  screenplay?: Connectable<Record<string, unknown>>;
};

export interface ScreenplayShotsOutputs {
  shot: Record<string, unknown>;
  shot_prompt: string;
  index: number;
  output: string[];
}

export function screenplayShots(inputs: ScreenplayShotsInputs): DslNode<ScreenplayShotsOutputs> {
  return createNode("nodetool.creative.ScreenplayShots", inputs, { outputNames: ["shot", "shot_prompt", "index", "output"], streaming: true });
}

// Apply Entities — nodetool.creative.ApplyEntities
export type ApplyEntitiesInputs = {
  text?: Connectable<string>;
  entities?: Connectable<Record<string, unknown>[]>;
};

export interface ApplyEntitiesOutputs {
  prompt: string;
  reference_images: ImageRef[];
}

export function applyEntities(inputs: ApplyEntitiesInputs): DslNode<ApplyEntitiesOutputs> {
  return createNode("nodetool.creative.ApplyEntities", inputs, { outputNames: ["prompt", "reference_images"] });
}

// Shot Batch — nodetool.creative.ShotBatch
export type ShotBatchInputs = {
  screenplay?: Connectable<Record<string, unknown>>;
  aspect_ratio?: Connectable<string>;
  default_duration?: Connectable<number>;
};

export interface ShotBatchOutputs {
  shots: Record<string, unknown>[];
}

export function shotBatch(inputs: ShotBatchInputs): DslNode<ShotBatchOutputs, "shots"> {
  return createNode("nodetool.creative.ShotBatch", inputs, { outputNames: ["shots"], defaultOutput: "shots" });
}

// Shot Chain — nodetool.creative.ShotChain
export type ShotChainInputs = {
  model?: Connectable<unknown>;
  continuation_model?: Connectable<unknown>;
  shots?: Connectable<Record<string, unknown>[]>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
};

export interface ShotChainOutputs {
  videos: VideoRef[];
}

export function shotChain(inputs: ShotChainInputs): DslNode<ShotChainOutputs, "videos"> {
  return createNode("nodetool.creative.ShotChain", inputs, { outputNames: ["videos"], defaultOutput: "videos" });
}
