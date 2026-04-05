// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Load Document File — nodetool.document.LoadDocumentFile
export interface LoadDocumentFileInputs {
  path?: Connectable<string>;
}

export interface LoadDocumentFileOutputs {
  output: unknown;
}

export function loadDocumentFile(
  inputs: LoadDocumentFileInputs
): DslNode<LoadDocumentFileOutputs, "output"> {
  return createNode(
    "nodetool.document.LoadDocumentFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Save Document File — nodetool.document.SaveDocumentFile
export interface SaveDocumentFileInputs {
  document?: Connectable<unknown>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export interface SaveDocumentFileOutputs {}

export function saveDocumentFile(
  inputs: SaveDocumentFileInputs
): DslNode<SaveDocumentFileOutputs> {
  return createNode(
    "nodetool.document.SaveDocumentFile",
    inputs as Record<string, unknown>,
    { outputNames: [] }
  );
}

// List Documents — nodetool.document.ListDocuments
export interface ListDocumentsInputs {
  folder?: Connectable<string>;
  pattern?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export interface ListDocumentsOutputs {
  document: unknown;
}

export function listDocuments(
  inputs: ListDocumentsInputs
): DslNode<ListDocumentsOutputs, "document"> {
  return createNode(
    "nodetool.document.ListDocuments",
    inputs as Record<string, unknown>,
    { outputNames: ["document"], defaultOutput: "document", streaming: true }
  );
}

// Split Document — nodetool.document.SplitDocument
export interface SplitDocumentInputs {
  embed_model?: Connectable<unknown>;
  document?: Connectable<unknown>;
  buffer_size?: Connectable<number>;
  threshold?: Connectable<number>;
}

export interface SplitDocumentOutputs {
  text: string;
  source_id: string;
  start_index: number;
}

export function splitDocument(
  inputs: SplitDocumentInputs
): DslNode<SplitDocumentOutputs> {
  return createNode(
    "nodetool.document.SplitDocument",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "source_id", "start_index"], streaming: true }
  );
}

// Split HTML — nodetool.document.SplitHTML
export interface SplitHTMLInputs {
  document?: Connectable<unknown>;
}

export interface SplitHTMLOutputs {
  text: string;
  source_id: string;
  start_index: number;
}

export function splitHTML(inputs: SplitHTMLInputs): DslNode<SplitHTMLOutputs> {
  return createNode(
    "nodetool.document.SplitHTML",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "source_id", "start_index"], streaming: true }
  );
}

// Split JSON — nodetool.document.SplitJSON
export interface SplitJSONInputs {
  document?: Connectable<unknown>;
  include_metadata?: Connectable<boolean>;
  include_prev_next_rel?: Connectable<boolean>;
}

export interface SplitJSONOutputs {
  text: string;
  source_id: string;
  start_index: number;
}

export function splitJSON(inputs: SplitJSONInputs): DslNode<SplitJSONOutputs> {
  return createNode(
    "nodetool.document.SplitJSON",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "source_id", "start_index"], streaming: true }
  );
}

// Split Recursively — nodetool.document.SplitRecursively
export interface SplitRecursivelyInputs {
  document?: Connectable<unknown>;
  chunk_size?: Connectable<number>;
  chunk_overlap?: Connectable<number>;
  separators?: Connectable<string[]>;
}

export interface SplitRecursivelyOutputs {
  text: string;
  source_id: string;
  start_index: number;
}

export function splitRecursively(
  inputs: SplitRecursivelyInputs
): DslNode<SplitRecursivelyOutputs> {
  return createNode(
    "nodetool.document.SplitRecursively",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "source_id", "start_index"], streaming: true }
  );
}

// Split Markdown — nodetool.document.SplitMarkdown
export interface SplitMarkdownInputs {
  document?: Connectable<unknown>;
  headers_to_split_on?: Connectable<unknown[]>;
  strip_headers?: Connectable<boolean>;
  return_each_line?: Connectable<boolean>;
  chunk_size?: Connectable<number>;
  chunk_overlap?: Connectable<number>;
}

export interface SplitMarkdownOutputs {
  text: string;
  source_id: string;
  start_index: number;
}

export function splitMarkdown(
  inputs: SplitMarkdownInputs
): DslNode<SplitMarkdownOutputs> {
  return createNode(
    "nodetool.document.SplitMarkdown",
    inputs as Record<string, unknown>,
    { outputNames: ["text", "source_id", "start_index"], streaming: true }
  );
}
