// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// OCR Extract Text — lib.ocr.ExtractText
export interface ExtractTextInputs {
  image?: Connectable<ImageRef>;
  language?: Connectable<string>;
}

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(inputs: ExtractTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractTextOutputs, "output"> {
  return createNode("lib.ocr.ExtractText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// OCR Extract Data — lib.ocr.ExtractData
export interface ExtractDataInputs {
  image?: Connectable<ImageRef>;
  language?: Connectable<string>;
}

export interface ExtractDataOutputs {
  output: Record<string, unknown>;
}

export function extractData(inputs: ExtractDataInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractDataOutputs, "output"> {
  return createNode("lib.ocr.ExtractData", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
