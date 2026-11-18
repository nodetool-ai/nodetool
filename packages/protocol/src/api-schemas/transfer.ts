import { z } from "zod";

// Transfers into a cloud project (docs/plans/native-cloud-sync/
// technical-design.md, "Sending: capture, stage, commit attempt" and
// "Operations of a transfer", WP2.4).
//
// A transfer is opened with its manifest, its files are staged, and a commit
// attempt carries the manifest again with the decisions, the missing-file
// manifest and the document payloads. An operation outside this vocabulary
// is refused by schema.

const fullId = z.string().regex(/^[0-9a-f]{32}$/, "A full id is 32 lowercase hex characters");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "A hash is 64 lowercase hex characters");

/** Whole-document kinds a transfer carries. */
export const transferDocumentKind = z.enum(["workflow", "timeline"]);
export type TransferDocumentKind = z.infer<typeof transferDocumentKind>;

const documentRef = z.object({ kind: transferDocumentKind, document_id: fullId });
export type TransferDocumentRef = z.infer<typeof documentRef>;

export const transferOperation = z.discriminatedUnion("op", [
  /** A document the cloud does not hold yet, under the local id. */
  z.object({
    op: z.literal("create_document"),
    kind: transferDocumentKind,
    document_id: fullId,
    captured_hash: sha256
  }),
  /** Replace the cloud document whose content hashed to `base_hash`. */
  z.object({
    op: z.literal("replace_document"),
    kind: transferDocumentKind,
    document_id: fullId,
    base_hash: sha256,
    captured_hash: sha256
  }),
  z.object({
    op: z.literal("rename_document"),
    kind: transferDocumentKind,
    document_id: fullId,
    base_name: z.string().max(1024),
    name: z.string().min(1).max(1024)
  }),
  /**
   * Keep both: the local document is created under `new_document_id`, and the
   * cloud document stays as it is. A Keep local decision must name the
   * stored hash of `document_id`.
   */
  z.object({
    op: z.literal("keep_both"),
    kind: transferDocumentKind,
    document_id: fullId,
    new_document_id: fullId,
    captured_hash: sha256
  }),
  /** Saved versions the cloud lacks. Each one's content is in `versions` of the attempt. */
  z.object({
    op: z.literal("add_versions"),
    kind: transferDocumentKind,
    document_id: fullId,
    versions: z.array(z.object({ version_id: fullId, hash: sha256 })).min(1).max(10_000)
  }),
  /** Move the document from `base_project_id`, the transfer's project, to another project. */
  z.object({
    op: z.literal("move_document"),
    kind: transferDocumentKind,
    document_id: fullId,
    base_project_id: fullId,
    target_project_id: fullId
  }),
  /** Confirmed in the deletion review. The document keeps its restore period. */
  z.object({
    op: z.literal("delete_document"),
    kind: transferDocumentKind,
    document_id: fullId,
    base_hash: sha256,
    confirmed: z.literal(true)
  })
]);
export type TransferOperation = z.infer<typeof transferOperation>;

/**
 * A path relative to the project folder. It names a file inside the folder,
 * never `.nodetool/`, which NodeTool keeps for itself.
 */
export const workspacePath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) => {
      const segments = path.split("/");
      return (
        !path.includes("\\") &&
        segments.every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
        segments[0] !== ".nodetool"
      );
    },
    { message: "A path is relative to the project folder, without empty, '.' or '..' segments, and outside .nodetool/" }
  );

/**
 * A file of the project folder. The bytes are staged under `hash` like a
 * required file. A put whose base is not what the cloud holds keeps both:
 * the sent file goes beside the cloud one, and the commit result lists it.
 */
export const transferFileOperation = z.discriminatedUnion("op", [
  /** An asset's file, by the asset id. A null base creates the asset. */
  z.object({
    op: z.literal("put_asset_file"),
    asset_id: fullId,
    path: workspacePath,
    hash: sha256,
    size: z.number().int().nonnegative(),
    base_hash: sha256.nullable(),
    name: z.string().min(1).max(1024),
    content_type: z.string().min(1).max(255)
  }),
  /** A file of the folder that no asset names. A null base expects no file at the path. */
  z.object({
    op: z.literal("put_workspace_file"),
    path: workspacePath,
    hash: sha256,
    size: z.number().int().nonnegative(),
    base_hash: sha256.nullable()
  }),
  /** Confirmed in the deletion review. Only the project's owner deletes a file. */
  z.object({
    op: z.literal("delete_workspace_file"),
    path: workspacePath,
    base_hash: sha256
  })
]);
export type TransferFileOperation = z.infer<typeof transferFileOperation>;

