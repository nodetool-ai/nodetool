// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// Get Page Count — lib.pdfplumber.GetPageCount
export interface GetPageCountInputs {
  pdf?: Connectable<unknown>;
}

export interface GetPageCountOutputs {
  output: number;
}

export function getPageCount(
  inputs: GetPageCountInputs
): DslNode<GetPageCountOutputs, "output"> {
  return createNode(
    "lib.pdfplumber.GetPageCount",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Text — lib.pdfplumber.ExtractText
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
    "lib.pdfplumber.ExtractText",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Page Metadata — lib.pdfplumber.ExtractPageMetadata
export interface ExtractPageMetadataInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractPageMetadataOutputs {
  output: Record<string, unknown>[];
}

export function extractPageMetadata(
  inputs: ExtractPageMetadataInputs
): DslNode<ExtractPageMetadataOutputs, "output"> {
  return createNode(
    "lib.pdfplumber.ExtractPageMetadata",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Tables — lib.pdfplumber.ExtractTables
export interface ExtractTablesInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  table_settings?: Connectable<Record<string, unknown>>;
}

export interface ExtractTablesOutputs {
  output: DataframeRef[];
}

export function extractTables(
  inputs: ExtractTablesInputs
): DslNode<ExtractTablesOutputs, "output"> {
  return createNode(
    "lib.pdfplumber.ExtractTables",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Extract Images — lib.pdfplumber.ExtractImages
export interface ExtractImagesInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export interface ExtractImagesOutputs {
  output: ImageRef[];
}

export function extractImages(
  inputs: ExtractImagesInputs
): DslNode<ExtractImagesOutputs, "output"> {
  return createNode(
    "lib.pdfplumber.ExtractImages",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
