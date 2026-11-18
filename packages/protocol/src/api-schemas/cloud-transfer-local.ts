import { z } from "zod";
import { revisionSetFile } from "./receive.js";
import {
  transferAttemptResult,
  transferDecision,
  transferDocumentKind,
  transferFailure,
  transferFileOperation,
  transferMissingFile,
  transferOperation
} from "./transfer.js";

// The transfer client of the server bundled with a native app
// (docs/plans/native-cloud-sync/technical-design.md, K9, WP2.7). The app
// names the cloud server origin and account, and hands the short-lived access
// token for the calls that reach the cloud (SR3). The local server derives the
// server key from the origin, so a send or receive captured for one server is
// never continued with another server's token.

const fullId = z.string().regex(/^[0-9a-f]{32}$/, "A full id is 32 lowercase hex characters");

/** The cloud server and account a call acts for. */
export const cloudTransferAccount = z.object({
  /** The cloud server origin, such as `https://api.nodetool.ai`, with no path. */
  origin: z.string().min(1).max(512),
  account_id: z.string().min(1).max(256)
});
export type CloudTransferAccount = z.infer<typeof cloudTransferAccount>;

/** An account plus the access token for the calls that reach the cloud. */
export const cloudTransferSession = cloudTransferAccount.extend({
  access_token: z.string().min(1).max(4096)
});
export type CloudTransferSession = z.infer<typeof cloudTransferSession>;

// ── send.capture ─────────────────────────────────────────────────
export const captureSendInput = cloudTransferAccount.extend({
  project_id: fullId,
  /** The name a first publication gives the cloud project. */
  project_name: z.string().min(1).max(512).optional(),
  device_name: z.string().min(1).max(256).optional()
});

export const capturedSend = z.object({
  status: z.literal("captured"),
  transfer_id: z.string(),
  first_publication: z.boolean(),
  operations: z.array(transferOperation),
  /** The captured documents, so the sheet names the document of each operation. */
  documents: z.array(z.object({ kind: transferDocumentKind, local_id: z.string(), cloud_id: z.string(), name: z.string() })),
  /** Files the send puts, also for documents it leaves unchanged (review F33). */
  file_operations: z.array(transferFileOperation),
  missing_files: z.array(transferMissingFile),
  /** Documents sent from their rows because their files are gone from the folder (CF3, review F37). */
  missing_document_files: z.array(z.object({ kind: transferDocumentKind, id: z.string(), name: z.string() })),
  skipped: z.array(
    z.object({
      kind: transferDocumentKind,
      id: z.string(),
      name: z.string(),
      reason: z.literal("invalid_file"),
      detail: z.string()
    })
  ),
  deleted_locally: z.array(
    z.object({ kind: transferDocumentKind, local_id: z.string(), cloud_id: z.string(), base_hash: z.string() })
  )
});

/**
 * The capture did not start: these assets have a file outside the project
 * folder, which the Collect step must copy in first (CF6).
 */
export const captureSendOutput = z.discriminatedUnion("status", [
  capturedSend,
  z.object({ status: z.literal("collect_first"), external: z.array(z.string()), message: z.string() })
]);
export type CaptureSendOutput = z.infer<typeof captureSendOutput>;

// ── send.run ─────────────────────────────────────────────────────
export const runSendInput = cloudTransferSession.extend({
  transfer_id: fullId,
  decisions: z.array(transferDecision).max(10_000).optional(),
  /**
   * Documents the deletion review confirmed for deletion on the cloud, each
   * with the cloud hash the review showed. That hash is the delete's
   * precondition (V4, review F40).
   */
  confirm_deletes: z
    .array(z.object({ kind: transferDocumentKind, cloud_id: fullId, cloud_hash: z.string().regex(/^[0-9a-f]{64}$/) }))
    .max(10_000)
    .optional(),
  /** The missing files the review confirmed, exactly as the capture listed them (X7, review F36). */
  confirm_missing_files: z.array(transferMissingFile).max(100_000).optional()
});

export const runSendOutput = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("committed"),
    transfer_id: z.string(),
    result: transferAttemptResult
  }),
  z.object({ status: z.literal("refused"), transfer_id: z.string(), failures: z.array(transferFailure) }),
  /** The send lists missing files the review did not confirm. Nothing was sent (review F36). */
  z.object({
    status: z.literal("missing_files_unconfirmed"),
    transfer_id: z.string(),
    missing_files: z.array(transferMissingFile)
  })
]);
export type RunSendOutput = z.infer<typeof runSendOutput>;

