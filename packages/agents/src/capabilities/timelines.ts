/**
 * The `timelines` capability module.
 *
 * Seven capabilities that used to be seven `Tool` subclasses: the five version
 * tools (`timeline-version-tools.ts`), the headless editor
 * (`timeline-edit-tools.ts`), and `validate_timeline`, which lived beside the
 * workflow tools in `../tools/mcp-tools.ts`.
 *
 * Wire names, descriptions and schemas are unchanged: a belt builds all seven
 * from `timelines.specs.ts` by name.
 *
 * What was a constructor argument is now a field on the run: the tRPC-only
 * timeline loader `validate_timeline` takes is `run.loaders?.timeline`. Every
 * heavy dependency (`@nodetool-ai/models`, the timeline validator, the eval
 * surface's bridge) is imported inside the implementation that needs it, so
 * loading this module costs nothing.
 *
 * Design: docs/tool-class-retirement-design.md § "Migration".
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type {
  TimelineDocument,
  TimelineSequence,
  TimelineSequenceVersion
} from "@nodetool-ai/models";
import type { TimelineValidation } from "@nodetool-ai/execution/timeline-debug";
import type {
  TimelineBridgeAsset,
  TimelineBridgeFinalState
} from "../evals/surfaces/timeline.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listTimelinesSpec,
  createTimelineSpec,
  getTimelineSpec,
  listTimelineVersionsSpec,
  getTimelineVersionSpec,
  createTimelineVersionSpec,
  restoreTimelineVersionSpec,
  deleteTimelineVersionSpec,
  editTimelineSpec,
  validateTimelineSpec,
  previewTimelineFrameSpec,
  DEFAULT_PREVIEW_COUNT,
  MAX_PREVIEW_TIMES,
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT,
  SAVE_TYPE_PROPERTY,
  LIST_TIMELINES_SCHEMA,
  CREATE_TIMELINE_SCHEMA,
  GET_TIMELINE_SCHEMA,
  LIST_TIMELINE_VERSIONS_SCHEMA,
  GET_TIMELINE_VERSION_SCHEMA,
  CREATE_TIMELINE_VERSION_SCHEMA,
  RESTORE_TIMELINE_VERSION_SCHEMA,
  DELETE_TIMELINE_VERSION_SCHEMA,
  EDIT_TIMELINE_SCHEMA,
  VALIDATE_TIMELINE_SCHEMA,
  deleteTimelineSpec
} from "./timelines.specs.js";
import { isFiniteNumber, isRecord, isString } from "../utils/type-guards.js";

export {
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT,
  SAVE_TYPE_PROPERTY,
  LIST_TIMELINES_SCHEMA,
  CREATE_TIMELINE_SCHEMA,
  GET_TIMELINE_SCHEMA,
  LIST_TIMELINE_VERSIONS_SCHEMA,
  GET_TIMELINE_VERSION_SCHEMA,
  CREATE_TIMELINE_VERSION_SCHEMA,
  RESTORE_TIMELINE_VERSION_SCHEMA,
  DELETE_TIMELINE_VERSION_SCHEMA,
  EDIT_TIMELINE_SCHEMA,
  VALIDATE_TIMELINE_SCHEMA
} from "./timelines.specs.js";
import { resolveProjectId } from "./project-scope.js";

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

async function loadTimeline(
  run: CapabilityRun,
  timelineId: unknown
): Promise<TimelineSequence | ToolError> {
  if (!isString(timelineId) || !timelineId) {
    return {
      error: "timeline_id is required (use list_timelines to find one)."
    };
  }
  const { TimelineSequence } = await import("@nodetool-ai/models");
  const seq = await TimelineSequence.findById(timelineId);
  // A sequence owned by someone else reads as missing — the same rule the tRPC
  // router's ownership check applies.
  if (!seq || seq.user_id !== run.context.userId) {
    return { error: `Timeline ${timelineId} was not found.` };
  }
  return seq;
}

/** The list-item shape the tRPC router returns for a snapshot. */
function toVersionListItem(version: TimelineSequenceVersion) {
  return {
    id: version.id,
    version: version.version,
    name: version.name,
    saveType: version.save_type,
    fps: version.fps,
    width: version.width,
    height: version.height,
    durationMs: version.duration_ms,
    createdAt: version.created_at
  };
}

