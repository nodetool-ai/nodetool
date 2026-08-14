// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
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

export function extractText(inputs: ExtractTextInputs): DslNode<ExtractTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractText", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractMarkdown(inputs: ExtractMarkdownInputs): DslNode<ExtractMarkdownOutputs, "output"> {
  return createNode("lib.pdf.ExtractMarkdown", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractTables(inputs: ExtractTablesInputs): DslNode<ExtractTablesOutputs, "output"> {
  return createNode("lib.pdf.ExtractTables", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractStyledText(inputs: ExtractStyledTextInputs): DslNode<ExtractStyledTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractStyledText", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function screenshot(inputs: ScreenshotInputs): DslNode<ScreenshotOutputs, "output"> {
  return createNode("lib.pdf.Screenshot", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function pdftoppm(inputs: PdftoppmInputs): DslNode<PdftoppmOutputs, "output"> {
  return createNode("lib.pdf.Pdftoppm", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractOcr(inputs: ExtractOcrInputs): DslNode<ExtractOcrOutputs, "output"> {
  return createNode("lib.pdf.ExtractOcr", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
