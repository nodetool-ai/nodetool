// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// PDF Extract Text — lib.pdf.ExtractText
export type ExtractTextInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
};

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(inputs: ExtractTextInputs, options?: NodeOptions): NodeWithOutputs<ExtractTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// PDF to Markdown — lib.pdf.ExtractMarkdown
export type ExtractMarkdownInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
};

export interface ExtractMarkdownOutputs {
  output: string;
}

export function extractMarkdown(inputs: ExtractMarkdownInputs, options?: NodeOptions): NodeWithOutputs<ExtractMarkdownOutputs, "output"> {
  return createNode("lib.pdf.ExtractMarkdown", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// PDF Extract Tables — lib.pdf.ExtractTables
export type ExtractTablesInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  y_tolerance?: Connectable<number>;
};

export interface ExtractTablesOutputs {
  output: Record<string, unknown>[];
}

export function extractTables(inputs: ExtractTablesInputs, options?: NodeOptions): NodeWithOutputs<ExtractTablesOutputs, "output"> {
  return createNode("lib.pdf.ExtractTables", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[dict]"}, defaultOutput: "output" });
}

// PDF Extract Styled Text — lib.pdf.ExtractStyledText
export type ExtractStyledTextInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
};

export interface ExtractStyledTextOutputs {
  output: Record<string, unknown>[];
}

export function extractStyledText(inputs: ExtractStyledTextInputs, options?: NodeOptions): NodeWithOutputs<ExtractStyledTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractStyledText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[dict]"}, defaultOutput: "output" });
}

// PDF Page Screenshot — lib.pdf.Screenshot
export type ScreenshotInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  dpi?: Connectable<number>;
};

export interface ScreenshotOutputs {
  output: ImageRef[];
}

export function screenshot(inputs: ScreenshotInputs, options?: NodeOptions): NodeWithOutputs<ScreenshotOutputs, "output"> {
  return createNode("lib.pdf.Screenshot", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[image]"}, defaultOutput: "output" });
}

// PDF Rasterize (pdftoppm) — lib.pdf.Pdftoppm
export type PdftoppmInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  dpi?: Connectable<number>;
  format?: Connectable<"png" | "jpeg" | "tiff">;
  scale_to?: Connectable<number>;
};

export interface PdftoppmOutputs {
  output: ImageRef[];
}

export function pdftoppm(inputs: PdftoppmInputs, options?: NodeOptions): NodeWithOutputs<PdftoppmOutputs, "output"> {
  return createNode("lib.pdf.Pdftoppm", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[image]"}, defaultOutput: "output" });
}

// PDF Extract Text (OCR) — lib.pdf.ExtractOcr
export type ExtractOcrInputs = {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  ocr_language?: Connectable<string>;
  dpi?: Connectable<number>;
};

export interface ExtractOcrOutputs {
  output: string;
}

export function extractOcr(inputs: ExtractOcrInputs, options?: NodeOptions): NodeWithOutputs<ExtractOcrOutputs, "output"> {
  return createNode("lib.pdf.ExtractOcr", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}
