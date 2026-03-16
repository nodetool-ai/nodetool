// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Image To Text — mistral.vision.ImageToText
export interface ImageToTextInputs {
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  temperature?: Connectable<number>;
  max_tokens?: Connectable<number>;
}

export function imageToText(inputs: ImageToTextInputs): DslNode<SingleOutput<string>> {
  return createNode("mistral.vision.ImageToText", inputs as Record<string, unknown>);
}

// OCR — mistral.vision.OCR
export interface OCRInputs {
  image?: Connectable<ImageRef>;
  model?: Connectable<unknown>;
}

export function ocr(inputs: OCRInputs): DslNode<SingleOutput<string>> {
  return createNode("mistral.vision.OCR", inputs as Record<string, unknown>);
}
