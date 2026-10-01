// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
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

export function imageToText(inputs: ImageToTextInputs, options?: NodeOptions): NodeWithOutputs<ImageToTextOutputs, "output"> {
  return createNode("xai.vision.ImageToText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}
