/**
 * Timeline router — tRPC.
 *
 * Procedures:
 *   list        (query)    — TimelineSequenceListItem[]
 *   get         (query)    — TimelineSequenceResponse
 *   create      (mutation) — TimelineSequenceResponse
 *   update      (mutation) — TimelineSequenceResponse (optional baseUpdatedAt for optimistic concurrency)
 *   delete      (mutation) — { ok: true }
 *   versions:
 *     list      (query)    — ClipVersion[]
 *     append    (mutation) — ClipVersion
 *
 * Auth: every procedure uses `protectedProcedure`. Ownership is enforced by
 * comparing `seq.user_id` against `ctx.userId`.
 */

import { z } from "zod";
import { TimelineSequence, createTimeOrderedUuid } from "@nodetool-ai/models";
import type { TimelineDocument } from "@nodetool-ai/models";
import type { ClipVersion } from "@nodetool-ai/timeline";
import {
  appendClipVersionInput,
  clipVersion,
  createTimelineInput,
  patchTimelineInput,
  timelineSequenceListItem,
  timelineSequenceResponse
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

// ── input shapes specific to this router ────────────────────────────────────

const listInput = z.object({
  projectId: z.string().optional()
});

const idInput = z.object({ id: z.string() });

const updateInput = patchTimelineInput.and(
  z.object({
    id: z.string(),
    baseUpdatedAt: z.string().optional()
  })
);

const versionsListInput = z.object({
  id: z.string(),
  clipId: z.string()
});

const versionsAppendInput = appendClipVersionInput.and(
  z.object({ id: z.string(), clipId: z.string() })
);

const okOutput = z.object({ ok: z.literal(true) });

// ── helpers ─────────────────────────────────────────────────────────────────

function toListItem(seq: TimelineSequence) {
  return {
    id: seq.id,
    projectId: seq.project_id,
    name: seq.name,
    updatedAt: seq.updated_at
  };
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<TimelineSequence> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const seq = await TimelineSequence.findById(id);
  if (!seq || seq.user_id !== ctxUserId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Timeline sequence not found");
  }
  return seq;
}

// ── router ──────────────────────────────────────────────────────────────────

export const timelineRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(timelineSequenceListItem))
    .query(async ({ ctx, input }) => {
      const seqs = input.projectId
        ? (await TimelineSequence.listByProject(input.projectId)).filter(
            (s) => s.user_id === ctx.userId
          )
        : await TimelineSequence.listByUser(ctx.userId);
      return seqs.map(toListItem);
    }),

  get: protectedProcedure
    .input(idInput)
    .output(timelineSequenceResponse)
    .query(async ({ ctx, input }) => {
      const seq = await loadOwned(ctx.userId, input.id);
      return seq.toTimelineSequence();
    }),

  create: protectedProcedure
    .input(createTimelineInput)
    .output(timelineSequenceResponse)
    .mutation(async ({ ctx, input }) => {
      const seq = new TimelineSequence({
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        fps: input.fps,
        width: input.width,
        height: input.height
      });
      await seq.save();
      return seq.toTimelineSequence();
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(timelineSequenceResponse)
    .mutation(async ({ ctx, input }) => {
      const seq = await loadOwned(ctx.userId, input.id);

      if (
        input.baseUpdatedAt !== undefined &&
        input.baseUpdatedAt !== seq.updated_at
      ) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Timeline has been modified since last load"
        );
      }

      const fields: Parameters<typeof TimelineSequence.update>[1] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.fps !== undefined) fields.fps = input.fps;
      if (input.width !== undefined) fields.width = input.width;
      if (input.height !== undefined) fields.height = input.height;

      if (input.document !== undefined) {
        const current = seq.toDocument();
        const merged: TimelineDocument = {
          tracks:
            (input.document.tracks as TimelineDocument["tracks"]) ??
            current.tracks,
          clips:
            (input.document.clips as TimelineDocument["clips"]) ??
            current.clips,
          markers:
            (input.document.markers as TimelineDocument["markers"]) ??
            current.markers
        };
        fields.document = JSON.stringify(merged);
      }

      const updated = await TimelineSequence.update(input.id, fields);
      if (!updated) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Timeline sequence not found");
      }
      return updated.toTimelineSequence();
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const seq = await loadOwned(ctx.userId, input.id);
      await seq.delete();
      return { ok: true as const };
    }),

  versions: router({
    list: protectedProcedure
      .input(versionsListInput)
      .output(z.array(clipVersion))
      .query(async ({ ctx, input }) => {
        const seq = await loadOwned(ctx.userId, input.id);
        const doc = seq.toDocument();
        const clip = doc.clips.find((c) => c.id === input.clipId);
        if (!clip) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Clip not found");
        }
        return clip.versions ?? [];
      }),

    append: protectedProcedure
      .input(versionsAppendInput)
      .output(clipVersion)
      .mutation(async ({ ctx, input }) => {
        const seq = await loadOwned(ctx.userId, input.id);
        const doc = seq.toDocument();
        const idx = doc.clips.findIndex((c) => c.id === input.clipId);
        if (idx === -1) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Clip not found");
        }

        const newVersion: ClipVersion = {
          id: createTimeOrderedUuid(),
          createdAt: new Date().toISOString(),
          jobId: input.jobId,
          assetId: input.assetId,
          dependencyHash: input.dependencyHash,
          workflowUpdatedAt: input.workflowUpdatedAt,
          paramOverridesSnapshot: input.paramOverridesSnapshot ?? {},
          costCredits: input.costCredits,
          durationMs: input.durationMs,
          status: input.status
        };

        const clip = doc.clips[idx];
        if (!clip.versions) clip.versions = [];
        clip.versions.push(newVersion);

        await TimelineSequence.update(input.id, {
          document: JSON.stringify(doc)
        });

        return newVersion;
      })
  })
});
