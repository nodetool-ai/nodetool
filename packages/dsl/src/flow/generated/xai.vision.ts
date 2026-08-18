// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Image To Text — xai.vision.ImageToText
export type ImageToTextInputs = {
  image?: ImageRef;
  prompt?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

export interface ImageToTextOutputs {
  output: string;
}

export function imageToText(inputs: ImageToTextInputs): Promise<ImageToTextOutputs> {
  return callNode<ImageToTextOutputs>("xai.vision.ImageToText", inputs);
}
