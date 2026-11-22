/**
 * The `trash` capability module — the caller's deleted workflows, timelines
 * and projects that are still inside their restore period.
 *
 * Both capabilities call `listDeletedDocuments` and `restoreDeletedDocument`
 * from `@nodetool-ai/models`, the functions the tRPC `deletedDocuments`
 * router calls, with the run's user id, so a run sees and restores only its
 * own user's rows. Ending a restore period early destroys the kept copy and
 * stays out of reach (see `sandbox-coverage.ts`).
 */

import { isFullResourceId, isShortResourceId } from "@nodetool-ai/protocol";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isNonBlankString } from "../utils/type-guards.js";
import {
  DELETED_DOCUMENT_KINDS,
  listDeletedDocumentsSpec,
  restoreDeletedDocumentSpec
} from "./trash.specs.js";

type DeletedKind = (typeof DELETED_DOCUMENT_KINDS)[number];

const isDeletedKind = (value: unknown): value is DeletedKind =>
  typeof value === "string" &&
  (DELETED_DOCUMENT_KINDS as readonly string[]).includes(value);

const listDeletedDocuments: CapabilityExport = {
  spec: listDeletedDocumentsSpec,
  impl: async (run, params) => {
    const models = await import("@nodetool-ai/models");
    const projectId = params["project_id"];
    const rows = await models.listDeletedDocuments(
      userIdOf(run.context),
      isNonBlankString(projectId) ? { projectId: projectId.trim() } : {}
    );
    return {
      documents: rows.map((row) => ({
        kind: row.kind,
        document_id: row.documentId,
        project_id: row.projectId,
        name: row.name,
        deleted_at: row.deletedAt,
        purge_at: row.purgeAt
      }))
    };
  }
};

/**
 * The full id a model's `document_id` names. Results reach the model with
 * ids shortened to 12 characters, so a short id resolves against the
 * caller's own restorable rows of that kind, and only when exactly one
 * matches.
 */
async function resolveDocumentId(
  userId: string,
  kind: DeletedKind,
  documentId: string
): Promise<string | { error: string }> {
  if (isFullResourceId(documentId) || !isShortResourceId(documentId)) {
    return documentId;
  }
  const { listDeletedDocuments: list } = await import("@nodetool-ai/models");
  const matches = (await list(userId)).filter(
    (row) => row.kind === kind && row.documentId.startsWith(documentId)
  );
  if (matches.length > 1) {
    return {
      error: `document_id ${documentId} matches more than one deleted ${kind}. Pass the full id.`
    };
  }
  return matches[0]?.documentId ?? documentId;
}

const restoreDeletedDocument: CapabilityExport = {
  spec: restoreDeletedDocumentSpec,
  impl: async (run, params) => {
    const kind = params["kind"];
    const rawId = params["document_id"];
    if (!isDeletedKind(kind)) {
      return { error: `kind must be one of ${DELETED_DOCUMENT_KINDS.join(", ")}.` };
    }
    if (!isNonBlankString(rawId)) {
      return { error: "document_id is required (use list_deleted_documents to find one)." };
    }
    const userId = userIdOf(run.context);
    const documentId = await resolveDocumentId(userId, kind, rawId.trim());
    if (typeof documentId !== "string") return documentId;
    const models = await import("@nodetool-ai/models");
    const result = await models.restoreDeletedDocument(userId, kind, documentId);
    if (result.outcome === "not_found") {
      return { error: `No restorable deleted ${kind} ${rawId.trim()} was found.` };
    }
    if (result.outcome === "failed") {
      return { error: result.reason };
    }
    return { restored: true, kind, document_id: documentId };
  }
};

export const TRASH_CAPABILITIES: readonly CapabilityExport[] = [
  listDeletedDocuments,
  restoreDeletedDocument
];

export const module: CapabilityModule = {
  module: "trash",
  exports: TRASH_CAPABILITIES
};

export { listDeletedDocuments, restoreDeletedDocument };
