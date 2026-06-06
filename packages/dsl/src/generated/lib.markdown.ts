// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { DataframeRef } from "../types.js";

// Extract Links — lib.markdown.ExtractLinks
export interface ExtractLinksInputs {
  markdown?: Connectable<string>;
  include_titles?: Connectable<boolean>;
}

export interface ExtractLinksOutputs {
  output: Record<string, string>[];
}

export function extractLinks(inputs: ExtractLinksInputs): DslNode<ExtractLinksOutputs, "output"> {
  return createNode("lib.markdown.ExtractLinks", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Headers — lib.markdown.ExtractHeaders
export interface ExtractHeadersInputs {
  markdown?: Connectable<string>;
  max_level?: Connectable<number>;
}

export interface ExtractHeadersOutputs {
  output: Record<string, unknown>[];
}

export function extractHeaders(inputs: ExtractHeadersInputs): DslNode<ExtractHeadersOutputs, "output"> {
  return createNode("lib.markdown.ExtractHeaders", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Bullet Lists — lib.markdown.ExtractBulletLists
export interface ExtractBulletListsInputs {
  markdown?: Connectable<string>;
}

export interface ExtractBulletListsOutputs {
  output: Record<string, unknown>[];
}

export function extractBulletLists(inputs: ExtractBulletListsInputs): DslNode<ExtractBulletListsOutputs, "output"> {
  return createNode("lib.markdown.ExtractBulletLists", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Numbered Lists — lib.markdown.ExtractNumberedLists
export interface ExtractNumberedListsInputs {
  markdown?: Connectable<string>;
}

export interface ExtractNumberedListsOutputs {
  output: string[];
}

export function extractNumberedLists(inputs: ExtractNumberedListsInputs): DslNode<ExtractNumberedListsOutputs, "output"> {
  return createNode("lib.markdown.ExtractNumberedLists", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Code Blocks — lib.markdown.ExtractCodeBlocks
export interface ExtractCodeBlocksInputs {
  markdown?: Connectable<string>;
}

export interface ExtractCodeBlocksOutputs {
  output: Record<string, string>[];
}

export function extractCodeBlocks(inputs: ExtractCodeBlocksInputs): DslNode<ExtractCodeBlocksOutputs, "output"> {
  return createNode("lib.markdown.ExtractCodeBlocks", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Tables — lib.markdown.ExtractTables
export interface ExtractTablesInputs {
  markdown?: Connectable<string>;
}

export interface ExtractTablesOutputs {
  output: DataframeRef;
}

export function extractTables(inputs: ExtractTablesInputs): DslNode<ExtractTablesOutputs, "output"> {
  return createNode("lib.markdown.ExtractTables", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
