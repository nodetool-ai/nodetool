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

export function pageCount(inputs: PageCountInputs): DslNode<PageCountOutputs, "output"> {
  return createNode("lib.pdf.PageCount", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractText(inputs: ExtractTextInputs): DslNode<ExtractTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractMarkdown(inputs: ExtractMarkdownInputs): DslNode<ExtractMarkdownOutputs, "output"> {
  return createNode("lib.pdf.ExtractMarkdown", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractTables(inputs: ExtractTablesInputs): DslNode<ExtractTablesOutputs, "output"> {
  return createNode("lib.pdf.ExtractTables", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractTextBlocks(inputs: ExtractTextBlocksInputs): DslNode<ExtractTextBlocksOutputs, "output"> {
  return createNode("lib.pdf.ExtractTextBlocks", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractStyledText(inputs: ExtractStyledTextInputs): DslNode<ExtractStyledTextOutputs, "output"> {
  return createNode("lib.pdf.ExtractStyledText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function pageMetadata(inputs: PageMetadataInputs): DslNode<PageMetadataOutputs, "output"> {
  return createNode("lib.pdf.PageMetadata", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function screenshot(inputs: ScreenshotInputs): DslNode<ScreenshotOutputs, "output"> {
  return createNode("lib.pdf.Screenshot", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function searchText(inputs: SearchTextInputs): DslNode<SearchTextOutputs, "output"> {
  return createNode("lib.pdf.SearchText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function extractOcr(inputs: ExtractOcrInputs): DslNode<ExtractOcrOutputs, "output"> {
  return createNode("lib.pdf.ExtractOcr", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
