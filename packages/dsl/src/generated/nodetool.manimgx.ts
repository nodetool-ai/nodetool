// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Render ManimGX Scene — nodetool.manimgx.RenderScene
export type RenderSceneInputs = {
  code?: Connectable<string>;
  scene_name?: Connectable<string>;
  timeout?: Connectable<number>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  fps?: Connectable<number>;
  preset?: Connectable<"ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow">;
  crf?: Connectable<number>;
  [name: string]: unknown;
};

export interface RenderSceneOutputs {
  video: VideoRef;
  storyboard: ImageRef[];
  report: string;
  subtitles: string;
  duration: number;
}

export function renderScene(inputs: RenderSceneInputs, options?: NodeOptions): NodeWithOutputs<RenderSceneOutputs> {
  return createNode("nodetool.manimgx.RenderScene", inputs, { id: options?.id, outputNames: ["video", "storyboard", "report", "subtitles", "duration"], outputTypes: {"video":"video","storyboard":"list[image]","report":"str","subtitles":"str","duration":"float"} });
}

// Inspect ManimGX Scene — nodetool.manimgx.InspectScene
export type InspectSceneInputs = {
  code?: Connectable<string>;
  scene_name?: Connectable<string>;
  timeout?: Connectable<number>;
  times?: Connectable<string>;
  [name: string]: unknown;
};

export interface InspectSceneOutputs {
  ok: boolean;
  problems: boolean;
  report: string;
  storyboard: ImageRef[];
  duration: number;
}

export function inspectScene(inputs: InspectSceneInputs, options?: NodeOptions): NodeWithOutputs<InspectSceneOutputs> {
  return createNode("nodetool.manimgx.InspectScene", inputs, { id: options?.id, outputNames: ["ok", "problems", "report", "storyboard", "duration"], outputTypes: {"ok":"bool","problems":"bool","report":"str","storyboard":"list[image]","duration":"float"} });
}

// Generate ManimGX Scene — nodetool.manimgx.GenerateScene
export type GenerateSceneInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  max_attempts?: Connectable<number>;
  send_storyboard?: Connectable<boolean>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  fps?: Connectable<number>;
  timeout?: Connectable<number>;
  [name: string]: unknown;
};

export interface GenerateSceneOutputs {
  video: VideoRef;
  code: string;
  storyboard: ImageRef[];
  report: string;
  attempts: number;
}

export function generateScene(inputs: GenerateSceneInputs, options?: NodeOptions): NodeWithOutputs<GenerateSceneOutputs> {
  return createNode("nodetool.manimgx.GenerateScene", inputs, { id: options?.id, outputNames: ["video", "code", "storyboard", "report", "attempts"], outputTypes: {"video":"video","code":"str","storyboard":"list[image]","report":"str","attempts":"int"} });
}
