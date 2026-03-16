// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef, DataframeRef } from "../types.js";

// Get Page Count — lib.pdfplumber.GetPageCount
export interface GetPageCountInputs {
  pdf?: Connectable<unknown>;
}

export function getPageCount(inputs: GetPageCountInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.pdfplumber.GetPageCount", inputs as Record<string, unknown>);
}

// Extract Text — lib.pdfplumber.ExtractText
export interface ExtractTextInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractText(inputs: ExtractTextInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.pdfplumber.ExtractText", inputs as Record<string, unknown>);
}

// Extract Page Metadata — lib.pdfplumber.ExtractPageMetadata
export interface ExtractPageMetadataInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractPageMetadata(inputs: ExtractPageMetadataInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.pdfplumber.ExtractPageMetadata", inputs as Record<string, unknown>);
}

// Extract Tables — lib.pdfplumber.ExtractTables
export interface ExtractTablesInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
  table_settings?: Connectable<Record<string, unknown>>;
}

export function extractTables(inputs: ExtractTablesInputs): DslNode<SingleOutput<DataframeRef[]>> {
  return createNode("lib.pdfplumber.ExtractTables", inputs as Record<string, unknown>);
}

// Extract Images — lib.pdfplumber.ExtractImages
export interface ExtractImagesInputs {
  pdf?: Connectable<unknown>;
  start_page?: Connectable<number>;
  end_page?: Connectable<number>;
}

export function extractImages(inputs: ExtractImagesInputs): DslNode<SingleOutput<ImageRef[]>> {
  return createNode("lib.pdfplumber.ExtractImages", inputs as Record<string, unknown>);
}
