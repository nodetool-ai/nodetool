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

// Save Document — nodetool.document.SaveDocument
export type SaveDocumentInputs = {
  document?: unknown;
  text?: string;
  target?: unknown;
  mode?: "replace" | "append";
  save_to_workspace?: boolean;
  folder?: string;
  filename?: string;
  overwrite?: boolean;
};

export interface SaveDocumentOutputs {
  output: unknown;
  path: string;
}

export function saveDocument(inputs: SaveDocumentInputs): Promise<SaveDocumentOutputs> {
  return callNode<SaveDocumentOutputs>("nodetool.document.SaveDocument", inputs);
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
