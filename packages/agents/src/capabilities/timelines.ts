/**
 * The `timelines` capability module.
 *
 * Seven capabilities that used to be seven `Tool` subclasses: the five version
 * tools (`../tools/timeline-version-tools.ts`), the headless editor
 * (`../tools/timeline-edit-tools.ts`), and `validate_timeline`, which lived
 * beside the workflow tools in `../tools/mcp-tools.ts`.
 *
 * Wire names, descriptions and schemas are unchanged: the old classes survive
 * as thin `CapabilityTool` subclasses over these implementations, so
 * `BUILTIN_TOOL_CLASSES` and every belt that names them keep working.
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
import type { TimelineBridgeFinalState } from "../evals/surfaces/timeline.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";

/** Versions one call may return, so a long history cannot flood the context. */
const DEFAULT_VERSION_LIMIT = 20;
const MAX_VERSION_LIMIT = 100;

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

async function loadTimeline(
  run: CapabilityRun,
  timelineId: unknown
): Promise<TimelineSequence | ToolError> {
  if (typeof timelineId !== "string" || !timelineId) {
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
  if (typeof raw !== "string") return raw;
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

const SAVE_TYPE_PROPERTY = {
  type: "string" as const,
  enum: ["manual", "autosave", "restore"],
  description:
    "Only versions of this kind: 'manual' (a save someone asked for), " +
    "'autosave' (taken on a document write), 'restore' (the pre-restore " +
    "snapshot). Omit for all of them."
};

// ---------------------------------------------------------------------------
// list_timelines
// ---------------------------------------------------------------------------

const LIST_TIMELINES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Only timelines whose name contains this text (case-insensitive)."
    },
    limit: {
      type: "number",
      description: "Max timelines to return (default 20)."
    }
  }
};

const listTimelines: CapabilityExport = {
  spec: {
    name: "list_timelines",
    description:
      "List the caller's timeline sequences, most recently updated first: id, " +
      "name, frame rate, resolution, duration, and when it last changed. Start " +
      "here when the user names a timeline but not its id.",
    inputSchema: LIST_TIMELINES_SCHEMA,
    category: "read",
    userMessage: () => "Listing timelines"
  },
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { TimelineSequence } = await import("@nodetool-ai/models");
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const query =
      typeof params["query"] === "string"
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

// ---------------------------------------------------------------------------
// list_timeline_versions
// ---------------------------------------------------------------------------

const LIST_TIMELINE_VERSIONS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    save_type: SAVE_TYPE_PROPERTY,
    limit: {
      type: "number",
      description: `Max versions to return (default ${DEFAULT_VERSION_LIMIT}, max ${MAX_VERSION_LIMIT}).`
    }
  },
  required: ["timeline_id"]
};

const listTimelineVersions: CapabilityExport = {
  spec: {
    name: "list_timeline_versions",
    description:
      "List a timeline sequence's snapshots, newest first: version number, " +
      "name, save type ('manual', 'autosave', 'restore'), render settings, and " +
      "when it was taken. Call this before restoring — restore_timeline_version " +
      "addresses a snapshot by its version number.",
    inputSchema: LIST_TIMELINE_VERSIONS_SCHEMA,
    category: "read",
    userMessage: (params) =>
      `Listing versions of timeline ${String(params["timeline_id"])}`
  },
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
      typeof params["save_type"] === "string"
        ? (params["save_type"] as string)
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

// ---------------------------------------------------------------------------
// get_timeline_version
// ---------------------------------------------------------------------------

const GET_TIMELINE_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    version: {
      type: "number",
      description: "Version number to read, from list_timeline_versions."
    }
  },
  required: ["timeline_id", "version"]
};

const getTimelineVersion: CapabilityExport = {
  spec: {
    name: "get_timeline_version",
    description:
      "Read one snapshot of a timeline sequence without restoring it: the " +
      "version's metadata plus the full document it stored. Use this to inspect " +
      "or compare versions before deciding which one to restore.",
    inputSchema: GET_TIMELINE_VERSION_SCHEMA,
    category: "read",
    userMessage: (params) =>
      `Reading v${String(params["version"])} of timeline ${String(params["timeline_id"])}`
  },
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

// ---------------------------------------------------------------------------
// create_timeline_version
// ---------------------------------------------------------------------------

const CREATE_TIMELINE_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    name: {
      type: "string",
      description: "Label for the snapshot, e.g. 'before the recut'."
    }
  },
  required: ["timeline_id"]
};

