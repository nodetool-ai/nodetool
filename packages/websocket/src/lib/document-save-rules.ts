/**
 * Two rules every save of a cloud workflow or timeline follows, whichever
 * route it arrives on.
 *
 * Editing instance. A client draws an id each time it opens a document and
 * sends it with every save. The writer of a revision is that id bound to the
 * account that saved it, so another account presenting the same id is still
 * another writer. When an accepted save comes from another writer than the
 * one that wrote the stored revision, the stored revision is kept as a
 * version in the same transaction as the save, so a save that replaces
 * someone else's work can always be undone (TC8). A save without an id
 * counts as a new writer. A restore always keeps the revision it replaces.
 *
 * Schema version. A save names the document schema version it was written
 * in. A save that names none is in the version this server writes when the
 * client sent the protocol header, and in the legacy version when it did
 * not: a client from before the header existed writes the first schema. A
 * save in a lower version than the stored document is refused with
 * `SCHEMA_DOWNGRADE`, so an older client cannot replace a document with a
 * reduced copy (TC14).
 */
import type { KeepRevision } from "@nodetool-ai/models";
import * as sync from "@nodetool-ai/protocol/api-schemas/sync.js";
import { ApiErrorCode } from "../error-codes.js";

/** A save that the rules refuse. Each route maps it to its own error type. */
export class DocumentSaveRefusal extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DocumentSaveRefusal";
  }
}

/** The description of a version kept before another writer's save. */
export const KEPT_REVISION_LABEL = "Kept before a save from another editor";

/** The version a workflow save keeps of another writer's revision. */
export const KEEP_WORKFLOW_REVISION: KeepRevision = {
  name: null,
  // A checkpoint is never pruned with the autosaves.
  saveType: "checkpoint",
  description: KEPT_REVISION_LABEL
};

/** The version a timeline save keeps of another writer's revision. */
export const KEEP_TIMELINE_REVISION: KeepRevision = {
  name: KEPT_REVISION_LABEL,
  // A manual version is never pruned with the autosaves.
  saveType: "manual"
};

/** The version a restore keeps of the revision it replaces. */
export function keepBeforeRestore(
  kind: sync.SyncDocumentKind,
  version: number
): KeepRevision {
  const label = `Before restore to v${version}`;
  return kind === "workflow"
    ? { name: null, saveType: "checkpoint", description: label }
    : { name: label, saveType: "restore" };
}

/**
 * The writer of a save: the editing instance bound to the account, or null
 * when the save names no instance.
 */
export function writerOf(
  userId: string,
  instance: string | undefined
): string | null {
  return instance === undefined ? null : `${userId}:${instance}`;
}

/**
 * The schema version a save is written in, after checking it against the
 * stored document and against what this server writes. `legacyClient` is
 * true for a request without the protocol header.
 */
export function acceptedSchemaVersion(
  kind: sync.SyncDocumentKind,
  stored: number,
  requested: number | undefined,
  legacyClient: boolean
): number {
  const current = sync.DOCUMENT_SCHEMA_VERSIONS[kind];
  const written =
    requested ??
    (legacyClient ? sync.LEGACY_DOCUMENT_SCHEMA_VERSION : current);
  if (written > current) {
    throw new DocumentSaveRefusal(
      ApiErrorCode.INVALID_INPUT,
      `This server writes ${kind} schema version ${current}, not ${written}`,
      400
    );
  }
  if (written < stored) {
    throw new DocumentSaveRefusal(
      ApiErrorCode.SCHEMA_DOWNGRADE,
      `This ${kind} was saved in schema version ${stored}, and the save is in version ${written}. Update the app to save it.`,
      409
    );
  }
  return written;
}

/**
 * The version to keep for a save, or undefined when it replaces its own
 * writer's revision. Only a save that will be applied to the stored revision
 * counts: one whose base is stale is refused by the compare-and-set anyway.
 */
export function revisionToKeep(
  kind: sync.SyncDocumentKind,
  stored: { last_writer_instance: string | null; updated_at: string },
  save: { writer: string | null; base: string | undefined }
): KeepRevision | undefined {
  if (save.base !== undefined && save.base !== stored.updated_at) {
    return undefined;
  }
  if (save.writer !== null && save.writer === stored.last_writer_instance) {
    return undefined;
  }
  return kind === "workflow" ? KEEP_WORKFLOW_REVISION : KEEP_TIMELINE_REVISION;
}

export function isDocumentSaveRefusal(
  error: unknown
): error is DocumentSaveRefusal {
  return error instanceof DocumentSaveRefusal;
}