/** A file a transferred document refers to, by its asset id and content. */
export const transferRequiredFile = z.object({
  asset_id: fullId,
  hash: sha256,
  size: z.number().int().nonnegative(),
  documents: z.array(documentRef).max(10_000)
});
export type TransferRequiredFile = z.infer<typeof transferRequiredFile>;

export const transferManifest = z.object({
  /** The name of the project, for a first publication. */
  project_name: z.string().min(1).max(1024).optional(),
  operations: z.array(transferOperation).max(10_000),
  required_files: z.array(transferRequiredFile).max(100_000),
  file_operations: z.array(transferFileOperation).max(100_000).optional(),
  /** The sending device's name, for the name of a file kept beside another. */
  device_name: z.string().min(1).max(255).optional(),
  /** Conversations to add, which the person turned on in the review. Off by default. */
  conversations: z
    .array(z.object({ thread_id: z.string().min(1).max(128), captured_hash: sha256 }))
    .max(10_000)
    .optional()
});
export type TransferManifest = z.infer<typeof transferManifest>;

/**
 * Keep local over a cloud revision the person reviewed. It covers a base
 * mismatch only when it names exactly the stored hash.
 */
export const transferDecision = z.object({
  kind: transferDocumentKind,
  document_id: fullId,
  choice: z.literal("keep_local"),
  cloud_hash: sha256
});
export type TransferDecision = z.infer<typeof transferDecision>;

/** A required file the person confirmed as missing (X7). */
export const transferMissingFile = z.object({
  asset_id: fullId,
  hash: sha256.optional(),
  size: z.number().int().nonnegative().optional(),
  reason: z.enum(["missing_locally", "too_large", "over_allowance"]),
  documents: z.array(documentRef).max(10_000)
});
export type TransferMissingFile = z.infer<typeof transferMissingFile>;

export const transferPayload = z.object({
  kind: transferDocumentKind,
  document_id: fullId,
  /** The document as the kind's payload function captured it. */
  document: z.record(z.string(), z.unknown())
});
export type TransferPayload = z.infer<typeof transferPayload>;

/** The content of one saved version, as the kind's version payload function captured it. */
export const transferVersionPayload = z.object({
  kind: transferDocumentKind,
  document_id: fullId,
  version_id: fullId,
  version: z.record(z.string(), z.unknown())
});
export type TransferVersionPayload = z.infer<typeof transferVersionPayload>;

/** One message of a transferred conversation. Its id is kept when it is free. */
export const transferConversationMessage = z.object({
  id: z.string().min(1).max(128),
  role: z.string().min(1).max(64),
  name: z.string().nullable().optional(),
  content: z.unknown().optional(),
  tool_calls: z.array(z.unknown()).nullable().optional(),
  tool_call_id: z.string().nullable().optional(),
  input_files: z.array(z.unknown()).nullable().optional(),
  output_files: z.array(z.unknown()).nullable().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  created_at: z.string().min(1).max(64)
});
export type TransferConversationMessage = z.infer<typeof transferConversationMessage>;

/**
 * A conversation as the sending device holds it. Its captured hash is the
 * identity hash of `{ title, kind, messages }`.
 */
export const transferConversationPayload = z.object({
  thread_id: z.string().min(1).max(128),
  title: z.string().max(1024),
  kind: z.string().min(1).max(64),
  messages: z.array(transferConversationMessage).max(100_000)
});
export type TransferConversationPayload = z.infer<typeof transferConversationPayload>;

// ── transfer.open ────────────────────────────────────────────────
export const openTransferInput = z.object({
  transfer_id: fullId,
  /** The cloud project, or for a first publication the id it will get. */
  project_id: fullId,
  first_publication: z.boolean(),
  manifest: transferManifest
});
export const openTransferOutput = z.object({
  /** Hashes whose bytes the client must stage. The rest are staged already. */
  needed_hashes: z.array(sha256),
  allowance_bytes: z.number().nullable(),
  used_bytes: z.number()
});
export type OpenTransferOutput = z.infer<typeof openTransferOutput>;

