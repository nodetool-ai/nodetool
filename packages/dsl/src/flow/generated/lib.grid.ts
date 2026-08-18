// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Slice Image Grid — lib.grid.SliceImageGrid
export type SliceImageGridInputs = {
  image?: ImageRef;
  columns?: number;
  rows?: number;
};

export interface SliceImageGridOutputs {
  output: ImageRef[];
}

export function sliceImageGrid(inputs: SliceImageGridInputs): Promise<SliceImageGridOutputs> {
  return callNode<SliceImageGridOutputs>("lib.grid.SliceImageGrid", inputs);
}

// Combine Image Grid — lib.grid.CombineImageGrid
export type CombineImageGridInputs = {
  tiles?: ImageRef[];
  columns?: number;
};

export interface CombineImageGridOutputs {
  output: ImageRef;
}

export function combineImageGrid(inputs: CombineImageGridInputs): Promise<CombineImageGridOutputs> {
  return callNode<CombineImageGridOutputs>("lib.grid.CombineImageGrid", inputs);
}
