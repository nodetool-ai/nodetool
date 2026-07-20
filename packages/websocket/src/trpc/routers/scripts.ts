/**
 * Scripts router — tRPC.
 *
 * A script is a first-class resource whose text owns its derived audio takes.
 * Mirrors the storyboards router shape.
 *
 * Procedures:
 *   list    (query)    — ScriptListItem[]
 *   get     (query)    — ScriptResponse
 *   create  (mutation) — ScriptResponse
 *   update  (mutation) — ScriptResponse (CAS via baseUpdatedAt)
 *   delete  (mutation) — { ok: true }
 */

import { z } from "zod";
import { Script, countScriptLines, emptyScriptDocument } from "@nodetool-ai/models";
import {
  createScriptInput,
  patchScriptInput,
  scriptListItem,
  scriptResponse
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const listInput = z.object({
  projectId: z.string().optional()
});

const idInput = z.object({ id: z.string() });

const updateInput = patchScriptInput.and(
  z.object({
    id: z.string(),
    baseUpdatedAt: z.string().optional()
  })
);

const okOutput = z.object({ ok: z.literal(true) });

function toListItem(script: Script) {
  return {
    id: script.id,
    projectId: script.project_id,
    name: script.name,
    lineCount: countScriptLines(script.toDocument()),
    updatedAt: script.updated_at
  };
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<Script> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const script = await Script.findById(id);
  if (!script || script.user_id !== ctxUserId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Script not found");
  }
  return script;
}

export const scriptsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(scriptListItem))
    .query(async ({ ctx, input }) => {
      const items = input.projectId
        ? await Script.listByProject(input.projectId, ctx.userId)
        : await Script.listByUser(ctx.userId);
      return items.map(toListItem);
    }),

  get: protectedProcedure
    .input(idInput)
    .output(scriptResponse)
    .query(async ({ ctx, input }) => {
      const script = await loadOwned(ctx.userId, input.id);
      return scriptResponse.parse(script.toResponse());
    }),

  create: protectedProcedure
    .input(createScriptInput)
    .output(scriptResponse)
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await Script.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Script not found");
          }
          return scriptResponse.parse(existing.toResponse());
        }
      }
      const script = new Script({
        id: input.id,
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        document: JSON.stringify(input.document ?? emptyScriptDocument())
      });
      await script.save();
      return scriptResponse.parse(script.toResponse());
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(scriptResponse)
    .mutation(async ({ ctx, input }) => {
      const script = await loadOwned(ctx.userId, input.id);

      // CAS on updated_at so the conflict check and the write are atomic.
      const expectedUpdatedAt = input.baseUpdatedAt ?? script.updated_at;
      if (input.baseUpdatedAt && script.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Script was modified since last read (optimistic concurrency conflict)"
        );
      }

      const fields: Parameters<typeof Script.updateFieldsIfUnchanged>[2] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.document !== undefined)
        fields.document = JSON.stringify(input.document);
      if (input.timelineId !== undefined)
        fields.timeline_id = input.timelineId;

      const updated = await Script.updateFieldsIfUnchanged(
        input.id,
        expectedUpdatedAt,
        fields
      );
      if (!updated) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Script was modified since last read (optimistic concurrency conflict)"
        );
      }
      return scriptResponse.parse(updated.toResponse());
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const script = await loadOwned(ctx.userId, input.id);
      await script.delete();
      return { ok: true as const };
    })
});
