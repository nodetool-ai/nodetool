// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// PPTX Extract Text — lib.pptx.ExtractText
export interface ExtractTextInputs {
  pptx?: Connectable<unknown>;
}

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(inputs: ExtractTextInputs): DslNode<ExtractTextOutputs, "output"> {
  return createNode("lib.pptx.ExtractText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// PPTX Extract Slides — lib.pptx.ExtractSlides
export interface ExtractSlidesInputs {
  pptx?: Connectable<unknown>;
}

export interface ExtractSlidesOutputs {
  output: Record<string, unknown>[];
}

export function extractSlides(inputs: ExtractSlidesInputs): DslNode<ExtractSlidesOutputs, "output"> {
  return createNode("lib.pptx.ExtractSlides", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
