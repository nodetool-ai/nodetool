// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// EPUB Metadata — lib.epub.Metadata
export interface MetadataInputs {
  epub?: Connectable<unknown>;
}

export interface MetadataOutputs {
  output: Record<string, unknown>;
}

export function metadata(inputs: MetadataInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MetadataOutputs, "output"> {
  return createNode("lib.epub.Metadata", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// EPUB Table of Contents — lib.epub.TableOfContents
export interface TableOfContentsInputs {
  epub?: Connectable<unknown>;
}

export interface TableOfContentsOutputs {
  output: Record<string, unknown>[];
}

export function tableOfContents(inputs: TableOfContentsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TableOfContentsOutputs, "output"> {
  return createNode("lib.epub.TableOfContents", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// EPUB Extract Text — lib.epub.ExtractText
export interface ExtractTextInputs {
  epub?: Connectable<unknown>;
  chapter_separator?: Connectable<string>;
}

export interface ExtractTextOutputs {
  output: string;
}

export function extractText(inputs: ExtractTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractTextOutputs, "output"> {
  return createNode("lib.epub.ExtractText", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// EPUB Extract Chapters — lib.epub.ExtractChapters
export interface ExtractChaptersInputs {
  epub?: Connectable<unknown>;
}

export interface ExtractChaptersOutputs {
  output: Record<string, unknown>[];
}

export function extractChapters(inputs: ExtractChaptersInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractChaptersOutputs, "output"> {
  return createNode("lib.epub.ExtractChapters", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