/**
 * A snapshot's document is JSON text on SQLite and an object on Postgres, so
 * parse only when it is a string. A row that is neither is corrupt, and saying
 * so beats handing back a string the caller will treat as a document.
 */
function parseVersionDocument(raw: unknown): unknown | ToolError {
  if (!isString(raw)) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: "The stored version document is not valid JSON." };
  }
}

/** One-line count of what a validation found. */
function validationSummary(validation: {
  errors: unknown[];
  warnings: unknown[];
}): string {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  if (errors === 0 && warnings === 0) return "No issues found.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function versionNumber(value: unknown): number | ToolError {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return {
      error:
        "version must be a positive integer (use list_timeline_versions to see the available ones)."
    };
  }
  return n;
}

const listTimelines: CapabilityExport = {
  spec: listTimelinesSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { TimelineSequence } = await import("@nodetool-ai/models");
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const query =
      isString(params["query"])
        ? params["query"].trim().toLowerCase()
        : "";
    // Filter after the read: the name filter is not indexed, and the per-user
    // limit is what bounds the scan.
    const rows = await TimelineSequence.listByUser(userId, 100);
    const matching = query
      ? rows.filter((row) => row.name.toLowerCase().includes(query))
      : rows;
    return {
      timelines: matching.slice(0, limit).map((row) => ({
        id: row.id,
        name: row.name,
        project_id: row.project_id,
        fps: row.fps,
        width: row.width,
        height: row.height,
        duration_ms: row.duration_ms,
        updated_at: row.updated_at
      }))
    };
  }
};

/** A positive integer setting, or the default when the caller gave none. */
function sequenceSetting(
  value: unknown,
  fallback: number,
  field: string
): number | ToolError {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `${field} must be a positive number.` };
  }
  return Math.round(n);
}

/**
 * A new, empty sequence.
 *
 * Every other document surface could make one — sketches, scripts,
 * storyboards — and timelines could not, which left "cut these clips
 * together" with two ways in, both wrong: edit the sequence the user happens
 * to have open, or assemble from a storyboard, which builds a timeline only
 * out of media the board itself rendered. A live session did the first, wiped
 * six clips of somebody's work, and had to restore from a snapshot.
 */
const createTimeline: CapabilityExport = {
  spec: createTimelineSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const name = params["name"];
    if (!isString(name) || name.trim() === "") {
      return { error: "name is required and must be a non-empty string." };
    }
    const fps = sequenceSetting(params["fps"], 30, "fps");
    if (isError(fps)) return fps;
    const width = sequenceSetting(params["width"], 1920, "width");
    if (isError(width)) return width;
    const height = sequenceSetting(params["height"], 1080, "height");
    if (isError(height)) return height;
    const projectId = resolveProjectId(run, params);

    const { TimelineSequence } = await import("@nodetool-ai/models");
    const sequence = new TimelineSequence({
      user_id: userId,
      project_id: projectId,
      name: name.trim(),
      fps,
      width,
      height,
      duration_ms: 0,
      document: JSON.stringify({ tracks: [], clips: [], markers: [] })
    });
    await sequence.save();
    return {
      ok: true,
      timeline_id: sequence.id,
      name: sequence.name,
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height,
      project_id: sequence.project_id,
      updated_at: sequence.updated_at
    };
  }
};

const getTimeline: CapabilityExport = {
  spec: getTimelineSpec,
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;
    return { timeline: seq.toTimelineSequence() };
  }
};