// ── transfer.commit ──────────────────────────────────────────────
export const commitTransferInput = z.object({
  transfer_id: fullId,
  attempt_id: fullId,
  manifest: transferManifest,
  decisions: z.array(transferDecision).max(10_000),
  missing_files: z.array(transferMissingFile).max(100_000),
  payloads: z.array(transferPayload).max(10_000),
  versions: z.array(transferVersionPayload).max(10_000).optional(),
  conversations: z.array(transferConversationPayload).max(10_000).optional()
});
export type CommitTransferInput = z.infer<typeof commitTransferInput>;

export const transferRefusalCode = z.enum([
  "ALREADY_COMMITTED",
  "TRANSFER_CANCELLED",
  "PAYLOAD_HASH_MISMATCH",
  "PAYLOAD_MISSING",
  "PAYLOAD_INVALID",
  "MANIFEST_INCOMPLETE",
  "PROJECT_NOT_FOUND",
  "PROJECT_EXISTS",
  "OWNER_REQUIRED",
  "EDITOR_REQUIRED",
  "STORAGE_EXCEEDED",
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_EXISTS",
  "DOCUMENT_NOT_IN_PROJECT",
  "DOCUMENT_DELETED",
  "ACCESS_REMOVED",
  "FILE_NOT_READABLE",
  "FILE_NOT_STAGED",
  "BASE_CHANGED",
  "DECISION_REQUIRED",
  "VERSION_CONFLICT",
  "PROJECT_EDITOR_REQUIRED"
]);
export type TransferRefusalCode = z.infer<typeof transferRefusalCode>;

export const transferFailure = z.object({
  code: transferRefusalCode,
  kind: transferDocumentKind.optional(),
  document_id: z.string().optional(),
  asset_id: z.string().optional(),
  hash: z.string().optional(),
  version_id: z.string().optional(),
  project_id: z.string().optional(),
  path: z.string().optional(),
  thread_id: z.string().optional(),
  /** For BASE_CHANGED: the stored hash a Keep local decision must name. */
  stored_hash: z.string().optional(),
  message: z.string()
});
export type TransferFailure = z.infer<typeof transferFailure>;

export const transferAttemptResult = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("committed"),
    project_id: z.string(),
    /** The stored content hash of each document the attempt wrote. */
    documents: z.array(z.object({ kind: transferDocumentKind, document_id: z.string(), hash: z.string() })),
    /**
     * Files sent over a cloud file that changed since their base. The cloud
     * file stays at `path` and the sent one went to `kept_path`, as a new
     * asset `kept_asset_id` for an asset file.
     */
    kept_beside: z
      .array(
        z.object({
          path: z.string(),
          kept_path: z.string(),
          asset_id: z.string().optional(),
          kept_asset_id: z.string().optional()
        })
      )
      .optional(),
    /** The cloud thread of each conversation the manifest named. */
    conversations: z.array(z.object({ source_thread_id: z.string(), thread_id: z.string() })).optional()
  }),
  z.object({ outcome: z.literal("refused"), failures: z.array(transferFailure) })
]);
export type TransferAttemptResult = z.infer<typeof transferAttemptResult>;

/** The digest of an attempt differs from the one recorded under its id. */
export const ATTEMPT_CONTENT_MISMATCH = "ATTEMPT_CONTENT_MISMATCH";

// ── transfer.status ──────────────────────────────────────────────
export const transferIdInput = z.object({ transfer_id: fullId });
export const transferStatusOutput = z.object({
  state: z.enum(["open", "committed", "cancelled"]),
  project_id: z.string(),
  attempts: z.array(z.object({ attempt_id: z.string(), result: transferAttemptResult }))
});
export type TransferStatusOutput = z.infer<typeof transferStatusOutput>;

// ── transfer.cancel ──────────────────────────────────────────────
export const cancelTransferOutput = z.discriminatedUnion("state", [
  z.object({ state: z.literal("cancelled") }),
  z.object({ state: z.literal("committed"), result: transferAttemptResult })
]);
export type CancelTransferOutput = z.infer<typeof cancelTransferOutput>;
