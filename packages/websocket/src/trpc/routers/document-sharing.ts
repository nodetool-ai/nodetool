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
 *   revokeLink         (mutation) — disable a link: it admits nobody new
 *   setLinkOptions     (mutation) — history, download, duplicate on a link
 *   dismissNotice      (mutation) — clear the owner notice on a link
 *   invite             (mutation) — give a directory account access by name
 *   setInvitationOptions (mutation) — the options of one invitation
 *   setRole            (mutation) — change a collaborator's role
 *   removeCollaborator (mutation) — owner removes anyone, a collaborator leaves
 *   accept             (mutation) — redeem a link into a grant
 *   access             (query)    — the caller's role and options
 *   sharedWithMe       (query)    — documents the caller holds a grant on
 *
 * Options follow P1 to P6 of docs/plans/native-cloud-sync/prd.md: a person's
 * role is the highest of their grants, an option is on when any grant turns
 * it on, and a link grant reads its link's options at every request.
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
  documentSharingAccessOutput,
  documentSharingDismissNoticeInput,
  documentSharingSetInvitationOptionsInput,
  documentSharingSetLinkOptionsInput,
  documentSharingCreateLinkInput,
  documentSharingGetOutput,
  documentSharingOkOutput,
  documentSharingRemoveCollaboratorInput,
  documentSharingRevokeLinkInput,
  documentSharingSetRoleInput,
  documentSharingInviteInput,
  documentShareItem,
  documentCollaboratorItem,
  type SharedDocumentItem
} from "@nodetool-ai/protocol/api-schemas/document-sharing.js";
import { ApiErrorCode } from "../../error-codes.js";
import {
  effectiveAccess,
  loadSharedDocument,
  peopleOn,
  type SharedDocumentRow
} from "../../lib/document-access.js";
import { invalidateSharedAssets } from "../../lib/shared-assets.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { requirePermission } from "../../lib/permissions.js";
import { requireInvitee, withPersonNames } from "../../lib/people.js";

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
    created_at: grant.created_at ?? null,
    share_id: grant.share_id ?? null,
    options: {
      allow_history: grant.allow_history === true,
      allow_download: grant.allow_download === true,
      allow_duplicate: grant.allow_duplicate === true
    }
  };
}

function toShareItem(share: DocumentShare) {
  return {
    id: share.id,
    token: share.token,
    role: share.role,
    created_at: share.created_at ?? null,
    revoked_at: share.disabled_at ?? null,
    disabled_at: share.disabled_at ?? null,
    options: {
      allow_history: share.allow_history === true,
      allow_download: share.allow_download === true,
      allow_duplicate: share.allow_duplicate === true
    },
    owner_notice: share.owner_notice ?? null
  };
}

