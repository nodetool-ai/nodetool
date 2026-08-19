// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Load Document File — nodetool.document.LoadDocumentFile
export type LoadDocumentFileInputs = {
  path?: string;
};

export interface LoadDocumentFileOutputs {
  output: unknown;
}

export function loadDocumentFile(inputs: LoadDocumentFileInputs): Promise<LoadDocumentFileOutputs> {
  return callNode<LoadDocumentFileOutputs>("nodetool.document.LoadDocumentFile", inputs);
}

// Save Document File — nodetool.document.SaveDocumentFile
export type SaveDocumentFileInputs = {
  document?: unknown;
  save_to_workspace?: boolean;
  folder?: string;
  filename?: string;
};

export interface SaveDocumentFileOutputs {
}

export function saveDocumentFile(inputs: SaveDocumentFileInputs): Promise<SaveDocumentFileOutputs> {
  return callNode<SaveDocumentFileOutputs>("nodetool.document.SaveDocumentFile", inputs);
}

// List Documents — nodetool.document.ListDocuments
export type ListDocumentsInputs = {
  folder?: string;
  pattern?: string;
  recursive?: boolean;
};

export interface ListDocumentsOutputs {
  document: unknown;
  documents: unknown[];
}

export function listDocuments(inputs: ListDocumentsInputs): Promise<ListDocumentsOutputs> {
  return callNode<ListDocumentsOutputs>("nodetool.document.ListDocuments", inputs);
}

listDocuments.stream = function (inputs: ListDocumentsInputs): AsyncIterable<Partial<ListDocumentsOutputs>> {
  return streamNode<Partial<ListDocumentsOutputs>>("nodetool.document.ListDocuments", inputs);
};
