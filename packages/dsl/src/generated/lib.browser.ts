// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Screenshot — lib.browser.Screenshot
export type ScreenshotInputs = {
  url?: Connectable<string>;
  selector?: Connectable<string>;
  timeout?: Connectable<number>;
};

export interface ScreenshotOutputs {
  output: ImageRef;
}

export function screenshot(inputs: ScreenshotInputs, options?: NodeOptions): NodeWithOutputs<ScreenshotOutputs, "output"> {
  return createNode("lib.browser.Screenshot", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
