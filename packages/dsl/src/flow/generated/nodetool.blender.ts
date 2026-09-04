// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, VideoRef } from "../../types.js";

// Render 3D With Blender — nodetool.blender.RenderImage
export type RenderImageInputs = {
  model?: unknown;
  camera_mode?: "auto" | "scene" | "orbit";
  width?: number;
  height?: number;
  azimuth?: number;
  elevation?: number;
  fov?: number;
  zoom?: number;
  lighting?: "studio" | "soft" | "flat";
  light_intensity?: number;
  background_color?: string;
  transparent?: boolean;
  engine?: "eevee" | "cycles";
  samples?: number;
  denoise?: boolean;
  resolution_percentage?: number;
  timeout?: number;
};

export interface RenderImageOutputs {
  image: ImageRef;
}

export function renderImage(inputs: RenderImageInputs): Promise<RenderImageOutputs> {
  return callNode<RenderImageOutputs>("nodetool.blender.RenderImage", inputs);
}

// Render 3D Passes With Blender — nodetool.blender.RenderPasses
export type RenderPassesInputs = {
  model?: unknown;
  camera_mode?: "auto" | "scene" | "orbit";
  width?: number;
  height?: number;
  azimuth?: number;
  elevation?: number;
  fov?: number;
  zoom?: number;
  lighting?: "studio" | "soft" | "flat";
  light_intensity?: number;
  background_color?: string;
  transparent?: boolean;
  engine?: "eevee" | "cycles";
  samples?: number;
  denoise?: boolean;
  resolution_percentage?: number;
  passes?: string[];
  depth_format?: "png16" | "exr";
  timeout?: number;
};

export interface RenderPassesOutputs {
  color: ImageRef;
  depth: ImageRef;
  depth_near: number;
  depth_far: number;
  normal: ImageRef;
  mask: ImageRef;
}

export function renderPasses(inputs: RenderPassesInputs): Promise<RenderPassesOutputs> {
  return callNode<RenderPassesOutputs>("nodetool.blender.RenderPasses", inputs);
}

// Render 3D Animation With Blender — nodetool.blender.RenderAnimation
export type RenderAnimationInputs = {
  model?: unknown;
  camera_mode?: "auto" | "scene" | "orbit";
  width?: number;
  height?: number;
  azimuth?: number;
  elevation?: number;
  fov?: number;
  zoom?: number;
  lighting?: "studio" | "soft" | "flat";
  light_intensity?: number;
  background_color?: string;
  transparent?: boolean;
  engine?: "eevee" | "cycles";
  samples?: number;
  denoise?: boolean;
  resolution_percentage?: number;
  frame_start?: number;
  frame_end?: number;
  fps?: number;
  orbit_degrees?: number;
  timeout?: number;
};

export interface RenderAnimationOutputs {
  video: VideoRef;
}

export function renderAnimation(inputs: RenderAnimationInputs): Promise<RenderAnimationOutputs> {
  return callNode<RenderAnimationOutputs>("nodetool.blender.RenderAnimation", inputs);
}

// Prepare 3D Model For Engine — nodetool.blender.PrepareForEngine
export type PrepareForEngineInputs = {
  model?: unknown;
  target_faces?: number;
  unwrap?: boolean;
  bake?: "none" | "ao" | "normal" | "both";
  bake_resolution?: number;
  lod_count?: number;
  timeout?: number;
};

export interface PrepareForEngineOutputs {
  model: unknown;
  lods: unknown[];
}

export function prepareForEngine(inputs: PrepareForEngineInputs): Promise<PrepareForEngineOutputs> {
  return callNode<PrepareForEngineOutputs>("nodetool.blender.PrepareForEngine", inputs);
}

// Export 3D Model With Blender — nodetool.blender.ExportModel
export type ExportModelInputs = {
  model?: unknown;
  format?: "fbx" | "obj" | "usd";
  timeout?: number;
};

export interface ExportModelOutputs {
  file: unknown;
}

export function exportModel(inputs: ExportModelInputs): Promise<ExportModelOutputs> {
  return callNode<ExportModelOutputs>("nodetool.blender.ExportModel", inputs);
}