// ── send.cancel ──────────────────────────────────────────────────
export const cancelSendInput = cloudTransferSession.extend({ transfer_id: fullId });
export const cancelSendOutput = z.object({ state: z.enum(["cancelled", "committed"]) });

// ── receive.capture ──────────────────────────────────────────────
export const receiveDocumentStatus = z.enum([
  "new",
  "same",
  "cloud_changed",
  "local_changed",
  "both_changed",
  "local_deleted"
]);
export const receiveDecision = z.enum(["receive", "keep_local"]);

export const captureReceiveInput = cloudTransferSession.extend({ project_id: fullId });

/** A document of a receive's review. */
export const receiveReviewDocument = z.object({
  kind: transferDocumentKind,
  cloud_id: z.string(),
  local_id: z.string(),
  name: z.string(),
  /**
   * The content hash of the cloud revision the sheet shows. A send that
   * the cloud refuses with this stored hash was reviewed already.
   */
  content_hash: z.string(),
  /**
   * The hash of this computer's copy when the set was captured, or null
   * when it has none. A receive the person approved for other hashes asks
   * again (review F46).
   */
  local_hash: z.string().nullable(),
  status: receiveDocumentStatus,
  /**
   * Files of the document whose cloud bytes this folder does not hold. A
   * document whose own content is the same still has work when this is
   * above 0 (reviews F33, F51).
   */
  changed_files: z.number().int().nonnegative(),
  /** The decision taken without the person, or null when the review sheet must ask. */
  decision: receiveDecision.nullable(),
  files: z.array(revisionSetFile),
  missing_files: z.array(z.string())
});

export const captureReceiveOutput = z.object({
  set_id: z.string(),
  documents: z.array(receiveReviewDocument)
});
export type CaptureReceiveOutput = z.infer<typeof captureReceiveOutput>;

// ── receive.run ──────────────────────────────────────────────────
export const runReceiveInput = cloudTransferSession.extend({
  set_id: fullId,
  decisions: z
    .array(z.object({ kind: transferDocumentKind, document_id: fullId, decision: receiveDecision }))
    .max(10_000)
    .optional()
});

const documentNamed = z.object({ kind: transferDocumentKind, id: z.string(), name: z.string() });

export const receiveResult = z.object({
  received: z.array(documentNamed),
  changed_during_receive: z.array(documentNamed),
  not_received: z.array(documentNamed.extend({ status: receiveDocumentStatus })),
  kept_beside: z.array(z.object({ asset_id: z.string(), path: z.string(), kept_path: z.string() })),
  missing_files: z.array(z.string()),
  file_kept: z.array(z.object({ kind: transferDocumentKind, id: z.string() }))
});

export const runReceiveOutput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("finished"), set_id: z.string(), result: receiveResult }),
  z.object({ status: z.literal("expired"), set_id: z.string() }),
  /**
   * The review must be shown again: a document changed here after the review
   * (Y3), or the cloud's set expired and a new one shows other content (Y7).
   * `set_id` is the set to review, which may be a new one, and `documents`
   * its review when the run produced it (reviews F31, F32).
   */
  z.object({
    status: z.literal("waiting_for_review"),
    set_id: z.string(),
    documents: z.array(receiveReviewDocument).optional()
  })
]);
export type RunReceiveOutput = z.infer<typeof runReceiveOutput>;

// ── receive.cancel ───────────────────────────────────────────────
/** Closes a receive's review: releases the set and clears the local receive (review F41). */
export const cancelReceiveInput = cloudTransferSession.extend({ set_id: fullId });
/** `applied`: the receive committed already, and a resume finishes placing its files. */
export const cancelReceiveOutput = z.object({ state: z.enum(["cancelled", "applied"]) });

// ── resume ───────────────────────────────────────────────────────
/** Continues every send and receive of this account that a restart interrupted. */
export const resumeTransfersInput = cloudTransferSession;
export const resumeTransfersOutput = z.object({
  sends: z.array(runSendOutput),
  receives: z.array(runReceiveOutput)
});
