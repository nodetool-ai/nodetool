// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Load Document File — nodetool.document.LoadDocumentFile
export interface LoadDocumentFileInputs {
  path?: Connectable<string>;
}

export interface LoadDocumentFileOutputs {
  output: unknown;
}

export function loadDocumentFile(inputs: LoadDocumentFileInputs): DslNode<LoadDocumentFileOutputs, "output"> {
  return createNode("nodetool.document.LoadDocumentFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Document File — nodetool.document.SaveDocumentFile
export interface SaveDocumentFileInputs {
  document?: Connectable<unknown>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
}

export interface SaveDocumentFileOutputs {
}

export function saveDocumentFile(inputs: SaveDocumentFileInputs): DslNode<SaveDocumentFileOutputs> {
  return createNode("nodetool.document.SaveDocumentFile", inputs as Record<string, unknown>, { outputNames: [] });
}

// List Documents — nodetool.document.ListDocuments
export interface ListDocumentsInputs {
  folder?: Connectable<string>;
  pattern?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export interface ListDocumentsOutputs {
  document: unknown;
  documents: unknown[];
}

export function listDocuments(inputs: ListDocumentsInputs): DslNode<ListDocumentsOutputs> {
  return createNode("nodetool.document.ListDocuments", inputs as Record<string, unknown>, { outputNames: ["document", "documents"], streaming: true });
}
