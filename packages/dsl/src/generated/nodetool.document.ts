// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Load Document File — nodetool.document.LoadDocumentFile
export type LoadDocumentFileInputs = {
  path?: Connectable<string>;
};

export interface LoadDocumentFileOutputs {
  output: unknown;
}

export function loadDocumentFile(inputs: LoadDocumentFileInputs): DslNode<LoadDocumentFileOutputs, "output"> {
  return createNode("nodetool.document.LoadDocumentFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Document File — nodetool.document.SaveDocumentFile
export type SaveDocumentFileInputs = {
  document?: Connectable<unknown>;
  save_to_workspace?: Connectable<boolean>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
};

export interface SaveDocumentFileOutputs {
}

export function saveDocumentFile(inputs: SaveDocumentFileInputs): DslNode<SaveDocumentFileOutputs> {
  return createNode("nodetool.document.SaveDocumentFile", inputs, { outputNames: [] });
}

// List Documents — nodetool.document.ListDocuments
export type ListDocumentsInputs = {
  folder?: Connectable<string>;
  pattern?: Connectable<string>;
  recursive?: Connectable<boolean>;
};

export interface ListDocumentsOutputs {
  document: unknown;
  documents: unknown[];
}

export function listDocuments(inputs: ListDocumentsInputs): DslNode<ListDocumentsOutputs> {
  return createNode("nodetool.document.ListDocuments", inputs, { outputNames: ["document", "documents"], streaming: true });
}
