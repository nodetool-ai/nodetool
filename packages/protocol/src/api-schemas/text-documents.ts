import { z } from "zod";

// Stored versions of Markdown documents (docs/document-editor/prd.md, R11).
// A version is a complete copy of the document's Markdown.

export const textDocumentSaveType = z.enum([
  "agent_turn",
  "workflow_run",
  "manual",
  "autosave",
  "restore"
]);
export type TextDocumentSaveTypeValue = z.infer<typeof textDocumentSaveType>;

export const textDocumentVersionResponse = z.object({
  version: z.number().int(),
  name: z.string().nullable(),
  save_type: z.string(),
  cause_id: z.string().nullable(),
  created_at: z.string(),
  content_hash: z.string()
});
export type TextDocumentVersionResponse = z.infer<typeof textDocumentVersionResponse>;

export const textDocumentRef = z.object({
  asset_id: z.string().min(1).max(256)
});

export const listTextDocumentVersionsOutput = z.object({
  versions: z.array(textDocumentVersionResponse)
});

export const getTextDocumentVersionInput = textDocumentRef.extend({
  version: z.number().int().min(1)
});
export const getTextDocumentVersionOutput = textDocumentVersionResponse.extend({
  content: z.string()
});

export const createTextDocumentVersionInput = textDocumentRef.extend({
  /** `manual` for "Save version", `autosave` for the editor's interval versions. */
  save_type: z.enum(["manual", "autosave"]).default("manual"),
  name: z.string().max(200).optional()
});
export const createTextDocumentVersionOutput = z.object({
  /** Null when the content equals the newest version and nothing was stored. */
  version: textDocumentVersionResponse.nullable()
});

export const restoreTextDocumentVersionInput = getTextDocumentVersionInput;
export const restoreTextDocumentVersionOutput = z.object({
  restored_version: z.number().int(),
  updated_at: z.string()
});

/** The workflows that reference a document (PRD R15). */
export const textDocumentReferencesOutput = z.object({
  workflows: z.array(
    z.object({
      workflow_id: z.string(),
      name: z.string(),
      node_ids: z.array(z.string())
    })
  )
});
export type TextDocumentReferencesOutput = z.infer<typeof textDocumentReferencesOutput>;

/** A file in the project folder, as an import or export returns it. */
export const textDocumentFileOutput = z.object({
  asset_id: z.string(),
  name: z.string(),
  path: z.string().nullable()
});
export type TextDocumentFileOutput = z.infer<typeof textDocumentFileOutput>;

/** Import a .md, .txt, .html, .docx or .pdf file as a new document (PRD R17). */
export const importTextDocumentInput = z.object({
  /** The source file's asset id. */
  asset_id: z.string().min(1),
  name: z.string().optional()
});

/** Export a document as a file next to it (PRD R18). */
export const exportTextDocumentInput = textDocumentRef.extend({
  format: z.enum(["pdf", "html"])
});

/** Import a Google Doc as a new document (PRD R19). */
export const importGoogleDocInput = z.object({
  /** The Google Doc's id or its docs.google.com URL. */
  document: z.string().min(1),
  project_id: z.string().nullable(),
  directory: z.string().optional()
});

/** Export a document to a new Google Doc (PRD R19). */
export const exportGoogleDocInput = textDocumentRef.extend({
  title: z.string().optional()
});
export const exportGoogleDocOutput = z.object({
  document_id: z.string(),
  name: z.string(),
  url: z.string().nullable()
});
export type ExportGoogleDocOutput = z.infer<typeof exportGoogleDocOutput>;
