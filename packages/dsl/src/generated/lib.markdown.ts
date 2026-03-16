// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { DataframeRef } from "../types.js";

// Extract Links — lib.markdown.ExtractLinks
export interface ExtractLinksInputs {
  markdown?: Connectable<string>;
  include_titles?: Connectable<boolean>;
}

export function extractLinks(inputs: ExtractLinksInputs): DslNode<SingleOutput<Record<string, string>[]>> {
  return createNode("lib.markdown.ExtractLinks", inputs as Record<string, unknown>);
}

// Extract Headers — lib.markdown.ExtractHeaders
export interface ExtractHeadersInputs {
  markdown?: Connectable<string>;
  max_level?: Connectable<number>;
}

export function extractHeaders(inputs: ExtractHeadersInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.markdown.ExtractHeaders", inputs as Record<string, unknown>);
}

// Extract Bullet Lists — lib.markdown.ExtractBulletLists
export interface ExtractBulletListsInputs {
  markdown?: Connectable<string>;
}

export function extractBulletLists(inputs: ExtractBulletListsInputs): DslNode<SingleOutput<Record<string, unknown>[]>> {
  return createNode("lib.markdown.ExtractBulletLists", inputs as Record<string, unknown>);
}

// Extract Numbered Lists — lib.markdown.ExtractNumberedLists
export interface ExtractNumberedListsInputs {
  markdown?: Connectable<string>;
}

export function extractNumberedLists(inputs: ExtractNumberedListsInputs): DslNode<SingleOutput<string[]>> {
  return createNode("lib.markdown.ExtractNumberedLists", inputs as Record<string, unknown>);
}

// Extract Code Blocks — lib.markdown.ExtractCodeBlocks
export interface ExtractCodeBlocksInputs {
  markdown?: Connectable<string>;
}

export function extractCodeBlocks(inputs: ExtractCodeBlocksInputs): DslNode<SingleOutput<Record<string, string>[]>> {
  return createNode("lib.markdown.ExtractCodeBlocks", inputs as Record<string, unknown>);
}

// Extract Tables — lib.markdown.ExtractTables
export interface ExtractTablesInputs {
  markdown?: Connectable<string>;
}

export function extractTables(inputs: ExtractTablesInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("lib.markdown.ExtractTables", inputs as Record<string, unknown>);
}
