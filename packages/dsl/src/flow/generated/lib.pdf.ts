// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// PDF Extract Text — lib.pdf.ExtractText
export type ExtractTextInputs = {
  pdf?: unknown;
  start_page?: number;
  end_page?: number;
};

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(inputs: ExtractTextInputs): Promise<ExtractTextOutputs> {
  return callNode<ExtractTextOutputs>("lib.pdf.ExtractText", inputs);
}

// PDF to Markdown — lib.pdf.ExtractMarkdown
export type ExtractMarkdownInputs = {
  pdf?: unknown;
  start_page?: number;
  end_page?: number;
};

export interface ExtractMarkdownOutputs {
  output: string;
}

export function extractMarkdown(inputs: ExtractMarkdownInputs): Promise<ExtractMarkdownOutputs> {
  return callNode<ExtractMarkdownOutputs>("lib.pdf.ExtractMarkdown", inputs);
}

// PDF Extract Tables — lib.pdf.ExtractTables
export type ExtractTablesInputs = {
  pdf?: unknown;
  start_page?: number;
  end_page?: number;
  y_tolerance?: number;
};

export interface ExtractTablesOutputs {
  output: Record<string, unknown>[];
}

export function extractTables(inputs: ExtractTablesInputs): Promise<ExtractTablesOutputs> {
  return callNode<ExtractTablesOutputs>("lib.pdf.ExtractTables", inputs);
}

// PDF Extract Styled Text — lib.pdf.ExtractStyledText
export type ExtractStyledTextInputs = {
  pdf?: unknown;
  start_page?: number;
  end_page?: number;
};

export interface ExtractStyledTextOutputs {
  output: Record<string, unknown>[];
}

export function extractStyledText(inputs: ExtractStyledTextInputs): Promise<ExtractStyledTextOutputs> {
  return callNode<ExtractStyledTextOutputs>("lib.pdf.ExtractStyledText", inputs);
}

// PDF Page Screenshot — lib.pdf.Screenshot
export type ScreenshotInputs = {
  pdf?: unknown;
  start_page?: number;
  end_page?: number;
  dpi?: number;
};

export interface ScreenshotOutputs {
  output: ImageRef[];
}

export function screenshot(inputs: ScreenshotInputs): Promise<ScreenshotOutputs> {
  return callNode<ScreenshotOutputs>("lib.pdf.Screenshot", inputs);
}

// PDF Rasterize (pdftoppm) — lib.pdf.Pdftoppm
export type PdftoppmInputs = {
  pdf?: unknown;
  start_page?: number;
  end_page?: number;
  dpi?: number;
  format?: "png" | "jpeg" | "tiff";
  scale_to?: number;
};

export interface PdftoppmOutputs {
  output: ImageRef[];
}

export function pdftoppm(inputs: PdftoppmInputs): Promise<PdftoppmOutputs> {
  return callNode<PdftoppmOutputs>("lib.pdf.Pdftoppm", inputs);
}

// PDF Extract Text (OCR) — lib.pdf.ExtractOcr
export type ExtractOcrInputs = {
  pdf?: unknown;
  start_page?: number;
  end_page?: number;
  ocr_language?: string;
  dpi?: number;
};

export interface ExtractOcrOutputs {
  output: string;
}

export function extractOcr(inputs: ExtractOcrInputs): Promise<ExtractOcrOutputs> {
  return callNode<ExtractOcrOutputs>("lib.pdf.ExtractOcr", inputs);
}
