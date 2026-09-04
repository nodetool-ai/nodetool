// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Render 3D With Blender — nodetool.blender.RenderImage
export type RenderImageInputs = {
  model?: Connectable<unknown>;
  camera_mode?: Connectable<"auto" | "scene" | "orbit">;
  width?: Connectable<number>;
  height?: Connectable<number>;
  azimuth?: Connectable<number>;
  elevation?: Connectable<number>;
  fov?: Connectable<number>;
  zoom?: Connectable<number>;
  lighting?: Connectable<"studio" | "soft" | "flat">;
  light_intensity?: Connectable<number>;
  background_color?: Connectable<string>;
  transparent?: Connectable<boolean>;
  engine?: Connectable<"eevee" | "cycles">;
  samples?: Connectable<number>;
  denoise?: Connectable<boolean>;
  resolution_percentage?: Connectable<number>;
  timeout?: Connectable<number>;
};

export interface RenderImageOutputs {
  image: ImageRef;
}

export function renderImage(inputs: RenderImageInputs): DslNode<RenderImageOutputs, "image"> {
  return createNode("nodetool.blender.RenderImage", inputs, { outputNames: ["image"], defaultOutput: "image" });
}

// Render 3D Passes With Blender — nodetool.blender.RenderPasses
export type RenderPassesInputs = {
  model?: Connectable<unknown>;
  camera_mode?: Connectable<"auto" | "scene" | "orbit">;
  width?: Connectable<number>;
  height?: Connectable<number>;
  azimuth?: Connectable<number>;
  elevation?: Connectable<number>;
  fov?: Connectable<number>;
  zoom?: Connectable<number>;
  lighting?: Connectable<"studio" | "soft" | "flat">;
  light_intensity?: Connectable<number>;
  background_color?: Connectable<string>;
  transparent?: Connectable<boolean>;
  engine?: Connectable<"eevee" | "cycles">;
  samples?: Connectable<number>;
  denoise?: Connectable<boolean>;
  resolution_percentage?: Connectable<number>;
  passes?: Connectable<string[]>;
  depth_format?: Connectable<"png16" | "exr">;
  timeout?: Connectable<number>;
};

export interface RenderPassesOutputs {
  color: ImageRef;
  depth: ImageRef;
  depth_near: number;
  depth_far: number;
  normal: ImageRef;
  mask: ImageRef;
}

export function renderPasses(inputs: RenderPassesInputs): DslNode<RenderPassesOutputs> {
  return createNode("nodetool.blender.RenderPasses", inputs, { outputNames: ["color", "depth", "depth_near", "depth_far", "normal", "mask"] });
}

// Render 3D Animation With Blender — nodetool.blender.RenderAnimation
export type RenderAnimationInputs = {
  model?: Connectable<unknown>;
  camera_mode?: Connectable<"auto" | "scene" | "orbit">;
  width?: Connectable<number>;
  height?: Connectable<number>;
  azimuth?: Connectable<number>;
  elevation?: Connectable<number>;
  fov?: Connectable<number>;
  zoom?: Connectable<number>;
  lighting?: Connectable<"studio" | "soft" | "flat">;
  light_intensity?: Connectable<number>;
  background_color?: Connectable<string>;
  transparent?: Connectable<boolean>;
  engine?: Connectable<"eevee" | "cycles">;
  samples?: Connectable<number>;
  denoise?: Connectable<boolean>;
  resolution_percentage?: Connectable<number>;
  frame_start?: Connectable<number>;
  frame_end?: Connectable<number>;
  fps?: Connectable<number>;
  orbit_degrees?: Connectable<number>;
  timeout?: Connectable<number>;
};

export interface RenderAnimationOutputs {
  video: VideoRef;
}

export function renderAnimation(inputs: RenderAnimationInputs): DslNode<RenderAnimationOutputs, "video"> {
  return createNode("nodetool.blender.RenderAnimation", inputs, { outputNames: ["video"], defaultOutput: "video" });
}

// Prepare 3D Model For Engine — nodetool.blender.PrepareForEngine
export type PrepareForEngineInputs = {
  model?: Connectable<unknown>;
  target_faces?: Connectable<number>;
  unwrap?: Connectable<boolean>;
  bake?: Connectable<"none" | "ao" | "normal" | "both">;
  bake_resolution?: Connectable<number>;
  lod_count?: Connectable<number>;
  timeout?: Connectable<number>;
};

export interface PrepareForEngineOutputs {
  model: unknown;
  lods: unknown[];
}

export function prepareForEngine(inputs: PrepareForEngineInputs): DslNode<PrepareForEngineOutputs> {
  return createNode("nodetool.blender.PrepareForEngine", inputs, { outputNames: ["model", "lods"] });
}

// Export 3D Model With Blender — nodetool.blender.ExportModel
export type ExportModelInputs = {
  model?: Connectable<unknown>;
  format?: Connectable<"fbx" | "obj" | "usd">;
  timeout?: Connectable<number>;
};

export interface ExportModelOutputs {
  file: unknown;
}

export function exportModel(inputs: ExportModelInputs): DslNode<ExportModelOutputs, "file"> {
  return createNode("nodetool.blender.ExportModel", inputs, { outputNames: ["file"], defaultOutput: "file" });
}
