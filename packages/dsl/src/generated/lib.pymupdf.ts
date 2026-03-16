// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Extract Text — lib.pymupdf.ExtractText
export interface ExtractTextInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractText(inputs: ExtractTextInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.pymupdf.ExtractText", inputs as Record<string, unknown>);
}

// Extract Markdown — lib.pymupdf.ExtractMarkdown
export interface ExtractMarkdownInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractMarkdown(inputs: ExtractMarkdownInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.pymupdf.ExtractMarkdown", inputs as Record<string, unknown>);
}

// Extract Text Blocks — lib.pymupdf.ExtractTextBlocks
export interface ExtractTextBlocksInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractTextBlocks(inputs: ExtractTextBlocksInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.pymupdf.ExtractTextBlocks", inputs as Record<string, unknown>);
}

// Extract Text With Style — lib.pymupdf.ExtractTextWithStyle
export interface ExtractTextWithStyleInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractTextWithStyle(inputs: ExtractTextWithStyleInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.pymupdf.ExtractTextWithStyle", inputs as Record<string, unknown>);
}

// Extract Tables — lib.pymupdf.ExtractTables
export interface ExtractTablesInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractTables(inputs: ExtractTablesInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.pymupdf.ExtractTables", inputs as Record<string, unknown>);
}
