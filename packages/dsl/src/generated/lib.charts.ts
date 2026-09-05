// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// Chart Renderer — lib.charts.ChartRenderer
export type ChartRendererInputs = {
  chart_config?: Connectable<unknown>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  data?: Connectable<DataframeRef>;
  background_color?: Connectable<string>;
  trim_margins?: Connectable<boolean>;
};

export interface ChartRendererOutputs {
  output: ImageRef;
}

export function chartRenderer(inputs: ChartRendererInputs): DslNode<ChartRendererOutputs, "output"> {
  return createNode("lib.charts.ChartRenderer", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
