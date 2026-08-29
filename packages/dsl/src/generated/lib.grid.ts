// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Slice Image Grid — lib.grid.SliceImageGrid
export type SliceImageGridInputs = {
  image?: Connectable<ImageRef>;
  columns?: Connectable<number>;
  rows?: Connectable<number>;
};

export interface SliceImageGridOutputs {
  output: ImageRef[];
}

export function sliceImageGrid(inputs: SliceImageGridInputs): DslNode<SliceImageGridOutputs, "output"> {
  return createNode("lib.grid.SliceImageGrid", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