const listTimelineVersions: CapabilityExport = {
  spec: listTimelineVersionsSpec,
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;

    const { TimelineSequenceVersion } = await import("@nodetool-ai/models");
    const limit = Math.max(
      1,
      Math.min(
        Number(params["limit"]) || DEFAULT_VERSION_LIMIT,
        MAX_VERSION_LIMIT
      )
    );
    const saveType =
      isString(params["save_type"])
        ? params["save_type"]
        : undefined;
    const versions = await TimelineSequenceVersion.listForTimeline(seq.id, {
      limit,
      saveType
    });
    return {
      timeline_id: seq.id,
      name: seq.name,
      versions: versions.map(toVersionListItem)
    };
  }
};

const getTimelineVersion: CapabilityExport = {
  spec: getTimelineVersionSpec,
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { TimelineSequenceVersion } = await import("@nodetool-ai/models");
    const version = await TimelineSequenceVersion.findByVersion(seq.id, number);
    if (!version) {
      return {
        error: `Timeline ${seq.id} has no version ${number}. Call list_timeline_versions to see the available ones.`
      };
    }

    const document = parseVersionDocument(version.document);
    if (isError(document)) return document;

    return {
      timeline_id: seq.id,
      ...toVersionListItem(version),
      document
    };
  }
};

const createTimelineVersion: CapabilityExport = {
  spec: createTimelineVersionSpec,
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;

    const { TimelineSequenceVersion } = await import("@nodetool-ai/models");
    const name =
      isString(params["name"]) && params["name"]
        ? params["name"]
        : null;
    const version = await TimelineSequenceVersion.snapshot(seq, {
      saveType: "manual",
      name
    });
    return {
      ok: true,
      timeline_id: seq.id,
      ...toVersionListItem(version)
    };
  }
};

const restoreTimelineVersion: CapabilityExport = {
  spec: restoreTimelineVersionSpec,
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { TimelineSequence, TimelineSequenceVersion } =
      await import("@nodetool-ai/models");
    const version = await TimelineSequenceVersion.findByVersion(seq.id, number);
    if (!version) {
      return {
        error: `Timeline ${seq.id} has no version ${number}. Call list_timeline_versions to see the available ones.`
      };
    }

    const document = parseVersionDocument(version.document);
    if (isError(document)) return document;

    // Snapshot what is about to be overwritten first, so a restore is itself
    // undoable.
    const undo = await TimelineSequenceVersion.snapshot(seq, {
      saveType: "restore",
      name: `Before restore to v${number}`
    });

    let updated: TimelineSequence | null;
    try {
      updated = await TimelineSequence.updateFieldsIfUnchanged(
        seq.id,
        seq.updated_at,
        {
          document: JSON.stringify(document),
          fps: version.fps,
          width: version.width,
          height: version.height,
          duration_ms: version.duration_ms
        }
      );
    } catch (error) {
      // The write rejects a document without tracks/clips/markers arrays. That
      // is a snapshot too old or too broken to restore, not a failed call.
      return {
        error: `Version ${number} of timeline ${seq.id} cannot be restored: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undo_version: undo.version
      };
    }
    if (!updated) {
      return {
        error: `Timeline ${seq.id} was modified since it was read (optimistic concurrency conflict); nothing was restored. Retry the call.`,
        undo_version: undo.version
      };
    }

    const { validateTimelineSequence } =
      await import("@nodetool-ai/execution/timeline-debug");
    const validation: TimelineValidation = validateTimelineSequence(document, {
      fps: version.fps,
      width: version.width,
      height: version.height
    });

    return {
      ok: true,
      timeline_id: seq.id,
      restored_version: number,
      undo_version: undo.version,
      fps: updated.fps,
      width: updated.width,
      height: updated.height,
      duration_ms: updated.duration_ms,
      updated_at: updated.updated_at,
      validation,
      summary: validationSummary(validation)
    };
  }
};

const deleteTimelineVersion: CapabilityExport = {
  spec: deleteTimelineVersionSpec,
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { TimelineSequenceVersion } = await import("@nodetool-ai/models");
    const version = await TimelineSequenceVersion.findByVersion(seq.id, number);
    if (!version) {
      return {
        error: `Timeline ${seq.id} has no version ${number}. Call list_timeline_versions to see the available ones.`
      };
    }
    await version.delete();
    return {
      ok: true,
      timeline_id: seq.id,
      deleted_version: number
    };
  }
};

// ---------------------------------------------------------------------------
// edit_timeline
// ---------------------------------------------------------------------------

/** Attempts to land the document write before reporting a conflict. */
const CAS_ATTEMPTS = 2;
/** Operations one call may apply, so a runaway script cannot rewrite a cut. */
const MAX_OPS = 60;

const TOOL_PREFIX = "ui_timeline_";

/** Tools the bridge exposes that this surface must not offer headlessly. */
const EXCLUDED_OPS = new Set([
  `${TOOL_PREFIX}get_clip_frames`,
  `${TOOL_PREFIX}generate_clip`
]);

/** `add_track`, `ui_add_track`, and `ui_timeline_add_track` all name one tool. */
function normalizeOpName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith(TOOL_PREFIX)) return trimmed;
  const bare = trimmed.startsWith("ui_")
    ? trimmed.slice("ui_".length)
    : trimmed;
  return `${TOOL_PREFIX}${bare}`;
}

interface ParsedOp {
  op: string;
  input: Record<string, unknown>;
}

/** An op is `{op, ...args}` — the arguments sit alongside the verb. */
function parseOps(raw: unknown): ParsedOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_track", "type": "audio"}].'
    };
  }
  if (raw.length > MAX_OPS) {
    return {
      error: `ops holds ${raw.length} entries; at most ${MAX_OPS} per call.`
    };
  }
  const parsed: ParsedOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...input } = entry as Record<string, unknown>;
    if (!isString(op) || op.trim() === "") {
      return { error: `ops[${index}] has no \`op\` name.` };
    }
    parsed.push({ op: normalizeOpName(op), input });
  }
  return parsed;
}

