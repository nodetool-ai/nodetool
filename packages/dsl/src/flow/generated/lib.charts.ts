// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, DataframeRef } from "../../types.js";

// Chart Renderer — lib.charts.ChartRenderer
export type ChartRendererInputs = {
  chart_config?: unknown;
  width?: number;
  height?: number;
  data?: DataframeRef;
  background_color?: string;
  despine?: boolean;
  trim_margins?: boolean;
};

export interface ChartRendererOutputs {
  output: ImageRef;
}

export function chartRenderer(inputs: ChartRendererInputs): Promise<ChartRendererOutputs> {
  return callNode<ChartRendererOutputs>("lib.charts.ChartRenderer", inputs);
}
