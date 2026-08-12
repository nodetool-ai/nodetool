// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Render Sketch — nodetool.sketch.RenderSketch
export type RenderSketchInputs = {
  sketch?: Connectable<unknown>;
};

export interface RenderSketchOutputs {
  image: ImageRef;
  mask: ImageRef;
}

export function renderSketch(inputs: RenderSketchInputs): DslNode<RenderSketchOutputs> {
  return createNode("nodetool.sketch.RenderSketch", inputs, { outputNames: ["image", "mask"] });
}

// Sketch Layers — nodetool.sketch.SketchLayers
export type SketchLayersInputs = {
  sketch?: Connectable<unknown>;
};

export interface SketchLayersOutputs {
  layers: ImageRef[];
  names: string[];
}

export function sketchLayers(inputs: SketchLayersInputs): DslNode<SketchLayersOutputs> {
  return createNode("nodetool.sketch.SketchLayers", inputs, { outputNames: ["layers", "names"] });
}

// Create Sketch — nodetool.sketch.CreateSketch
export type CreateSketchInputs = {
  image?: Connectable<ImageRef>;
  name?: Connectable<string>;
};

export interface CreateSketchOutputs {
  output: unknown;
}

export function createSketch(inputs: CreateSketchInputs): DslNode<CreateSketchOutputs, "output"> {
  return createNode("nodetool.sketch.CreateSketch", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
