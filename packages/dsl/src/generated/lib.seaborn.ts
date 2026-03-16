// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// Chart Renderer — lib.seaborn.ChartRenderer
export interface ChartRendererInputs {
  chart_config?: Connectable<unknown>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  data?: Connectable<DataframeRef>;
  despine?: Connectable<boolean>;
  trim_margins?: Connectable<boolean>;
}

export function chartRenderer(inputs: ChartRendererInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.seaborn.ChartRenderer", inputs as Record<string, unknown>);
}
