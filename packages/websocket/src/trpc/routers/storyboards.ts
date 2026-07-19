/**
 * Storyboards router — tRPC.
 *
 * Procedures:
 *   list    (query)    — StoryboardListItem[]
 *   get     (query)    — StoryboardResponse
 *   create  (mutation) — StoryboardResponse
 *   update  (mutation) — StoryboardResponse (CAS via baseUpdatedAt)
 *   delete  (mutation) — { ok: true }
 */

import { z } from "zod";
import { Storyboard, emptyStoryboardDocument } from "@nodetool-ai/models";
import {
  createStoryboardInput,
  patchStoryboardInput,
  storyboardListItem,
  storyboardResponse
} from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const listInput = z.object({
  projectId: z.string().optional()
});

const idInput = z.object({ id: z.string() });

const updateInput = patchStoryboardInput.and(
  z.object({
    id: z.string(),
    baseUpdatedAt: z.string().optional()
  })
);

const okOutput = z.object({ ok: z.literal(true) });

function toListItem(board: Storyboard) {
  return {
    id: board.id,
    projectId: board.project_id,
    name: board.name,
    shotCount: board.toDocument().shots.length,
    updatedAt: board.updated_at
  };
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<Storyboard> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const board = await Storyboard.findById(id);
  if (!board || board.user_id !== ctxUserId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Storyboard not found");
  }
  return board;
}

export const storyboardsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(storyboardListItem))
    .query(async ({ ctx, input }) => {
      const boards = input.projectId
        ? await Storyboard.listByProject(input.projectId, ctx.userId)
        : await Storyboard.listByUser(ctx.userId);
      return boards.map(toListItem);
    }),

  get: protectedProcedure
    .input(idInput)
    .output(storyboardResponse)
    .query(async ({ ctx, input }) => {
      const board = await loadOwned(ctx.userId, input.id);
      return storyboardResponse.parse(board.toResponse());
    }),

  create: protectedProcedure
    .input(createStoryboardInput)
    .output(storyboardResponse)
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await Storyboard.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Storyboard not found");
          }
          return storyboardResponse.parse(existing.toResponse());
        }
      }
      const board = new Storyboard({
        id: input.id,
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        document: JSON.stringify(input.document ?? emptyStoryboardDocument())
      });
      await board.save();
      return storyboardResponse.parse(board.toResponse());
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(storyboardResponse)
    .mutation(async ({ ctx, input }) => {
      const board = await loadOwned(ctx.userId, input.id);

      // CAS on updated_at so the conflict check and the write are atomic.
      const expectedUpdatedAt = input.baseUpdatedAt ?? board.updated_at;
      if (input.baseUpdatedAt && board.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Storyboard was modified since last read (optimistic concurrency conflict)"
        );
      }

      const fields: Parameters<
        typeof Storyboard.updateFieldsIfUnchanged
      >[2] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.document !== undefined)
        fields.document = JSON.stringify(input.document);
      if (input.timelineId !== undefined)
        fields.timeline_id = input.timelineId;

      const updated = await Storyboard.updateFieldsIfUnchanged(
        input.id,
        expectedUpdatedAt,
        fields
      );
      if (!updated) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Storyboard was modified since last read (optimistic concurrency conflict)"
        );
      }
      return storyboardResponse.parse(updated.toResponse());
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const board = await loadOwned(ctx.userId, input.id);
      await board.delete();
      return { ok: true as const };
    })
});
