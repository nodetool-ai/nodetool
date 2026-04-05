// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Paddle OCR — lib.ocr.PaddleOCR
export interface PaddleOCRInputs {
  image?: Connectable<ImageRef>;
  language?: Connectable<unknown>;
}

export interface PaddleOCROutputs {
  boxes: unknown[];
  text: string;
}

export function paddleOCR(inputs: PaddleOCRInputs): DslNode<PaddleOCROutputs> {
  return createNode("lib.ocr.PaddleOCR", inputs as Record<string, unknown>, {
    outputNames: ["boxes", "text"]
  });
}
