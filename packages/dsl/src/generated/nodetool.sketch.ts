// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Render Sketch — nodetool.sketch.RenderSketch
export type RenderSketchInputs = {
  sketch?: Connectable<unknown>;
};

export interface RenderSketchOutputs {
  image: ImageRef;
  mask: ImageRef;
}

export function renderSketch(inputs: RenderSketchInputs, options?: NodeOptions): NodeWithOutputs<RenderSketchOutputs> {
  return createNode("nodetool.sketch.RenderSketch", inputs, { id: options?.id, outputNames: ["image", "mask"], outputTypes: {"image":"image","mask":"image"} });
}

// Sketch Layers — nodetool.sketch.SketchLayers
export type SketchLayersInputs = {
  sketch?: Connectable<unknown>;
};

export interface SketchLayersOutputs {
  layers: ImageRef[];
  names: string[];
}

export function sketchLayers(inputs: SketchLayersInputs, options?: NodeOptions): NodeWithOutputs<SketchLayersOutputs> {
  return createNode("nodetool.sketch.SketchLayers", inputs, { id: options?.id, outputNames: ["layers", "names"], outputTypes: {"layers":"list[image]","names":"list[str]"} });
}

// Create Sketch — nodetool.sketch.CreateSketch
export type CreateSketchInputs = {
  image?: Connectable<ImageRef>;
  name?: Connectable<string>;
};

export interface CreateSketchOutputs {
  output: unknown;
}

export function createSketch(inputs: CreateSketchInputs, options?: NodeOptions): NodeWithOutputs<CreateSketchOutputs, "output"> {
  return createNode("nodetool.sketch.CreateSketch", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"sketch"}, defaultOutput: "output" });
}
