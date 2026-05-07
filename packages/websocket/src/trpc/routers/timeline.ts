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
 *     list        (query)    — ClipVersion[]
 *     append      (mutation) — ClipVersion
 *     setFavorite (mutation) — ClipVersion
 *     delete      (mutation) — { ok: true }
 *
 * Auth: every procedure uses `protectedProcedure`. Ownership is enforced by
 * comparing `seq.user_id` against `ctx.userId`.
 */

import { z } from "zod";
import { TimelineSequence, Workflow, createTimeOrderedUuid } from "@nodetool-ai/models";
import type { TimelineDocument } from "@nodetool-ai/models";
import type { ClipVersion } from "@nodetool-ai/timeline";
import { makeClip } from "@nodetool-ai/timeline";
import { computeDependencyHash } from "@nodetool-ai/timeline/dependencyHash.js";
import {
  appendClipVersionInput,
  clipVersion,
  createClipInput,
  createTimelineInput,
  patchTimelineInput,
  timelineClipResponse,
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

const versionsSetFavoriteInput = z.object({
  id: z.string(),
  clipId: z.string(),
  versionId: z.string(),
  favorite: z.boolean()
});

const versionsDeleteInput = z.object({
  id: z.string(),
  clipId: z.string(),
  versionId: z.string()
});

/** Max successful versions retained per clip (favorites excluded from pruning). */
const MAX_SUCCESSFUL_VERSIONS = 10;
/** Max failed/cancelled versions retained per clip. */
const MAX_FAILED_VERSIONS = 5;

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

// ── Node-type helpers ────────────────────────────────────────────────────────

/** Known terminal media-output node type suffixes → mediaType */
const OUTPUT_NODE_MEDIA_TYPES: Record<string, "image" | "video" | "audio"> = {
  "nodetool.output.ImageOutput": "image",
  "nodetool.output.VideoOutput": "video",
  "nodetool.output.AudioOutput": "audio"
};

function isOutputNode(nodeType: string): boolean {
  return nodeType in OUTPUT_NODE_MEDIA_TYPES;
}

function mediaTypeForOutputNode(nodeType: string): "image" | "video" | "audio" | null {
  return OUTPUT_NODE_MEDIA_TYPES[nodeType] ?? null;
}

function isInputNode(nodeType: string): boolean {
  return nodeType.startsWith("nodetool.input.");
}

/** Extract the node's `name` property from its `data` or `dynamic_properties`. */
function inputNodeName(node: Record<string, unknown>): string | null {
  const data = node.data as Record<string, unknown> | undefined;
  return (data?.name as string | undefined) ??
    ((node.dynamic_properties as Record<string, unknown> | undefined)?.name as string | undefined) ??
    null;
}

/** Extract the default value for an input node from its `data`. */
function inputNodeDefault(node: Record<string, unknown>): unknown {
  const data = node.data as Record<string, unknown> | undefined;
  return data?.value ?? null;
}

/** Default durationMs for each media type. */
const DEFAULT_DURATION_MS: Record<string, number> = {
  image: 4000,
  video: 4000,
  audio: 4000,
  overlay: 4000
};

// ── clips sub-router input ───────────────────────────────────────────────────

// (defined in protocol; re-used here)

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

        // ── Pruning ─────────────────────────────────────────────────────────
        // Split versions by status bucket
        const successful = clip.versions.filter(
          (v) => v.status === "success"
        );
        const nonSuccessful = clip.versions.filter(
          (v) => v.status !== "success"
        );

        // Prune successful: keep favorites + newest non-favorites up to cap
        const favSuccessful = successful.filter((v) => v.favorite);
        const slotsForNonFav = Math.max(
          0,
          MAX_SUCCESSFUL_VERSIONS - favSuccessful.length
        );
        const nonFavSuccessful =
          slotsForNonFav > 0
            ? successful.filter((v) => !v.favorite).slice(-slotsForNonFav)
            : [];

        // Prune non-successful: keep newest up to cap
        const prunedNonSuccessful = nonSuccessful.slice(-MAX_FAILED_VERSIONS);

        // Restore original order (sort by createdAt ascending)
        const all = [...favSuccessful, ...nonFavSuccessful, ...prunedNonSuccessful];
        all.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        clip.versions = all;

        await TimelineSequence.update(input.id, {
          document: JSON.stringify(doc)
        });

        return newVersion;
      }),

    setFavorite: protectedProcedure
      .input(versionsSetFavoriteInput)
      .output(clipVersion)
      .mutation(async ({ ctx, input }) => {
        const seq = await loadOwned(ctx.userId, input.id);
        const doc = seq.toDocument();
        const clipIdx = doc.clips.findIndex((c) => c.id === input.clipId);
        if (clipIdx === -1) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Clip not found");
        }
        const clip = doc.clips[clipIdx];
        const versionIdx = (clip.versions ?? []).findIndex(
          (v) => v.id === input.versionId
        );
        if (versionIdx === -1) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        }
        const version = clip.versions![versionIdx];
        clip.versions![versionIdx] = { ...version, favorite: input.favorite };

        await TimelineSequence.update(input.id, {
          document: JSON.stringify(doc)
        });

        return clip.versions![versionIdx];
      }),

    delete: protectedProcedure
      .input(versionsDeleteInput)
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        const seq = await loadOwned(ctx.userId, input.id);
        const doc = seq.toDocument();
        const clipIdx = doc.clips.findIndex((c) => c.id === input.clipId);
        if (clipIdx === -1) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Clip not found");
        }
        const clip = doc.clips[clipIdx];
        const before = (clip.versions ?? []).length;
        clip.versions = (clip.versions ?? []).filter(
          (v) => v.id !== input.versionId
        );
        if (clip.versions.length === before) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        }

        await TimelineSequence.update(input.id, {
          document: JSON.stringify(doc)
        });

        return { ok: true as const };
      })
  }),

  clips: router({
    create: protectedProcedure
      .input(createClipInput)
      .output(timelineClipResponse)
      .mutation(async ({ ctx, input }) => {
        // 1. Verify ownership of timeline
        const seq = await loadOwned(ctx.userId, input.id);

        // 2. Clone the source workflow into a clip-private row
        const clone = await Workflow.cloneAsClipPrivate(
          input.sourceWorkflowId,
          ctx.userId!
        );

        const nodes = (clone.graph?.nodes ?? []) as Record<string, unknown>[];

        // 3. Find terminal output nodes (nodes whose type is a known output type)
        const outputNodes = nodes.filter((n) =>
          isOutputNode(n.type as string)
        );

        if (outputNodes.length === 0) {
          throwApiError(
            ApiErrorCode.TIMELINE_NO_MEDIA_OUTPUT,
            "Source workflow has no media output node (ImageOutput, VideoOutput, or AudioOutput)"
          );
        }

        let selectedOutputNode: Record<string, unknown>;
        if (input.selectedOutputNodeId) {
          const found = outputNodes.find(
            (n) => n.id === input.selectedOutputNodeId
          );
          if (!found) {
            throwApiError(
              ApiErrorCode.INVALID_INPUT,
              `selectedOutputNodeId ${input.selectedOutputNodeId} is not a terminal output node in the cloned graph`
            );
          }
          selectedOutputNode = found;
        } else if (outputNodes.length === 1) {
          selectedOutputNode = outputNodes[0]!;
        } else {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            "Source workflow has multiple terminal output nodes; provide selectedOutputNodeId"
          );
          // unreachable: throwApiError always throws (returns never)
        }

        const rawMediaType = mediaTypeForOutputNode(
          selectedOutputNode.type as string
        ) ?? "image";
        const mediaType: "image" | "video" | "audio" | "overlay" =
          input.mediaTypeOverride === "overlay" && rawMediaType === "video"
            ? "overlay"
            : rawMediaType;

        // 4. Seed paramOverrides from each Input* node default
        const paramOverrides: Record<string, unknown> = {};
        for (const node of nodes) {
          if (!isInputNode(node.type as string)) continue;
          const name = inputNodeName(node);
          if (name) {
            paramOverrides[name] = inputNodeDefault(node);
          }
        }

        // 5. Initial durationMs
        const durationMsInput = nodes.find(
          (n) => isInputNode(n.type as string) && inputNodeName(n) === "duration_ms"
        );
        const durationMs: number =
          (durationMsInput ? (inputNodeDefault(durationMsInput) as number | null) : null) ??
          DEFAULT_DURATION_MS[mediaType] ??
          4000;

        // 5. Compute initial dependencyHash via @nodetool-ai/timeline
        const workflowUpdatedAt =
          (clone.updated_at as string | undefined | null) ??
          new Date().toISOString();
        const dependencyHash = computeDependencyHash({
          workflowId: clone.id,
          workflowUpdatedAt,
          paramOverrides,
          inputAssetHashes: []
        });

        // 6. Build and insert the clip into the sequence document.
        // The clip name inherits the source workflow's name so users can
        // identify clip origins in the timeline before renaming.
        const clipId = createTimeOrderedUuid();
        const newClip = makeClip({
          id: clipId,
          name: clone.name,
          trackId: input.trackId,
          startMs: input.startMs,
          durationMs,
          mediaType,
          sourceType: "generated",
          workflowId: clone.id,
          selectedOutputNodeId: selectedOutputNode.id as string,
          paramOverrides,
          dependencyHash,
          status: "draft",
          locked: false,
          versions: []
        });

        const doc = seq.toDocument();
        doc.clips.push(newClip);

        await TimelineSequence.update(input.id, {
          document: JSON.stringify(doc)
        });

        return newClip;
      })
  })
});
