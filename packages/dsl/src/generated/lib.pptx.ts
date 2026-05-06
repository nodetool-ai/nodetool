// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// PPTX Extract Text — lib.pptx.ExtractText
export interface ExtractTextInputs {
  pptx?: Connectable<unknown>;
}

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(inputs: ExtractTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractTextOutputs, "output"> {
  return createNode("lib.pptx.ExtractText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PPTX Extract Slides — lib.pptx.ExtractSlides
export interface ExtractSlidesInputs {
  pptx?: Connectable<unknown>;
}

export interface ExtractSlidesOutputs {
  output: Record<string, unknown>[];
}

export function extractSlides(inputs: ExtractSlidesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractSlidesOutputs, "output"> {
  return createNode("lib.pptx.ExtractSlides", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
