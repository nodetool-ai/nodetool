// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Image To Text — mistral.vision.ImageToText
export type ImageToTextInputs = {
  image?: ImageRef;
  prompt?: string;
  model?: "pixtral-large-latest" | "pixtral-12b-2409";
  temperature?: number;
  max_tokens?: number;
};

export interface ImageToTextOutputs {
  output: string;
}

export function imageToText(inputs: ImageToTextInputs): Promise<ImageToTextOutputs> {
  return callNode<ImageToTextOutputs>("mistral.vision.ImageToText", inputs);
}

// OCR — mistral.vision.OCR
export type OCRInputs = {
  image?: ImageRef;
  model?: "pixtral-large-latest" | "pixtral-12b-2409";
};

export interface OCROutputs {
  output: string;
}

export function ocr(inputs: OCRInputs): Promise<OCROutputs> {
  return callNode<OCROutputs>("mistral.vision.OCR", inputs);
}
