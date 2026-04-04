// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Extract Text — lib.pymupdf.ExtractText
export interface ExtractTextInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(
  inputs: ExtractTextInputs
): DslNode<ExtractTextOutputs, "output"> {
  return createNode(
    "lib.pymupdf.ExtractText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Markdown — lib.pymupdf.ExtractMarkdown
export interface ExtractMarkdownInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractMarkdownOutputs {
  output: string;
}

export function extractMarkdown(
  inputs: ExtractMarkdownInputs
): DslNode<ExtractMarkdownOutputs, "output"> {
  return createNode(
    "lib.pymupdf.ExtractMarkdown",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Text Blocks — lib.pymupdf.ExtractTextBlocks
export interface ExtractTextBlocksInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractTextBlocksOutputs {
  output: Record<string, unknown>[];
}

export function extractTextBlocks(
  inputs: ExtractTextBlocksInputs
): DslNode<ExtractTextBlocksOutputs, "output"> {
  return createNode(
    "lib.pymupdf.ExtractTextBlocks",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Text With Style — lib.pymupdf.ExtractTextWithStyle
export interface ExtractTextWithStyleInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractTextWithStyleOutputs {
  output: Record<string, unknown>[];
}

export function extractTextWithStyle(
  inputs: ExtractTextWithStyleInputs
): DslNode<ExtractTextWithStyleOutputs, "output"> {
  return createNode(
    "lib.pymupdf.ExtractTextWithStyle",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Tables — lib.pymupdf.ExtractTables
export interface ExtractTablesInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractTablesOutputs {
  output: Record<string, unknown>[];
}

export function extractTables(
  inputs: ExtractTablesInputs
): DslNode<ExtractTablesOutputs, "output"> {
  return createNode(
    "lib.pymupdf.ExtractTables",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
