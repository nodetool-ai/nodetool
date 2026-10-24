/**
 * Document sharing router — tRPC.
 *
 * Private sharing for storyboards, scripts, timelines, sketches, apps and JS
 * scripts. The owner mints role-scoped links; any signed-in user who redeems
 * one becomes a collaborator. The per-kind routers enforce the roles (see
 * lib/document-access.ts). Workflows use `workflows.sharing.*`.
 *
 * Procedures:
 *   get                (query)    — collaborators and links (owner)
 *   createLink         (mutation) — mint or reuse the active link for a role
 *   revokeLink         (mutation) — stop new redemptions of a link
 *   setRole            (mutation) — change a collaborator's role
 *   removeCollaborator (mutation) — owner removes anyone, a collaborator leaves
 *   accept             (mutation) — redeem a link into a grant
 *   sharedWithMe       (query)    — documents the caller holds a grant on
 */

import {
  DocumentCollaborator,
  DocumentShare,
  type SharedDocumentType
} from "@nodetool-ai/models";
import {
  documentRefInput,
  documentSharedWithMeOutput,
  documentSharingAcceptInput,
  documentSharingAcceptOutput,
  documentSharingCreateLinkInput,
  documentSharingGetOutput,
  documentSharingOkOutput,
  documentSharingRemoveCollaboratorInput,
  documentSharingRevokeLinkInput,
  documentSharingSetRoleInput,
  documentShareItem,
  documentCollaboratorItem,
  type SharedDocumentItem
} from "@nodetool-ai/protocol/api-schemas/document-sharing.js";
import { ApiErrorCode } from "../../error-codes.js";
import {
  loadSharedDocument,
  type SharedDocumentRow
} from "../../lib/document-access.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const NOT_FOUND = "Document not found";

/** Load a document the caller owns, else NOT_FOUND. */
async function requireOwner(
  type: SharedDocumentType,
  id: string,
  userId: string
): Promise<SharedDocumentRow> {
  const document = await loadSharedDocument(type, id);
  if (!document || document.user_id !== userId) {
    throwApiError(ApiErrorCode.NOT_FOUND, NOT_FOUND);
  }
  return document;
}

function toCollaboratorItem(grant: DocumentCollaborator) {
  return {
    user_id: grant.user_id,
    role: grant.role,
    invited_by: grant.invited_by,
    created_at: grant.created_at ?? null
  };
}

function toShareItem(share: DocumentShare) {
  return {
    id: share.id,
    token: share.token,
    role: share.role,
    created_at: share.created_at ?? null,
    revoked_at: share.revoked_at ?? null
  };
}

function toSharedItem(
  type: SharedDocumentType,
  document: SharedDocumentRow,
  role: SharedDocumentItem["role"]
): SharedDocumentItem {
  return {
    type,
    id: document.id,
    name: document.name,
    owner_id: document.user_id,
    role,
    updated_at: document.updated_at ?? null
  };
}

export const documentSharingRouter = router({
  get: protectedProcedure
    .input(documentRefInput)
    .output(documentSharingGetOutput)
    .query(async ({ ctx, input }) => {
      // `input.id` may be a 12-character prefix. The sharing tables key on
      // the full id, so every read and write below uses the resolved row's.
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const [collaborators, shares] = await Promise.all([
        DocumentCollaborator.listForDocument(input.type, document.id),
        DocumentShare.listForDocument(input.type, document.id)
      ]);
      return {
        collaborators: collaborators.map(toCollaboratorItem),
        shares: shares.map(toShareItem)
      };
    }),

  createLink: protectedProcedure
    .input(documentSharingCreateLinkInput)
    .output(documentShareItem)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const share = await DocumentShare.ensure({
        documentType: input.type,
        documentId: document.id,
        role: input.role,
        createdBy: ctx.userId
      });
      return toShareItem(share);
    }),

  // Existing collaborators keep their access.
  revokeLink: protectedProcedure
    .input(documentSharingRevokeLinkInput)
    .output(documentSharingOkOutput)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const share = (await DocumentShare.get(
        input.share_id
      )) as DocumentShare | null;
      if (
        !share ||
        share.document_type !== input.type ||
        share.document_id !== document.id
      ) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Share not found");
      }
      if (!share.isRevoked) await share.revoke();
      return { ok: true as const };
    }),

  setRole: protectedProcedure
    .input(documentSharingSetRoleInput)
    .output(documentCollaboratorItem)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const grant = await DocumentCollaborator.findFor(
        input.type,
        document.id,
        input.user_id
      );
      if (!grant) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Collaborator not found");
      }
      if (grant.role !== input.role) {
        grant.role = input.role;
        await grant.save();
      }
      return toCollaboratorItem(grant);
    }),

  removeCollaborator: protectedProcedure
    .input(documentSharingRemoveCollaboratorInput)
    .output(documentSharingOkOutput)
    .mutation(async ({ ctx, input }) => {
      // The grant keys on the full document id. A collaborator leaving needs
      // no ownership check, but a short id still has to resolve. A grant can
      // outlive its document, so an unresolvable id falls back to the input.
      const documentId =
        input.user_id !== ctx.userId
          ? (await requireOwner(input.type, input.id, ctx.userId)).id
          : ((await loadSharedDocument(input.type, input.id))?.id ?? input.id);
      const removed = await DocumentCollaborator.remove(
        input.type,
        documentId,
        input.user_id
      );
      if (!removed) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Collaborator not found");
      }
      return { ok: true as const };
    }),

  // The owner opening their own link is a no-op, not a grant.
  accept: protectedProcedure
    .input(documentSharingAcceptInput)
    .output(documentSharingAcceptOutput)
    .mutation(async ({ ctx, input }) => {
      const share = await DocumentShare.findByToken(input.token);
      if (!share || share.isRevoked) {
        throwApiError(
          ApiErrorCode.NOT_FOUND,
          "Share link is invalid or revoked"
        );
      }
      const document = await loadSharedDocument(
        share.document_type,
        share.document_id
      );
      if (!document) throwApiError(ApiErrorCode.NOT_FOUND, NOT_FOUND);
      if (document.user_id === ctx.userId) {
        return toSharedItem(share.document_type, document, "editor");
      }
      const grant = await DocumentCollaborator.upsert({
        documentType: share.document_type,
        documentId: document.id,
        userId: ctx.userId,
        role: share.role,
        invitedBy: share.created_by
      });
      return toSharedItem(share.document_type, document, grant.role);
    }),

  sharedWithMe: protectedProcedure
    .output(documentSharedWithMeOutput)
    .query(async ({ ctx }) => {
      const grants = await DocumentCollaborator.listForUser(ctx.userId);
      const loaded = await Promise.all(
        grants.map(async (grant) => ({
          grant,
          document: await loadSharedDocument(
            grant.document_type,
            grant.document_id
          )
        }))
      );
      const documents: SharedDocumentItem[] = [];
      for (const { grant, document } of loaded) {
        // A grant can outlive its document when a delete skipped the cascade.
        if (!document) continue;
        documents.push(toSharedItem(grant.document_type, document, grant.role));
      }
      return { documents };
    })
});
