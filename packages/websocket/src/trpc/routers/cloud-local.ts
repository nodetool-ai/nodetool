/**
 * Cloud local router — the store each native app keeps in the local database
 * of its bundled server for documents that live on a cloud server: durable
 * drafts of unsent edits and the last known open state
 * (docs/plans/native-cloud-sync/technical-design.md, "Local data scoping and
 * durable drafts").
 *
 * Every procedure names the cloud server key and account. The local user is
 * the caller, so one account's rows never reach another account. A server
 * on PostgreSQL is a cloud deployment and has no local store, so every
 * procedure answers SERVICE_UNAVAILABLE there.
 */

import { CloudLocalStore, getDbType } from "@nodetool-ai/models";
import type {
  CloudDraftRow,
  CloudLocalScope,
  CloudOpenStateRow
} from "@nodetool-ai/models";
import {
  acceptSaveInput,
  acceptSaveOutput,
  cloudDocumentRef,
  discardDraftOutput,
  getDraftOutput,
  getOpenStateOutput,
  listDraftsInput,
  listDraftsOutput,
  markUnsentInput,
  markUnsentOutput,
  putDraftInput,
  putDraftOutput,
  recordContactInput,
  recordContactOutput,
  type CloudAccountScope,
  type CloudDocumentRefInput,
  type CloudDraftResponse,
  type CloudOpenStateResponse
} from "@nodetool-ai/protocol/api-schemas/cloud-local.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

function scopeOf(userId: string, input: CloudAccountScope): CloudLocalScope {
  if (getDbType() !== "sqlite") {
    throwApiError(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      "The cloud local store exists only on a local server"
    );
  }
  return { userId, serverKey: input.server_key, accountId: input.account_id };
}

function docOf(input: CloudDocumentRefInput) {
  return { kind: input.kind, documentId: input.document_id };
}

function toDraft(row: CloudDraftRow): CloudDraftResponse {
  return {
    kind: row.kind,
    document_id: row.document_id,
    base: { updated_at: row.base_updated_at, content_hash: row.base_content_hash },
    draft: row.draft,
    state: row.state,
    refusal_reason: row.refusal_reason,
    draft_id: row.draft_id,
    updated_at: row.updated_at
  };
}

function toOpenState(row: CloudOpenStateRow): CloudOpenStateResponse {
  const base =
    row.base_updated_at !== null && row.base_content_hash !== null
      ? { updated_at: row.base_updated_at, content_hash: row.base_content_hash }
      : null;
  return {
    kind: row.kind,
    document_id: row.document_id,
    role: row.role,
    options: row.options,
    base,
    last_contact_at: row.last_contact_at
  };
}

export const cloudLocalRouter = router({
  drafts: router({
    put: protectedProcedure
      .input(putDraftInput)
      .output(putDraftOutput)
      .mutation(async ({ ctx, input }) => {
        const draftId = await CloudLocalStore.putDraft(
          scopeOf(ctx.userId, input),
          docOf(input),
          { updatedAt: input.base.updated_at, contentHash: input.base.content_hash },
          input.draft
        );
        return { draft_id: draftId };
      }),

    get: protectedProcedure
      .input(cloudDocumentRef)
      .output(getDraftOutput)
      .query(async ({ ctx, input }) => {
        const row = await CloudLocalStore.getDraft(scopeOf(ctx.userId, input), docOf(input));
        return { draft: row ? toDraft(row) : null };
      }),

    list: protectedProcedure
      .input(listDraftsInput)
      .output(listDraftsOutput)
      .query(async ({ ctx, input }) => {
        const rows = await CloudLocalStore.listDrafts(scopeOf(ctx.userId, input), input.state);
        return { drafts: rows.map(toDraft) };
      }),

    accept: protectedProcedure
      .input(acceptSaveInput)
      .output(acceptSaveOutput)
      .mutation(async ({ ctx, input }) => {
        const outcome = await CloudLocalStore.acceptSave(
          scopeOf(ctx.userId, input),
          docOf(input),
          input.draft_id,
          {
            updatedAt: input.sent_base.updated_at,
            contentHash: input.sent_base.content_hash
          },
          { updatedAt: input.base.updated_at, contentHash: input.base.content_hash },
          { role: input.role, options: input.options }
        );
        return { outcome };
      }),

    markUnsent: protectedProcedure
      .input(markUnsentInput)
      .output(markUnsentOutput)
      .mutation(async ({ ctx, input }) => {
        const marked = await CloudLocalStore.markUnsent(
          scopeOf(ctx.userId, input),
          docOf(input),
          input.draft_id,
          input.reason
        );
        return { marked };
      }),

    discard: protectedProcedure
      .input(cloudDocumentRef)
      .output(discardDraftOutput)
      .mutation(async ({ ctx, input }) => {
        const discarded = await CloudLocalStore.discardDraft(
          scopeOf(ctx.userId, input),
          docOf(input)
        );
        return { discarded };
      })
  }),

  openState: router({
    record: protectedProcedure
      .input(recordContactInput)
      .output(recordContactOutput)
      .mutation(async ({ ctx, input }) => {
        const access: Parameters<typeof CloudLocalStore.recordContact>[2] = {
          role: input.role,
          options: input.options
        };
        if (input.base) {
          access.base = {
            updatedAt: input.base.updated_at,
            contentHash: input.base.content_hash
          };
        }
        await CloudLocalStore.recordContact(scopeOf(ctx.userId, input), docOf(input), access);
        return { ok: true as const };
      }),

    get: protectedProcedure
      .input(cloudDocumentRef)
      .output(getOpenStateOutput)
      .query(async ({ ctx, input }) => {
        const row = await CloudLocalStore.getOpenState(scopeOf(ctx.userId, input), docOf(input));
        return { open_state: row ? toOpenState(row) : null };
      })
  })
});
