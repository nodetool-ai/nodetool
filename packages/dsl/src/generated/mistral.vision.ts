// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function imageToText(inputs: ImageToTextInputs): DslNode<ImageToTextOutputs, "output"> {
  return createNode("mistral.vision.ImageToText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// OCR — mistral.vision.OCR
export type OCRInputs = {
  image?: Connectable<ImageRef>;
  model?: Connectable<"pixtral-large-latest" | "pixtral-12b-2409">;
};

export interface OCROutputs {
  output: string;
}

export function ocr(inputs: OCRInputs): DslNode<OCROutputs, "output"> {
  return createNode("mistral.vision.OCR", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