const createTimelineVersion: CapabilityExport = {
  spec: {
    name: "create_timeline_version",
    description:
      "Snapshot a timeline sequence's current document as a manual version, so " +
      "it can be restored later. Manual snapshots are never pruned (autosaves " +
      "are), so take one before an edit the user may want undone. Returns the " +
      "new version's number.",
    inputSchema: CREATE_TIMELINE_VERSION_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Snapshotting timeline ${String(params["timeline_id"])}`
  },
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;

    const { TimelineSequenceVersion } = await import("@nodetool-ai/models");
    const name =
      typeof params["name"] === "string" && params["name"]
        ? (params["name"] as string)
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

// ---------------------------------------------------------------------------
// restore_timeline_version
// ---------------------------------------------------------------------------

const RESTORE_TIMELINE_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    version: {
      type: "number",
      description: "Version number to restore, from list_timeline_versions."
    }
  },
  required: ["timeline_id", "version"]
};

const restoreTimelineVersion: CapabilityExport = {
  spec: {
    name: "restore_timeline_version",
    description:
      "Roll a timeline sequence's document and render settings back to one of " +
      "its snapshots, addressed by version number (from " +
      "list_timeline_versions). The state being overwritten is snapshotted " +
      "first, so the restore is itself undoable — restore that snapshot to come " +
      "back. An old document is restored against today's schema, so the result " +
      "is validated afterwards and the findings are returned with it.",
    inputSchema: RESTORE_TIMELINE_VERSION_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Restoring timeline ${String(params["timeline_id"])} to v${String(params["version"])}`
  },
  impl: async (run, params) => {
    const seq = await loadTimeline(run, params["timeline_id"]);
    if (isError(seq)) return seq;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { TimelineSequence, TimelineSequenceVersion } = await import(
      "@nodetool-ai/models"
    );
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

    const { validateTimelineSequence } = await import(
      "@nodetool-ai/execution/timeline-debug"
    );
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

// ---------------------------------------------------------------------------
// edit_timeline
// ---------------------------------------------------------------------------

/** Attempts to land the document write before reporting a conflict. */
const CAS_ATTEMPTS = 5;
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
  const bare = trimmed.startsWith("ui_") ? trimmed.slice("ui_".length) : trimmed;
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
    return { error: `ops holds ${raw.length} entries; at most ${MAX_OPS} per call.` };
  }
  const parsed: ParsedOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...input } = entry as Record<string, unknown>;
    if (typeof op !== "string" || op.trim() === "") {
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
 * Run `ops` against a bridge seeded from `document`.
 *
 * A failing op is recorded and the script continues: stopping at the first
 * error hides every problem behind it, and the caller wants the whole picture.
 */
async function applyOps(
  sequence: TimelineSequence,
  document: TimelineDocument,
  ops: ParsedOp[]
): Promise<ApplyOutcome> {
  const { createTimelineToolBridge } = await import(
    "../evals/surfaces/timeline.js"
  );
  const bridge = createTimelineToolBridge({
    sequence: {
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height,
      tracks: document.tracks,
      clips: document.clips
    }
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
      records.push({ op, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { records, state: bridge.finalState() };
}

const EDIT_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: { type: "string", description: "Timeline sequence id." },
    ops: {
      type: "array",
      description:
        'Operations in order. Each is {"op": <name>, ...arguments}, e.g. ' +
        '{"op": "add_track", "type": "audio", "name": "Music"} or ' +
        '{"op": "animate_clip", "target": "Title", "animations": [{"role": "in", "preset": "fade"}]}. ' +
        "Ops: get_state, add_track, add_text_clip, add_shape_clip, " +
        "split_clip, trim_clip, move_clip, duplicate_clip, delete_clip, " +
        "set_clip_params, set_clip_binding, animate_clip, clear_animations, " +
        "list_animation_presets, select_clip, seek. Start with get_state to " +
        "read track and clip ids.",
      items: { type: "object" }
    }
  },
  required: ["timeline_id", "ops"]
};

const editTimeline: CapabilityExport = {
  spec: {
    name: "edit_timeline",
    description:
      "Edit a saved timeline sequence headlessly: add tracks, add text and " +
      "shape clips, split, trim, move, duplicate and delete clips, set clip " +
      "params and workflow bindings, and animate clips with presets. Pass a " +
      "list of operations; they run in order against the stored document and " +
      "the result is saved. An open editor picks the change up live. Call " +
      "list_timelines to find a sequence and validate_timeline afterwards. " +
      "Use render_storyboard_clips or a workflow run to generate media — this " +
      "tool authors the cut, it does not render.",
    inputSchema: EDIT_TIMELINE_SCHEMA,
    category: "write",
    userMessage: (params) => {
      const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
      return `Editing timeline ${String(params["timeline_id"])} (${count} ops)`;
    }
  },
  impl: async (run, params) => {
    const timelineId = params["timeline_id"];
    if (typeof timelineId !== "string" || !timelineId) {
      return { error: "timeline_id is required (use list_timelines to find one)." };
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
      const { records, state } = await applyOps(sequence, document, ops);

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
        next
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
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Unwrap a stored document that may still be JSON text. */
function parseStoredDocument(document: unknown): unknown {
  if (typeof document !== "string") return document;
  try {
    return JSON.parse(document);
  } catch {
    return undefined;
  }
}

const VALIDATE_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "The ID of a saved timeline sequence to validate"
    },
    document: {
      type: "object",
      description:
        "Inline TimelineDocument to validate ({ tracks, clips, markers }). " +
        "Takes precedence over timeline_id."
    },
    fps: {
      type: "number",
      description:
        "Frame rate the inline document renders at (default 30). Timing " +
        "checks are frame-based, so a document authored at another fps " +
        "validates against the wrong grid without this. Ignored for timeline_id."
    },
    width: {
      type: "number",
      description:
        "Render width of the inline document. Ignored for timeline_id."
    },
    height: {
      type: "number",
      description:
        "Render height of the inline document. Ignored for timeline_id."
    }
  }
};

const validateTimeline: CapabilityExport = {
  spec: {
    name: "validate_timeline",
    description:
      "Statically validate a timeline sequence WITHOUT rendering or playing it: " +
      "clips on tracks the document lacks, duplicate ids, overlapping clips, " +
      "fades and transitions longer than the clip, in/out points that cannot " +
      "render, unknown animation presets, incomplete bindings, and fields a " +
      "schema round trip would strip. Pass an inline `document` to check one you " +
      "are building, or `timeline_id` to validate a saved sequence. Run it after " +
      "timeline edits and before rendering.",
    inputSchema: VALIDATE_TIMELINE_SCHEMA,
    category: "read",
    userMessage: (params) =>
      params["timeline_id"]
        ? `Validating timeline ${params["timeline_id"]}`
        : "Validating timeline document"
  },
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

    const { validateTimelineSequence } = await import(
      "@nodetool-ai/execution/timeline-debug"
    );
    const validation = validateTimelineSequence(document, meta);
    return {
      ...validation,
      ...(timelineId ? { timeline_id: timelineId } : {}),
      ...(name ? { name } : {}),
      summary: validationSummary(validation)
    };
  }
};

/** Every timeline capability, in the order the tool files declared them. */
export const TIMELINE_CAPABILITIES: readonly CapabilityExport[] = [
  listTimelines,
  listTimelineVersions,
  getTimelineVersion,
  createTimelineVersion,
  restoreTimelineVersion,
  editTimeline,
  validateTimeline
];

export const module: CapabilityModule = {
  module: "timelines",
  exports: TIMELINE_CAPABILITIES
};

export {
  listTimelines,
  listTimelineVersions,
  getTimelineVersion,
  createTimelineVersion,
  restoreTimelineVersion,
  editTimeline,
  validateTimeline
};
