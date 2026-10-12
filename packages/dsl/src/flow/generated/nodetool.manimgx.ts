// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, VideoRef } from "../../types.js";

// Render ManimGX Scene — nodetool.manimgx.RenderScene
export type RenderSceneInputs = {
  code?: string;
  scene_name?: string;
  timeout?: number;
  width?: number;
  height?: number;
  fps?: number;
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
  crf?: number;
};

export interface RenderSceneOutputs {
  video: VideoRef;
  storyboard: ImageRef[];
  report: string;
  subtitles: string;
  duration: number;
}

export function renderScene(inputs: RenderSceneInputs): Promise<RenderSceneOutputs> {
  return callNode<RenderSceneOutputs>("nodetool.manimgx.RenderScene", inputs);
}

// Inspect ManimGX Scene — nodetool.manimgx.InspectScene
export type InspectSceneInputs = {
  code?: string;
  scene_name?: string;
  timeout?: number;
  times?: string;
};

export interface InspectSceneOutputs {
  ok: boolean;
  problems: boolean;
  report: string;
  storyboard: ImageRef[];
  duration: number;
}

export function inspectScene(inputs: InspectSceneInputs): Promise<InspectSceneOutputs> {
  return callNode<InspectSceneOutputs>("nodetool.manimgx.InspectScene", inputs);
}

// Generate ManimGX Scene — nodetool.manimgx.GenerateScene
export type GenerateSceneInputs = {
  model?: unknown;
  prompt?: string;
  max_attempts?: number;
  send_storyboard?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  timeout?: number;
};

export interface GenerateSceneOutputs {
  video: VideoRef;
  code: string;
  storyboard: ImageRef[];
  report: string;
  attempts: number;
}

export function generateScene(inputs: GenerateSceneInputs): Promise<GenerateSceneOutputs> {
  return callNode<GenerateSceneOutputs>("nodetool.manimgx.GenerateScene", inputs);
}
