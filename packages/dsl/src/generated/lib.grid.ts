// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Slice Image Grid — lib.grid.SliceImageGrid
export interface SliceImageGridInputs {
  image?: Connectable<ImageRef>;
  columns?: Connectable<number>;
  rows?: Connectable<number>;
}

export function sliceImageGrid(inputs: SliceImageGridInputs): DslNode<SingleOutput<ImageRef[]>> {
  return createNode("lib.grid.SliceImageGrid", inputs as Record<string, unknown>);
}

// Combine Image Grid — lib.grid.CombineImageGrid
export interface CombineImageGridInputs {
  tiles?: Connectable<ImageRef[]>;
  columns?: Connectable<number>;
}

export function combineImageGrid(inputs: CombineImageGridInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.grid.CombineImageGrid", inputs as Record<string, unknown>);
}
