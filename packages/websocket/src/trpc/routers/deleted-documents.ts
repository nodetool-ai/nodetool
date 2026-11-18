/**
 * Deleted documents router: the owner's deleted workflows, timelines and
 * projects that are still inside their restore period (PRD D4, WP2.2).
 *
 * A server keeps deleted documents only when retention is on, which a
 * production server turns on at start-up. Elsewhere the list is empty and a
 * restore finds nothing.
 */

import {
  endDeletedDocumentRestorePeriod,
  listDeletedDocuments,
  restoreDeletedDocument
} from "@nodetool-ai/models";
import {
  deletedDocumentRef,
  endRestorePeriodOutput,
  listDeletedInput,
  listDeletedOutput,
  restoreDeletedOutput
} from "@nodetool-ai/protocol/api-schemas/deleted-documents.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

export const deletedDocumentsRouter = router({
  list: protectedProcedure
    .input(listDeletedInput)
    .output(listDeletedOutput)
    .query(async ({ ctx, input }) => {
      const rows = await listDeletedDocuments(
        ctx.userId,
        input.project_id === undefined ? {} : { projectId: input.project_id }
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
    }),

  restore: protectedProcedure
    .input(deletedDocumentRef)
    .output(restoreDeletedOutput)
    .mutation(async ({ ctx, input }) => {
      const result = await restoreDeletedDocument(ctx.userId, input.kind, input.document_id);
      if (result.outcome === "not_found") {
        throwApiError(ApiErrorCode.NOT_FOUND, "Deleted document not found");
      }
      if (result.outcome === "failed") {
        throwApiError(ApiErrorCode.INVALID_INPUT, result.reason);
      }
      return { restored: true as const };
    }),

  endRestorePeriod: protectedProcedure
    .input(deletedDocumentRef)
    .output(endRestorePeriodOutput)
    .mutation(async ({ ctx, input }) => {
      const ended = await endDeletedDocumentRestorePeriod(
        ctx.userId,
        input.kind,
        input.document_id
      );
      if (!ended) throwApiError(ApiErrorCode.NOT_FOUND, "Deleted document not found");
      return { ended: true as const };
    })
});
