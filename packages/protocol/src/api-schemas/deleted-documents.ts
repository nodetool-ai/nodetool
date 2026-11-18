import { z } from "zod";

// Deleted documents and projects kept for their restore period
// (docs/plans/native-cloud-sync/technical-design.md, "Deletion, restore and
// storage", PRD D4). Only the owner lists, restores or ends the period.

export const deletedDocumentKind = z.enum(["workflow", "timeline", "project"]);
export type DeletedDocumentKind = z.infer<typeof deletedDocumentKind>;

export const deletedDocumentRef = z.object({
  kind: deletedDocumentKind,
  document_id: z.string().min(1).max(256)
});
export type DeletedDocumentRef = z.infer<typeof deletedDocumentRef>;

export const deletedDocumentResponse = z.object({
  kind: z.string(),
  document_id: z.string(),
  project_id: z.string().nullable(),
  name: z.string(),
  deleted_at: z.string(),
  /** After this time the document is gone and cannot be restored. */
  purge_at: z.string()
});
export type DeletedDocumentResponse = z.infer<typeof deletedDocumentResponse>;

// ── list ──────────────────────────────────────────────────────────
export const listDeletedInput = z.object({
  project_id: z.string().min(1).max(256).optional()
});
export const listDeletedOutput = z.object({
  documents: z.array(deletedDocumentResponse)
});

// ── restore ───────────────────────────────────────────────────────
export const restoreDeletedOutput = z.object({ restored: z.literal(true) });

// ── endRestorePeriod ──────────────────────────────────────────────
export const endRestorePeriodOutput = z.object({ ended: z.literal(true) });