interface OpRecord {
  op: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface ApplyOutcome {
  records: OpRecord[];
  state: TimelineBridgeFinalState;
}

/**
 * Read one of the caller's assets for `add_media_clip`.
 *
 * The ref a model has in hand is whatever `list_assets` printed — a bare id or
 * an `asset://<id>.<ext>` URI — so both resolve here.
 */
async function resolveTimelineAsset(
  run: CapabilityRun,
  ref: string
): Promise<TimelineBridgeAsset | null> {
  const id = ref.startsWith("asset://")
    ? ref.slice("asset://".length).replace(/\.[A-Za-z0-9]{1,8}$/, "")
    : ref;
  if (!id) return null;
  const userId = run.context.userId;
  if (!userId) return null;
  const { Asset } = await import("@nodetool-ai/models");
  // `find` is already user-scoped: someone else's asset reads as missing.
  const asset = await Asset.find(userId, id);
  if (!asset) return null;
  const thumbnails = isRecord(asset.metadata)
    ? asset.metadata["thumbnails"]
    : undefined;
  const thumbnailAssetId =
    Array.isArray(thumbnails) && isString(thumbnails[0])
      ? thumbnails[0]
      : undefined;
  const resolved: TimelineBridgeAsset = {
    id: asset.id,
    name: asset.name,
    contentType: asset.content_type
  };
  // `duration` is seconds and often null — assets are catalogued without
  // probing. The bridge falls back to its own default when it is missing.
  if (isFiniteNumber(asset.duration) && asset.duration > 0) {
    resolved.durationMs = Math.round(asset.duration * 1000);
  }
  if (thumbnailAssetId) resolved.thumbnailAssetId = thumbnailAssetId;
  return resolved;
}

/**
 * Run `ops` against a bridge seeded from `document`.
 *
 * A failing op is recorded and the script continues: stopping at the first
 * error hides every problem behind it, and the caller wants the whole picture.
 */
async function applyOps(
  run: CapabilityRun,
  sequence: TimelineSequence,
  document: TimelineDocument,
  ops: ParsedOp[]
): Promise<ApplyOutcome> {
  const { createTimelineToolBridge } =
    await import("../evals/surfaces/timeline.js");
  const bridge = createTimelineToolBridge({
    sequence: {
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height,
      tracks: document.tracks,
      clips: document.clips
    },
    resolveAsset: (ref) => resolveTimelineAsset(run, ref)
  });
  const byName = new Map(
    bridge.tools
      .filter((tool) => !EXCLUDED_OPS.has(tool.name))
      .map((tool) => [tool.name, tool])
  );

  const records: OpRecord[] = [];
  for (const { op, input } of ops) {
    const tool = byName.get(op);
    if (!tool) {
      const known = [...byName.keys()]
        .map((name) => name.slice(TOOL_PREFIX.length))
        .sort()
        .join(", ");
      records.push({
        op,
        ok: false,
        error: `No timeline operation named "${op.slice(TOOL_PREFIX.length)}". Available: ${known}.`
      });
      continue;
    }
    try {
      records.push({ op, ok: true, result: await tool.execute(input) });
    } catch (e) {
      records.push({
        op,
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  return { records, state: bridge.finalState() };
}

const TIMELINE_OP_ID_KEYS = ["id", "target", "clip_id", "track_id"] as const;

function resolveNamedUnit(
  value: string,
  clips: { id: string; name: string }[],
  tracks: { id: string; name: string }[]
): string {
  const lower = value.toLowerCase();
  const clip =
    clips.find((c) => c.id === value) ??
    clips.find((c) => c.name.toLowerCase() === lower);
  if (clip) return clip.id;
  const track =
    tracks.find((t) => t.id === value) ??
    tracks.find((t) => t.name.toLowerCase() === lower);
  if (track) return track.id;
  return value;
}

/**
 * The unit ids one op's result names.
 *
 * The bridge answers `{ok, clip}`, `{ok, track}`, `{ok, clips}` (a split),
 * `{ok, deleted}` (a delete) or `{ok, selected}` — never a bare `id`, which
 * is why reading `result.id` alone left every `"selected"` target unresolved.
 */
export function resultUnitIds(result: unknown): string[] {
  if (!isRecord(result)) return [];
  const ids: string[] = [];
  const push = (value: unknown): void => {
    if (isRecord(value) && isString(value["id"])) ids.push(value["id"]);
  };
  for (const key of ["clip", "track", "deleted", "selected"]) {
    push(result[key]);
  }
  const clips = result["clips"];
  if (Array.isArray(clips)) {
    for (const clip of clips) push(clip);
  }
  if (isString(result["id"])) ids.push(result["id"]);
  return ids;
}

/**
 * Canonicalize one op input for the `resource_change` broadcast: names and
 * `"selected"` become ids, and an op that created something carries the id it
 * created. Without that stamp an editor merging this write cannot tell which
 * unit an `add_track` touched and falls back to contesting every unit that
 * happens to have drifted.
 */
export function resolveTimelineOpInput(
  input: Record<string, unknown>,
  before: TimelineDocument,
  state: TimelineBridgeFinalState,
  result: unknown
): Record<string, unknown> {
  const clips = [
    ...before.clips.map((c) => ({ id: c.id, name: c.name })),
    ...state.clips
  ];
  const tracks = [
    ...before.tracks.map((t) => ({ id: t.id, name: t.name })),
    ...state.tracks
  ];
  const resultIds = resultUnitIds(result);
  const next = { ...input };
  for (const key of TIMELINE_OP_ID_KEYS) {
    const value = next[key];
    if (typeof value !== "string" || value.length === 0) continue;
    if (value.toLowerCase() === "selected") {
      if (resultIds[0]) next[key] = resultIds[0];
      continue;
    }
    next[key] = resolveNamedUnit(value, clips, tracks);
  }
  // An op that named no unit either created one or addressed the selection;
  // the result says which, so stamp it.
  if (next["id"] === undefined && resultIds.length > 0) {
    next["id"] = resultIds.length === 1 ? resultIds[0] : resultIds;
  }
  return next;
}

const editTimeline: CapabilityExport = {
  spec: editTimelineSpec,
  impl: async (run, params) => {
    const timelineId = params["timeline_id"];
    if (!isString(timelineId) || !timelineId) {
      return {
        error: "timeline_id is required (use list_timelines to find one)."
      };
    }
    const ops = parseOps(params["ops"]);
    if (isError(ops)) return ops;

    const { TimelineSequence } = await import("@nodetool-ai/models");
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const sequence = await TimelineSequence.findById(timelineId);
      // A sequence owned by someone else reads as missing — the rule the tRPC
      // router's ownership check applies.
      if (!sequence || sequence.user_id !== run.context.userId) {
        return { error: `Timeline ${timelineId} was not found.` };
      }
      const document = sequence.toDocument();
      const { records, state } = await applyOps(run, sequence, document, ops);

      // Markers and the transcript ride along untouched: no timeline operation
      // edits them, so the stored copies stay authoritative.
      const next: TimelineDocument = {
        ...document,
        tracks: state.documentTracks,
        clips: state.documentClips
      };
      const saved = await TimelineSequence.updateDocumentIfUnchanged(
        timelineId,
        sequence.updated_at,
        next,
        {
          ops: ops.map((parsed, index) => ({
            tool: parsed.op,
            input: resolveTimelineOpInput(
              parsed.input,
              document,
              state,
              records[index]?.result
            )
          }))
        }
      );
      if (!saved) continue;

      const failed = records.filter((record) => !record.ok);
      return {
        timeline_id: timelineId,
        updated_at: saved.updated_at,
        applied: records.length - failed.length,
        failed: failed.length,
        ops: records,
        tracks: state.tracks,
        clips: state.clips.map((clip) => ({
          id: clip.id,
          name: clip.name,
          track_id: clip.trackId,
          media_type: clip.mediaType,
          start_ms: clip.startMs,
          duration_ms: clip.durationMs,
          animations: clip.animations
        }))
      };
    }

    return {
      error: `Timeline ${timelineId} is being modified concurrently; nothing was saved. Retry the call.`
    };
  }
};

// ---------------------------------------------------------------------------
// validate_timeline
// ---------------------------------------------------------------------------

/** A positive finite number from a tool param, or undefined. */
function numberParam(value: unknown): number | undefined {
  return isFiniteNumber(value) && value > 0
    ? value
    : undefined;
}

/** Unwrap a stored document that may still be JSON text. */
function parseStoredDocument(document: unknown): unknown {
  if (!isString(document)) return document;
  try {
    return JSON.parse(document);
  } catch {
    return undefined;
  }
}

const validateTimeline: CapabilityExport = {
  spec: validateTimelineSpec,
  // The timeline API is tRPC-only, so there is no REST route to fall back on:
  // a host that wants the `timeline_id` path puts a loader on the run. Without
  // one this still validates inline documents.
  impl: async (run, params) => {
    const inline = params["document"];
    const timelineId = params["timeline_id"] as string | undefined;

    let document = inline;
    // An inline document carries no stored render settings, so the caller
    // supplies them; the timeline_id path overwrites these from the row.
    let meta: { fps?: number; width?: number; height?: number } = {
      fps: numberParam(params["fps"]),
      width: numberParam(params["width"]),
      height: numberParam(params["height"])
    };
    let name: string | undefined;

    if (document === undefined && timelineId) {
      const loadRow = run.loaders?.timeline;
      if (!loadRow) {
        return {
          error:
            "Cannot load a saved timeline in this process: no timeline loader is available. Pass the document inline as `document`, or call this tool from a server-side context.",
          validated: false
        };
      }
      const record = await loadRow(run.context, timelineId);
      if (!record) {
        return {
          error: `Timeline ${timelineId} was not found.`,
          validated: false
        };
      }
      document = parseStoredDocument(record.document);
      meta = { fps: record.fps, width: record.width, height: record.height };
      name = record.name;
    }

    if (document === undefined || document === null) {
      return {
        error:
          "No timeline to validate — pass an inline `document` ({tracks, clips, markers}) or a valid `timeline_id`."
      };
    }

    const { validateTimelineSequence } =
      await import("@nodetool-ai/execution/timeline-debug");
    const validation = validateTimelineSequence(document, meta);
    const report: typeof validation & {
      timeline_id?: string;
      name?: string;
      summary: string;
    } = { ...validation, summary: validationSummary(validation) };
    if (timelineId) report.timeline_id = timelineId;
    if (name) report.name = name;
    return report;
  }
};

/**
 * The timecodes to render when the caller names none: evenly spaced across the
 * sequence, avoiding both ends — the first and last frame of a cut are the two
 * least informative places to look.
 */
function evenlySpacedTimes(durationMs: number, count: number): number[] {
  const span = Math.max(1, durationMs);
  return Array.from({ length: count }, (_, i) =>
    Math.round((span * (i + 1)) / (count + 1))
  );
}

/** The timecodes a `preview_timeline_frame` call asks for. */
function requestedTimes(
  params: Record<string, unknown>,
  durationMs: number
): number[] | ToolError {
  const raw = params["times_ms"];
  if (raw === undefined || raw === null) {
    const count = Math.max(
      1,
      Math.min(
        MAX_PREVIEW_TIMES,
        Math.round(Number(params["count"]) || DEFAULT_PREVIEW_COUNT)
      )
    );
    return evenlySpacedTimes(durationMs, count);
  }
  if (!Array.isArray(raw)) {
    return { error: "times_ms must be an array of milliseconds." };
  }
  if (raw.length === 0) {
    return { error: "times_ms was empty — omit it to sample evenly instead." };
  }
  if (raw.length > MAX_PREVIEW_TIMES) {
    return {
      error: `times_ms holds ${raw.length} timecodes; at most ${MAX_PREVIEW_TIMES} render per call.`
    };
  }
  const times: number[] = [];
  for (const value of raw) {
    if (!isFiniteNumber(value) || value < 0) {
      return {
        error: `times_ms must hold non-negative numbers; got ${JSON.stringify(value)}.`
      };
    }
    times.push(value);
  }
  return times;
}

/**
 * Render the composited frame at chosen timecodes.
 *
 * Frames are persisted as assets and returned as handles, not as pixels: this
 * follows the rule `view_image` exists for — a tool that produces an image
 * hands back a reference, and the model pulls the pixels into context only for
 * the frame it decides to look at. Three frames of inline base64 would be in
 * every subsequent turn of the conversation whether or not they were read.
 */
const previewTimelineFrame: CapabilityExport = {
  spec: previewTimelineFrameSpec,
  impl: async (run, params) => {
    const timelineId = params["timeline_id"];
    const inline = params["document"];

    let document: unknown = inline;
    let meta = {
      fps: numberParam(params["fps"]) ?? 30,
      width: numberParam(params["width_px"]) ?? 1920,
      height: numberParam(params["height_px"]) ?? 1080
    };
    let durationMs = 0;
    let name = "Inline timeline";

    if (document === undefined || document === null) {
      const seq = await loadTimeline(run, timelineId);
      if (isError(seq)) return seq;
      const resolved = seq.toTimelineSequence();
      document = resolved;
      meta = { fps: resolved.fps, width: resolved.width, height: resolved.height };
      durationMs = resolved.durationMs;
      name = resolved.name;
    }

    if (!isRecord(document)) {
      return {
        error:
          "No timeline to render — pass an inline `document` ({tracks, clips, markers}) or a valid `timeline_id`."
      };
    }

    const tracks = Array.isArray(document["tracks"]) ? document["tracks"] : [];
    const clips = Array.isArray(document["clips"]) ? document["clips"] : [];
    if (clips.length === 0) {
      return {
        error: `${name} has no clips to render.`,
        timeline_id: isString(timelineId) ? timelineId : undefined
      };
    }
    if (durationMs <= 0) {
      // An inline document carries no stored duration, so derive it from the
      // clips: the end of the last one is the end of the cut.
      durationMs = clips.reduce((end: number, clip: unknown) => {
        if (!isRecord(clip)) return end;
        const start = Number(clip["startMs"]) || 0;
        const length = Number(clip["durationMs"]) || 0;
        return Math.max(end, start + length);
      }, 0);
    }

    const times = requestedTimes(params, durationMs);
    if (isError(times)) return times;

    const { renderTimelineFrames } = await import(
      "../timeline-preview/frames.js"
    );
    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    const { persistOutput } = await import("../tools/asset-persist.js");

    let result;
    try {
      result = await renderTimelineFrames({
        sequence: {
          ...(document as object),
          tracks,
          clips,
          fps: meta.fps,
          width: meta.width,
          height: meta.height,
          durationMs
        } as Parameters<typeof renderTimelineFrames>[0]["sequence"],
        timesMs: times,
        width: numberParam(params["width"]),
        loadAsset: (assetId) =>
          loadMediaRefBytes(
            { uri: `asset://${assetId}`, asset_id: assetId },
            run.context
          )
      });
    } catch (error) {
      return {
        error: `Could not render the timeline: ${
          error instanceof Error ? error.message : String(error)
        }`
      };
    }

    const frames = [];
    for (const frame of result.frames) {
      const saved = await persistOutput(run.context, frame.png, {
        namePrefix: "timeline-frame",
        mime: "image/png"
      });
      frames.push({
        time_ms: frame.time_ms,
        width: frame.width,
        height: frame.height,
        image: {
          type: "image",
          asset_id: saved.asset_id,
          asset_uri: saved.asset_uri,
          uri: saved.asset_uri ?? saved.path,
          path: saved.path,
          mime_type: saved.mime_type,
          bytes: saved.bytes
        },
        layers: frame.layers
      });
    }

    return {
      timeline_id: isString(timelineId) ? timelineId : undefined,
      name,
      fps: meta.fps,
      sequence_width: meta.width,
      sequence_height: meta.height,
      duration_ms: durationMs,
      frames,
      effects_not_applied: result.effectsNotApplied,
      hint:
        "Call view_image with a frame's asset_id to see it. The layers are " +
        "listed top of the stack first — the first one covers the rest."
    };
  }
};

/** Every timeline capability, in the order the tool files declared them. */
/**
 * Delete a timeline sequence the caller owns.
 *
 * The ownership check and the version cascade are `TimelineSequence.deleteOwned`, the
 * same function the tRPC route calls — a delete is not a place for two copies
 * of one rule, and version rows outliving their document would be unreachable
 * garbage. Missing and not-yours are one answer.
 */
const deleteTimeline: CapabilityExport = {
  spec: deleteTimelineSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { TimelineSequence } = await import("@nodetool-ai/models");
    const id = String(params["timeline_id"]);
    const deleted = await TimelineSequence.deleteOwned(userId, id);
    return deleted
      ? { timeline_id: id, deleted: true }
      : { error: `Timeline sequence ${id} was not found, or it is not yours.` };
  }
};
export const TIMELINE_CAPABILITIES: readonly CapabilityExport[] = [
  listTimelines,
  createTimeline,
  getTimeline,
  listTimelineVersions,
  getTimelineVersion,
  createTimelineVersion,
  restoreTimelineVersion,
  deleteTimelineVersion,
  editTimeline,
  validateTimeline,
  previewTimelineFrame,
  deleteTimeline
];

export const module: CapabilityModule = {
  module: "timelines",
  exports: TIMELINE_CAPABILITIES
};

export {
  listTimelines,
  createTimeline,
  getTimeline,
  listTimelineVersions,
  getTimelineVersion,
  createTimelineVersion,
  restoreTimelineVersion,
  deleteTimelineVersion,
  editTimeline,
  validateTimeline,
  previewTimelineFrame,
  deleteTimeline
};
