import { z } from "zod";
import { transferDocumentKind } from "./transfer.js";

// Receiving from a cloud project (docs/plans/native-cloud-sync/
// technical-design.md, "Receiving: revision set, stage, check, apply",
// WP2.5). The client captures a revision set, downloads each document and
// file the set names, and releases it. The bytes of a file come over REST,
// `GET /api/receive/:set_id/files/:hash`, which answers 410 with `ERASED`
// when an owner's action freed them.

const fullId = z.string().regex(/^[0-9a-f]{32}$/, "A full id is 32 lowercase hex characters");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "A hash is 64 lowercase hex characters");

// ── receive.capture ──────────────────────────────────────────────
/** A whole project, or one document of it. */
export const captureRevisionSetInput = z.union([
  z.object({ project_id: fullId }).strict(),
  z.object({ kind: transferDocumentKind, document_id: fullId }).strict()
]);
export type CaptureRevisionSetInput = z.infer<typeof captureRevisionSetInput>;

/** A file a captured revision needs. */
export const revisionSetFile = z.object({
  asset_id: fullId,
  hash: sha256,
  size: z.number().int().nonnegative()
});
export type RevisionSetFile = z.infer<typeof revisionSetFile>;

/** One document of a set, at the revision captured for it. */
export const revisionSetDocument = z.object({
  kind: transferDocumentKind,
  document_id: fullId,
  name: z.string(),
  /** The saved version that holds the captured content. */
  revision_id: fullId,
  /** The transfer hash of the captured payload, as `transfers` computes it. */
  content_hash: sha256,
  files: z.array(revisionSetFile),
  /** Files the revision names that the cloud holds no bytes for. */
  missing_files: z.array(fullId)
});
export type RevisionSetDocument = z.infer<typeof revisionSetDocument>;

export const captureRevisionSetOutput = z.object({
  set_id: fullId,
  project_id: fullId,
  expires_at: z.string(),
  documents: z.array(revisionSetDocument)
});
export type CaptureRevisionSetOutput = z.infer<typeof captureRevisionSetOutput>;

// ── receive.document ─────────────────────────────────────────────
export const receiveDocumentInput = z.object({
  set_id: fullId,
  kind: transferDocumentKind,
  document_id: fullId
});
export type ReceiveDocumentInput = z.infer<typeof receiveDocumentInput>;

export const receiveDocumentOutput = z.object({
  kind: transferDocumentKind,
  document_id: fullId,
  content_hash: sha256,
  /** The document as the kind's payload function reads it at the captured revision. */
  document: z.record(z.string(), z.unknown())
});
export type ReceiveDocumentOutput = z.infer<typeof receiveDocumentOutput>;

// ── receive.release ──────────────────────────────────────────────
export const releaseRevisionSetInput = z.object({ set_id: fullId });
export const releaseRevisionSetOutput = z.object({ released: z.literal(true) });
export type ReleaseRevisionSetOutput = z.infer<typeof releaseRevisionSetOutput>;
