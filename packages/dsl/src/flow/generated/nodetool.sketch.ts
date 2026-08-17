// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Render Sketch — nodetool.sketch.RenderSketch
export type RenderSketchInputs = {
  sketch?: unknown;
};

export interface RenderSketchOutputs {
  image: ImageRef;
  mask: ImageRef;
}

export function renderSketch(inputs: RenderSketchInputs): Promise<RenderSketchOutputs> {
  return callNode<RenderSketchOutputs>("nodetool.sketch.RenderSketch", inputs);
}

// Sketch Layers — nodetool.sketch.SketchLayers
export type SketchLayersInputs = {
  sketch?: unknown;
};

export interface SketchLayersOutputs {
  layers: ImageRef[];
  names: string[];
}

export function sketchLayers(inputs: SketchLayersInputs): Promise<SketchLayersOutputs> {
  return callNode<SketchLayersOutputs>("nodetool.sketch.SketchLayers", inputs);
}

// Create Sketch — nodetool.sketch.CreateSketch
export type CreateSketchInputs = {
  image?: ImageRef;
  name?: string;
};

export interface CreateSketchOutputs {
  output: unknown;
}

export function createSketch(inputs: CreateSketchInputs): Promise<CreateSketchOutputs> {
  return callNode<CreateSketchOutputs>("nodetool.sketch.CreateSketch", inputs);
}
