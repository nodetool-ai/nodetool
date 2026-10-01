// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, VideoRef, Entity } from "../types.js";

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

export function director(inputs: DirectorInputs, options?: NodeOptions): NodeWithOutputs<DirectorOutputs> {
  return createNode("nodetool.creative.Director", inputs, { id: options?.id, outputNames: ["screenplay", "narration", "music_prompt", "title"], outputTypes: {"screenplay":"dict","narration":"str","music_prompt":"str","title":"str"} });
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

export function screenplayShots(inputs: ScreenplayShotsInputs, options?: NodeOptions): NodeWithOutputs<ScreenplayShotsOutputs> {
  return createNode("nodetool.creative.ScreenplayShots", inputs, { id: options?.id, outputNames: ["shot", "shot_prompt", "index", "output"], outputTypes: {"shot":"dict","shot_prompt":"str","index":"int","output":"list[str]"}, streaming: true, inputMode: "buffered", outputCorrelation: {"shot":{"kind":"iteration","source":"__execution__","group":"items"},"shot_prompt":{"kind":"iteration","source":"__execution__","group":"items"},"index":{"kind":"iteration","source":"__execution__","group":"items"},"output":{"kind":"single","source":"__execution__"}} });
}

// Apply Entities — nodetool.creative.ApplyEntities
export type ApplyEntitiesInputs = {
  text?: Connectable<string>;
  entities?: Connectable<Entity[]>;
};

export interface ApplyEntitiesOutputs {
  prompt: string;
  reference_images: ImageRef[];
}

export function applyEntities(inputs: ApplyEntitiesInputs, options?: NodeOptions): NodeWithOutputs<ApplyEntitiesOutputs> {
  return createNode("nodetool.creative.ApplyEntities", inputs, { id: options?.id, outputNames: ["prompt", "reference_images"], outputTypes: {"prompt":"str","reference_images":"list[image]"} });
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

export function shotBatch(inputs: ShotBatchInputs, options?: NodeOptions): NodeWithOutputs<ShotBatchOutputs, "shots"> {
  return createNode("nodetool.creative.ShotBatch", inputs, { id: options?.id, outputNames: ["shots"], outputTypes: {"shots":"list[dict]"}, defaultOutput: "shots" });
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

export function shotChain(inputs: ShotChainInputs, options?: NodeOptions): NodeWithOutputs<ShotChainOutputs, "videos"> {
  return createNode("nodetool.creative.ShotChain", inputs, { id: options?.id, outputNames: ["videos"], outputTypes: {"videos":"list[video]"}, defaultOutput: "videos" });
}
