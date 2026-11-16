/**
 * Two rules every save of a cloud workflow or timeline follows, whichever
 * route it arrives on.
 *
 * Editing instance. A client draws an id each time it opens a document and
 * sends it with every save. When an accepted save comes from another instance
 * than the one that wrote the stored revision, the stored revision is kept as
 * a version first, so a save that replaces someone else's work can always be
 * undone (TC8). A save without an id counts as a new instance. The version is
 * written before the document, and a failure to write it refuses the save.
 *
 * Schema version. A save names the document schema version it was written in,
 * or is taken to be in the version this server writes. A save in a lower
 * version than the stored document is refused with `SCHEMA_DOWNGRADE`, so an
 * older client cannot replace a document with a reduced copy (TC14).
 */
import {
  TimelineSequenceVersion,
  WorkflowVersion,
  type TimelineSequence,
  type Workflow
} from "@nodetool-ai/models";
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

/** The description of a version kept before another instance's save. */
export const KEPT_REVISION_LABEL = "Kept before a save from another editor";

/**
 * The schema version a save is written in, after checking it against the
 * stored document and against what this server writes.
 */
export function acceptedSchemaVersion(
  kind: sync.SyncDocumentKind,
  stored: number,
  requested: number | undefined
): number {
  const current = sync.DOCUMENT_SCHEMA_VERSIONS[kind];
  const written = requested ?? current;
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
 * Whether a save replaces a revision another editing instance wrote. Only a
 * save that will be applied to the stored revision counts: one whose base is
 * stale is refused by the compare-and-swap anyway.
 */
export function replacesAnotherWriter(
  stored: { last_writer_instance: string | null; updated_at: string },
  save: { instance: string | undefined; base: string | undefined }
): boolean {
  if (save.base !== undefined && save.base !== stored.updated_at) {
    return false;
  }
  return (
    save.instance === undefined || save.instance !== stored.last_writer_instance
  );
}

/** Keep the stored revision of a workflow as a version. */
export async function keepWorkflowRevision(workflow: Workflow): Promise<void> {
  await WorkflowVersion.create({
    workflow_id: workflow.id,
    user_id: workflow.user_id,
    graph: workflow.graph,
    version: await WorkflowVersion.nextVersion(workflow.id),
    // A checkpoint is never pruned with the autosaves.
    save_type: "checkpoint",
    name: workflow.name,
    description: KEPT_REVISION_LABEL
  });
}

/** Keep the stored revision of a timeline as a version. */
export async function keepTimelineRevision(
  sequence: TimelineSequence
): Promise<void> {
  // A manual version is never pruned with the autosaves.
  await TimelineSequenceVersion.snapshot(sequence, {
    saveType: "manual",
    name: KEPT_REVISION_LABEL
  });
}

export function isDocumentSaveRefusal(
  error: unknown
): error is DocumentSaveRefusal {
  return error instanceof DocumentSaveRefusal;
}
