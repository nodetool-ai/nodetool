// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Plot Array — lib.array.visualization.PlotArray
export interface PlotArrayInputs {
  values?: Connectable<unknown>;
  plot_type?: Connectable<unknown>;
}

export interface PlotArrayOutputs {
  output: ImageRef;
}

export function plotArray(
  inputs: PlotArrayInputs
): DslNode<PlotArrayOutputs, "output"> {
  return createNode(
    "lib.array.visualization.PlotArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
