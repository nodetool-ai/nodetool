// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// PDF Page Count — lib.pdf.PageCount
export interface PageCountInputs {
  pdf?: Connectable<unknown>;
}

export interface PageCountOutputs {
  output: number;
}

export function pageCount(inputs: PageCountInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PageCountOutputs, "output"> {
  return createNode("lib.pdf.PageCount", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Extract Text — lib.pdf.ExtractText
export interface ExtractTextInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(inputs: ExtractTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF to Markdown — lib.pdf.ExtractMarkdown
export interface ExtractMarkdownInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractMarkdownOutputs {
  output: string;
}

export function extractMarkdown(inputs: ExtractMarkdownInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractMarkdownOutputs, "output"> {
  return createNode("lib.pdf.ExtractMarkdown", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Extract Tables — lib.pdf.ExtractTables
export interface ExtractTablesInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  y_tolerance?: Connectable<number>;
}

export interface ExtractTablesOutputs {
  output: Record<string, unknown>[];
}

export function extractTables(inputs: ExtractTablesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractTablesOutputs, "output"> {
  return createNode("lib.pdf.ExtractTables", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Extract Text Blocks — lib.pdf.ExtractTextBlocks
export interface ExtractTextBlocksInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractTextBlocksOutputs {
  output: Record<string, unknown>[];
}

export function extractTextBlocks(inputs: ExtractTextBlocksInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractTextBlocksOutputs, "output"> {
  return createNode("lib.pdf.ExtractTextBlocks", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Extract Styled Text — lib.pdf.ExtractStyledText
export interface ExtractStyledTextInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractStyledTextOutputs {
  output: Record<string, unknown>[];
}

export function extractStyledText(inputs: ExtractStyledTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractStyledTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractStyledText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Page Metadata — lib.pdf.PageMetadata
export interface PageMetadataInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface PageMetadataOutputs {
  output: Record<string, unknown>[];
}

export function pageMetadata(inputs: PageMetadataInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PageMetadataOutputs, "output"> {
  return createNode("lib.pdf.PageMetadata", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Page Screenshot — lib.pdf.Screenshot
export interface ScreenshotInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  dpi?: Connectable<number>;
}

export interface ScreenshotOutputs {
  output: ImageRef[];
}

export function screenshot(inputs: ScreenshotInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ScreenshotOutputs, "output"> {
  return createNode("lib.pdf.Screenshot", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Rasterize (pdftoppm) — lib.pdf.Pdftoppm
export interface PdftoppmInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  dpi?: Connectable<number>;
  format?: Connectable<"png" | "jpeg" | "tiff">;
  scale_to?: Connectable<number>;
}

export interface PdftoppmOutputs {
  output: ImageRef[];
}

export function pdftoppm(inputs: PdftoppmInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PdftoppmOutputs, "output"> {
  return createNode("lib.pdf.Pdftoppm", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Search Text — lib.pdf.SearchText
export interface SearchTextInputs {
  pdf?: Connectable<unknown>;
  phrase?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface SearchTextOutputs {
  output: Record<string, unknown>[];
}

export function searchText(inputs: SearchTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SearchTextOutputs, "output"> {
  return createNode("lib.pdf.SearchText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// PDF Extract Text (OCR) — lib.pdf.ExtractOcr
export interface ExtractOcrInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  ocr_language?: Connectable<string>;
  dpi?: Connectable<number>;
}

export interface ExtractOcrOutputs {
  output: string;
}

export function extractOcr(inputs: ExtractOcrInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractOcrOutputs, "output"> {
  return createNode("lib.pdf.ExtractOcr", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
