// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Screenshot — lib.browser.Screenshot
export type ScreenshotInputs = {
  url?: string;
  selector?: string;
  timeout?: number;
};

export interface ScreenshotOutputs {
  output: ImageRef;
}

export function screenshot(inputs: ScreenshotInputs): Promise<ScreenshotOutputs> {
  return callNode<ScreenshotOutputs>("lib.browser.Screenshot", inputs);
}
