// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Slice Image Grid — lib.grid.SliceImageGrid
export interface SliceImageGridInputs {
  image?: Connectable<ImageRef>;
  columns?: Connectable<number>;
  rows?: Connectable<number>;
}

export interface SliceImageGridOutputs {
  output: ImageRef[];
}

export function sliceImageGrid(
  inputs: SliceImageGridInputs
): DslNode<SliceImageGridOutputs, "output"> {
  return createNode(
    "lib.grid.SliceImageGrid",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Combine Image Grid — lib.grid.CombineImageGrid
export interface CombineImageGridInputs {
  tiles?: Connectable<ImageRef[]>;
  columns?: Connectable<number>;
}

export interface CombineImageGridOutputs {
  output: ImageRef;
}

export function combineImageGrid(
  inputs: CombineImageGridInputs
): DslNode<CombineImageGridOutputs, "output"> {
  return createNode(
    "lib.grid.CombineImageGrid",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
