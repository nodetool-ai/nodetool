// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Load Document File — nodetool.document.LoadDocumentFile
export type LoadDocumentFileInputs = {
  path?: Connectable<string>;
};

export interface LoadDocumentFileOutputs {
  output: unknown;
}

export function loadDocumentFile(inputs: LoadDocumentFileInputs, options?: NodeOptions): NodeWithOutputs<LoadDocumentFileOutputs, "output"> {
  return createNode("nodetool.document.LoadDocumentFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"document"}, defaultOutput: "output" });
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

export function saveDocumentFile(inputs: SaveDocumentFileInputs, options?: NodeOptions): NodeWithOutputs<SaveDocumentFileOutputs> {
  return createNode("nodetool.document.SaveDocumentFile", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
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

export function listDocuments(inputs: ListDocumentsInputs, options?: NodeOptions): NodeWithOutputs<ListDocumentsOutputs> {
  return createNode("nodetool.document.ListDocuments", inputs, { id: options?.id, outputNames: ["document", "documents"], outputTypes: {"document":"document","documents":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"document":{"kind":"iteration","source":"__execution__","group":"items"},"documents":{"kind":"single","source":"__execution__"}} });
}
