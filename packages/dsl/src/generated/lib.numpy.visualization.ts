// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Plot Array — lib.numpy.visualization.PlotArray
export interface PlotArrayInputs {
  values?: Connectable<unknown>;
  plot_type?: Connectable<unknown>;
}

export function plotArray(inputs: PlotArrayInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.numpy.visualization.PlotArray", inputs as Record<string, unknown>);
}
