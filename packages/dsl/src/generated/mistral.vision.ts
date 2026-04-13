// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Image To Text — mistral.vision.ImageToText
export interface ImageToTextInputs {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<"pixtral-large-latest" | "pixtral-12b-2409">;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
}

export interface ImageToTextOutputs {
  output: string;
}

export function imageToText(inputs: ImageToTextInputs): DslNode<ImageToTextOutputs, "output"> {
  return createNode("mistral.vision.ImageToText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// OCR — mistral.vision.OCR
export interface OCRInputs {
  image?: Connectable<ImageRef>;
  model?: Connectable<"pixtral-large-latest" | "pixtral-12b-2409">;
}

export interface OCROutputs {
  output: string;
}

export function ocr(inputs: OCRInputs): DslNode<OCROutputs, "output"> {
  return createNode("mistral.vision.OCR", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