/** A link of the owner's document, else NOT_FOUND. */
async function requireShareOf(
  type: SharedDocumentType,
  document: SharedDocumentRow,
  shareId: string
): Promise<DocumentShare> {
  const share = (await DocumentShare.get(shareId)) as DocumentShare | null;
  if (
    !share ||
    share.document_type !== type ||
    share.document_id !== document.id
  ) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Share not found");
  }
  return share;
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
        collaborators: await withPersonNames(
          collaborators.map(toCollaboratorItem)
        ),
        shares: shares.map(toShareItem),
        people: await withPersonNames(
          await peopleOn(
            input.type,
            document,
            collaborators.map((c) => c.user_id)
          )
        )
      };
    }),

  createLink: protectedProcedure
    .input(documentSharingCreateLinkInput)
    .output(documentShareItem)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      await requirePermission(ctx.userId, "share_links");
      const share = await DocumentShare.ensure({
        documentType: input.type,
        documentId: document.id,
        role: input.role,
        createdBy: ctx.userId
      });
      return toShareItem(share);
    }),

  // People who joined keep their access, and the link's options stay live
  // for them (P3).
  revokeLink: protectedProcedure
    .input(documentSharingRevokeLinkInput)
    .output(documentSharingOkOutput)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const share = await requireShareOf(input.type, document, input.share_id);
      if (!share.isRevoked) await share.revoke();
      return { ok: true as const };
    }),

  // Options are settings of the link and apply to everyone who joined
  // through it from their next request, also on a disabled link (P3).
  setLinkOptions: protectedProcedure
    .input(documentSharingSetLinkOptionsInput)
    .output(documentShareItem)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const share = await requireShareOf(input.type, document, input.share_id);
      await share.setOptions(input.options);
      // Every person who joined through the link reads files through it.
      invalidateSharedAssets();
      return toShareItem(share);
    }),

  dismissNotice: protectedProcedure
    .input(documentSharingDismissNoticeInput)
    .output(documentSharingOkOutput)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const share = await requireShareOf(input.type, document, input.share_id);
      if (share.owner_notice !== null) {
        share.owner_notice = null;
        await share.save();
      }
      return { ok: true as const };
    }),

  // Inviting someone who already has an invitation sets its role, and the
  // options given.
  invite: protectedProcedure
    .input(documentSharingInviteInput)
    .output(documentCollaboratorItem)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      await requirePermission(ctx.userId, "share_links");
      await requireInvitee(ctx.userId, input.user_id);
      const grant = await DocumentCollaborator.invite({
        documentType: input.type,
        documentId: document.id,
        userId: input.user_id,
        role: input.role,
        invitedBy: ctx.userId,
        options: input.options
      });
      invalidateSharedAssets(input.user_id);
      const [item] = await withPersonNames([toCollaboratorItem(grant)]);
      return item;
    }),

  setInvitationOptions: protectedProcedure
    .input(documentSharingSetInvitationOptionsInput)
    .output(documentCollaboratorItem)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const grant = await DocumentCollaborator.findInvitation(
        input.type,
        document.id,
        input.user_id
      );
      if (!grant) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Invitation not found");
      }
      const updated = await DocumentCollaborator.invite({
        documentType: input.type,
        documentId: document.id,
        userId: input.user_id,
        role: grant.role,
        invitedBy: grant.invited_by,
        options: input.options
      });
      invalidateSharedAssets(input.user_id);
      const [item] = await withPersonNames([toCollaboratorItem(updated)]);
      return item;
    }),

  // Sets the role on every grant the person holds.
  setRole: protectedProcedure
    .input(documentSharingSetRoleInput)
    .output(documentCollaboratorItem)
    .mutation(async ({ ctx, input }) => {
      const document = await requireOwner(input.type, input.id, ctx.userId);
      const grants = await DocumentCollaborator.setRole(
        input.type,
        document.id,
        input.user_id,
        input.role
      );
      if (grants.length === 0) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Collaborator not found");
      }
      invalidateSharedAssets(input.user_id);
      return toCollaboratorItem(grants[0]);
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
      invalidateSharedAssets(input.user_id);
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
      await DocumentCollaborator.redeem(share, ctx.userId);
      // The new document's media must load on the very next request.
      invalidateSharedAssets(ctx.userId);
      const access = await effectiveAccess(
        ctx.userId,
        share.document_type,
        document.id
      );
      return toSharedItem(
        share.document_type,
        document,
        access?.role === "editor" || access?.role === "owner"
          ? "editor"
          : "viewer"
      );
    }),

  access: protectedProcedure
    .input(documentRefInput)
    .output(documentSharingAccessOutput)
    .query(async ({ ctx, input }) => {
      // Resolve a short id the same way the per-kind routers do.
      const document = await loadSharedDocument(input.type, input.id);
      if (!document) return { access: null };
      return {
        access: await effectiveAccess(ctx.userId, input.type, document.id)
      };
    }),

  sharedWithMe: protectedProcedure
    .output(documentSharedWithMeOutput)
    .query(async ({ ctx }) => {
      const grants = await DocumentCollaborator.listForUser(ctx.userId);
      // A person may hold an invitation and link grants on one document: list
      // it once, with the highest role.
      const byDocument = new Map<string, DocumentCollaborator>();
      for (const grant of grants) {
        const key = `${grant.document_type}:${grant.document_id}`;
        const seen = byDocument.get(key);
        if (!seen || (seen.role === "viewer" && grant.role === "editor")) {
          byDocument.set(key, grant);
        }
      }
      const loaded = await Promise.all(
        [...byDocument.values()].map(async (grant) => ({
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
