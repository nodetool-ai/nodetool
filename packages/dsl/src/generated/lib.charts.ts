// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// Chart Renderer — lib.charts.ChartRenderer
export interface ChartRendererInputs {
  chart_config?: Connectable<unknown>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  data?: Connectable<DataframeRef>;
  background_color?: Connectable<string>;
  despine?: Connectable<boolean>;
  trim_margins?: Connectable<boolean>;
}

export interface ChartRendererOutputs {
  output: ImageRef;
}

export function chartRenderer(inputs: ChartRendererInputs): DslNode<ChartRendererOutputs, "output"> {
  return createNode("lib.charts.ChartRenderer", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
