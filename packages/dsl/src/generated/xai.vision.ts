// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Image To Text — xai.vision.ImageToText
export type ImageToTextInputs = {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<string>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
};

export interface ImageToTextOutputs {
  output: string;
}

export function imageToText(inputs: ImageToTextInputs): DslNode<ImageToTextOutputs, "output"> {
  return createNode("xai.vision.ImageToText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
