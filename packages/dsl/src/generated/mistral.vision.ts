// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Image To Text — mistral.vision.ImageToText
export type ImageToTextInputs = {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<"pixtral-large-latest" | "pixtral-12b-2409">;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
};

export interface ImageToTextOutputs {
  output: string;
}

export function imageToText(inputs: ImageToTextInputs, options?: NodeOptions): NodeWithOutputs<ImageToTextOutputs, "output"> {
  return createNode("mistral.vision.ImageToText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// OCR — mistral.vision.OCR
export type OCRInputs = {
  image?: Connectable<ImageRef>;
  model?: Connectable<"pixtral-large-latest" | "pixtral-12b-2409">;
};

export interface OCROutputs {
  output: string;
}

export function ocr(inputs: OCRInputs, options?: NodeOptions): NodeWithOutputs<OCROutputs, "output"> {
  return createNode("mistral.vision.OCR", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}
