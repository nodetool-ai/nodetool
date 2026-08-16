/**
 * Timeline router — tRPC.
 *
 * Procedures:
 *   list        (query)    — TimelineSequenceListItem[]
 *   get         (query)    — TimelineSequenceResponse
 *   create      (mutation) — TimelineSequenceResponse
 *   update      (mutation) — TimelineSequenceResponse (optional baseUpdatedAt for optimistic concurrency)
 *   delete      (mutation) — { ok: true }
 *   clips.create        (mutation) — TimelineClipResponse
 *   versions.list       (query)    — TimelineVersionListItem[]
 *   versions.get        (query)    — TimelineVersionResponse
 *   versions.create     (mutation) — TimelineVersionListItem (manual snapshot)
 *   versions.restore    (mutation) — TimelineSequenceResponse (snapshots the
 *                                    pre-restore state first, so it is undoable)
 *   versions.delete     (mutation) — { ok: true }
 *
 * Auth: every procedure uses `protectedProcedure`. Ownership is enforced by
 * comparing `seq.user_id` against `ctx.userId`.
 */

import { z } from "zod";
import {
  TimelineSequence,
  TimelineSequenceConflictError,
  TimelineSequenceVersion,
  Workflow,
  createTimeOrderedUuid
} from "@nodetool-ai/models";
import type { TimelineDocument } from "@nodetool-ai/models";
import { makeClip } from "@nodetool-ai/timeline";
import { computeDependencyHash } from "@nodetool-ai/timeline/dependencyHash.js";
import {
  createClipInput,
  createTimelineInput,
  createTimelineVersionInput,
  deleteTimelineVersionInput,
  getTimelineVersionInput,
  listTimelineVersionsInput,
  patchTimelineInput,
  restoreTimelineVersionInput,
  timelineClipResponse,
  timelineSequenceListItem,
  timelineSequenceResponse,
  timelineVersionListItem,
  timelineVersionResponse
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

/** A decoded JSON value: what a stored document or graph carries. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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

/**
 * A version row carries its document as JSON text on SQLite and as an object on
 * Postgres, so parse only when it is a string.
 */
function parseVersionDocument(raw: unknown): TimelineDocument {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return (value ?? { tracks: [], clips: [], markers: [] }) as TimelineDocument;
}

function toVersionListItem(
  version: InstanceType<typeof TimelineSequenceVersion>
) {
  return {
    id: version.id,
    timelineId: version.timeline_id,
    version: version.version,
    name: version.name ?? null,
    saveType: version.save_type as "manual" | "autosave" | "restore",
    fps: version.fps,
    width: version.width,
    height: version.height,
    durationMs: version.duration_ms,
    createdAt: version.created_at
  };
}

// ── autosave snapshot cadence ───────────────────────────────────────────────

/** A document write only snapshots when the last autosave is this old. */
const AUTOSAVE_VERSION_INTERVAL_MS = 5 * 60 * 1000;
/** Autosave snapshots kept per timeline; older ones are pruned. */
const MAX_AUTOSAVE_VERSIONS = 20;

const lastAutosaveVersionTime = new Map<string, number>();

// Entries older than the interval can never suppress a snapshot again, so drop
// them. Without this the map grows one permanent entry per timeline ever saved
// (including deleted ones) for the lifetime of the process.
function recordAutosaveVersion(id: string, now: number): void {
  for (const [key, ts] of lastAutosaveVersionTime) {
    if (now - ts >= AUTOSAVE_VERSION_INTERVAL_MS) {
      lastAutosaveVersionTime.delete(key);
    }
  }
  lastAutosaveVersionTime.set(id, now);
}

/** Test hook: forget the autosave cadence so a suite can drive it from zero. */
export function __resetTimelineAutosaveVersionState(): void {
  lastAutosaveVersionTime.clear();
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

function mediaTypeForOutputNode(
  nodeType: string
): "image" | "video" | "audio" | null {
  return OUTPUT_NODE_MEDIA_TYPES[nodeType] ?? null;
}

function isInputNode(nodeType: string): boolean {
  return nodeType.startsWith("nodetool.input.");
}

/** Extract the node's `name` property from its `data` or `dynamic_properties`. */
function inputNodeName(node: Record<string, unknown>): string | null {
  const data = node.data as Record<string, unknown> | undefined;
  return (
    (data?.name as string | undefined) ??
    ((node.dynamic_properties as Record<string, unknown> | undefined)?.name as
      | string
      | undefined) ??
    null
  );
}

/** Extract the default value for an input node from its `data`. */
function inputNodeDefault(node: Record<string, unknown>): JsonValue {
  // SAFETY: the graph is stored as JSON, so a node's `data` holds JSON members.
  const data = node.data as { [key: string]: JsonValue } | undefined;
  return data?.value ?? null;
}

/** Default durationMs for each media type. */
const DEFAULT_DURATION_MS: Record<string, number> = {
  image: 4000,
  video: 4000,
  audio: 4000,
  overlay: 4000
};

async function mutateTimelineDocument<T>(
  id: string,
  mutator: (
    document: TimelineDocument,
    sequence: TimelineSequence
  ) => T | Promise<T>
) {
  try {
    return await TimelineSequence.mutateDocument(id, mutator);
  } catch (error) {
    if (error instanceof TimelineSequenceConflictError) {
      throwApiError(
        ApiErrorCode.ALREADY_EXISTS,
        "Timeline changed concurrently; retry the operation"
      );
    }
    throw error;
  }
}

// ── clips sub-router input ───────────────────────────────────────────────────

// (defined in protocol; re-used here)

// ── router ──────────────────────────────────────────────────────────────────

export const timelineRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(timelineSequenceListItem))
    .query(async ({ ctx, input }) => {
      const seqs = input.projectId
        ? await TimelineSequence.listByProject(input.projectId, ctx.userId)
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
      // A client-minted id makes create idempotent: a retry (or a second
      // surface racing to create the same sequence) returns the existing row
      // instead of duplicating it.
      if (input.id) {
        const existing = await TimelineSequence.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Timeline sequence not found");
          }
          return existing.toTimelineSequence();
        }
      }

      const seq = new TimelineSequence({
        // Spread rather than `id: input.id` so no `id` key exists when the
        // client didn't supply one — the model only defaults an id it doesn't
        // already own as a property.
        ...(input.id ? { id: input.id } : {}),
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

      // The write CAS-es on this value, so the conflict check and the write are
      // atomic (no TOCTOU window). When the client supplies baseUpdatedAt, honor
      // it; otherwise fall back to the just-loaded updated_at.
      const expectedUpdatedAt = input.baseUpdatedAt ?? seq.updated_at;
      if (
        input.baseUpdatedAt !== undefined &&
        input.baseUpdatedAt !== seq.updated_at
      ) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Timeline has been modified since last load"
        );
      }

      const fields: Parameters<
        typeof TimelineSequence.updateFieldsIfUnchanged
      >[2] = {};
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
            current.markers,
          transcript:
            (input.document.transcript as TimelineDocument["transcript"]) ??
            current.transcript,
          scriptEnabled:
            (input.document.scriptEnabled as
              | TimelineDocument["scriptEnabled"]
              | undefined) ?? current.scriptEnabled
        };
        fields.document = JSON.stringify(merged);
      }

      const updated = await TimelineSequence.updateFieldsIfUnchanged(
        input.id,
        expectedUpdatedAt,
        fields
      );
      if (!updated) {
        // The row changed between load and write (or was deleted). Report a
        // conflict rather than silently overwriting the concurrent change.
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Timeline has been modified since last load"
        );
      }

      if (input.document !== undefined) {
        // Best-effort history: a snapshot that fails must never fail the save
        // the user actually asked for (and the versions table may not exist on
        // an older database).
        try {
          const now = Date.now();
          const last = lastAutosaveVersionTime.get(input.id);
          if (last === undefined || now - last >= AUTOSAVE_VERSION_INTERVAL_MS) {
            recordAutosaveVersion(input.id, now);
            await TimelineSequenceVersion.snapshot(updated, {
              saveType: "autosave"
            });
            await TimelineSequenceVersion.pruneAutosaves(
              input.id,
              MAX_AUTOSAVE_VERSIONS
            );
          }
        } catch {
          // non-fatal — the document write already succeeded
        }
      }

      return updated.toTimelineSequence();
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const seq = await loadOwned(ctx.userId, input.id);
      await seq.delete();
      // Belt-and-braces with the FK cascade: version rows outliving their
      // timeline would be unreachable garbage.
      await TimelineSequenceVersion.deleteForTimeline(input.id);
      lastAutosaveVersionTime.delete(input.id);
      return { ok: true as const };
    }),

  versions: router({
    list: protectedProcedure
      .input(listTimelineVersionsInput)
      .output(z.array(timelineVersionListItem))
      .query(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const versions = await TimelineSequenceVersion.listForTimeline(
          input.id,
          { limit: input.limit, saveType: input.saveType }
        );
        return versions.map(toVersionListItem);
      }),

    get: protectedProcedure
      .input(getTimelineVersionInput)
      .output(timelineVersionResponse)
      .query(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const version = await TimelineSequenceVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Timeline version not found");
        }
        return {
          ...toVersionListItem(version),
          document: parseVersionDocument(version.document)
        };
      }),

    create: protectedProcedure
      .input(createTimelineVersionInput)
      .output(timelineVersionListItem)
      .mutation(async ({ ctx, input }) => {
        const seq = await loadOwned(ctx.userId, input.id);
        const version = await TimelineSequenceVersion.snapshot(seq, {
          saveType: "manual",
          name: input.name ?? null
        });
        return toVersionListItem(version);
      }),

    restore: protectedProcedure
      .input(restoreTimelineVersionInput)
      .output(timelineSequenceResponse)
      .mutation(async ({ ctx, input }) => {
        const seq = await loadOwned(ctx.userId, input.id);
        const version = await TimelineSequenceVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Timeline version not found");
        }

        // Snapshot what is about to be overwritten first, so a restore is
        // itself undoable.
        await TimelineSequenceVersion.snapshot(seq, {
          saveType: "restore",
          name: `Before restore to v${input.version}`
        });

        const document = parseVersionDocument(version.document);
        const updated = await TimelineSequence.updateFieldsIfUnchanged(
          input.id,
          seq.updated_at,
          {
            document: JSON.stringify(document),
            fps: version.fps,
            width: version.width,
            height: version.height,
            duration_ms: version.duration_ms
          }
        );
        if (!updated) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            "Timeline has been modified since last load"
          );
        }
        return updated.toTimelineSequence();
      }),

    delete: protectedProcedure
      .input(deleteTimelineVersionInput)
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const version = await TimelineSequenceVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Timeline version not found");
        }
        await version.delete();
        return { ok: true as const };
      })
  }),

  clips: router({
    create: protectedProcedure
      .input(createClipInput)
      .output(timelineClipResponse)
      .mutation(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);

        // Validate access to the source workflow.
        const source = await Workflow.find(ctx.userId!, input.sourceWorkflowId);
        if (!source) {
          throwApiError(
            ApiErrorCode.NOT_FOUND,
            "Source workflow not found or not accessible"
          );
        }

        const nodes = (source.graph?.nodes ?? []) as Record<string, unknown>[];

        const outputNodes = nodes.filter((n) => isOutputNode(n.type as string));

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
              `selectedOutputNodeId ${input.selectedOutputNodeId} is not a terminal output node in the source graph`
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
        }

        const rawMediaType =
          mediaTypeForOutputNode(selectedOutputNode.type as string) ?? "image";
        const mediaType: "image" | "video" | "audio" | "overlay" =
          input.mediaTypeOverride === "overlay" && rawMediaType === "video"
            ? "overlay"
            : rawMediaType;

        const paramOverrides: Record<string, unknown> = {};
        for (const node of nodes) {
          if (!isInputNode(node.type as string)) continue;
          const name = inputNodeName(node);
          if (name) {
            paramOverrides[name] = inputNodeDefault(node);
          }
        }

        const durationMsInput = nodes.find(
          (n) =>
            isInputNode(n.type as string) && inputNodeName(n) === "duration_ms"
        );
        const durationMs: number =
          (durationMsInput
            ? (inputNodeDefault(durationMsInput) as number | null)
            : null) ??
          DEFAULT_DURATION_MS[mediaType] ??
          4000;

        const workflowUpdatedAt =
          (source.updated_at as string | undefined | null) ??
          new Date().toISOString();
        const dependencyHash = computeDependencyHash({
          workflowId: source.id,
          workflowUpdatedAt,
          paramOverrides,
          inputAssetHashes: [],
          selectedOutputNodeId: selectedOutputNode.id as string
        });

        // Clip name inherits the source workflow's name so users can
        // identify clip origins in the timeline before renaming.
        const clipId = createTimeOrderedUuid();
        const newClip = makeClip({
          id: clipId,
          name: source.name,
          trackId: input.trackId,
          startMs: input.startMs,
          durationMs,
          mediaType,
          sourceType: "generated",
          workflowId: source.id,
          selectedOutputNodeId: selectedOutputNode.id as string,
          paramOverrides,
          dependencyHash,
          status: "draft",
          locked: false,
          versions: []
        });

        const outcome = await mutateTimelineDocument(input.id, (doc) => {
          doc.clips.push(newClip);
        });
        if (!outcome) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Timeline sequence not found");
        }

        return newClip;
      })
  })
});
