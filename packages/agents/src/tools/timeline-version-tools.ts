/**
 * Timeline version tools — snapshot history for a timeline sequence, headlessly.
 *
 * A sequence keeps immutable snapshots: manual saves, the autosaves a document
 * write takes at most every five minutes, and the pre-restore snapshot that
 * makes a restore undoable. Reading and moving through that history was
 * tRPC-only, so an agent outside the browser could not roll a cut back to a
 * version the user liked, or pin the current state before a risky recut.
 *
 *   list_timelines          — find a sequence to work on
 *   list_timeline_versions  — its snapshots, newest first
 *   get_timeline_version    — read one snapshot's document without restoring
 *   create_timeline_version — pin the current state as a manual snapshot
 *   restore_timeline_version — roll the sequence back to one
 *
 * The restore mirrors `timeline.versions.restore`: it snapshots what is about
 * to be overwritten, then compare-and-swaps the old document and render
 * settings back onto the row. An old document is restored against today's
 * schema, so what it used to pass is not what it passes now — the restore ends
 * with `validateTimelineSequence` over the result, the same check
 * `validate_timeline` and the CLI's `timeline versions restore` make.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { TimelineSequence, TimelineSequenceVersion } from "@nodetool-ai/models";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import type { TimelineValidation } from "@nodetool-ai/execution/timeline-debug";
import { Tool } from "./base-tool.js";

/** Versions one call may return, so a long history cannot flood the context. */
const DEFAULT_VERSION_LIMIT = 20;
const MAX_VERSION_LIMIT = 100;

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

async function loadTimeline(
  context: ProcessingContext,
  timelineId: unknown
): Promise<TimelineSequence | ToolError> {
  if (typeof timelineId !== "string" || !timelineId) {
    return {
      error: "timeline_id is required (use list_timelines to find one)."
    };
  }
  const seq = await TimelineSequence.findById(timelineId);
  // A sequence owned by someone else reads as missing — the same rule the tRPC
  // router's ownership check applies.
  if (!seq || seq.user_id !== context.userId) {
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

/** One-line count of what the post-restore validation found. */
function validationSummary(validation: TimelineValidation): string {
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

export class ListTimelinesTool extends Tool {
  readonly name = "list_timelines";
  readonly description =
    "List the caller's timeline sequences, most recently updated first: id, " +
    "name, frame rate, resolution, duration, and when it last changed. Start " +
    "here when the user names a timeline but not its id.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description:
          "Only timelines whose name contains this text (case-insensitive)."
      },
      limit: {
        type: "number" as const,
        description: "Max timelines to return (default 20)."
      }
    }
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!context.userId) return { error: "No user is bound to this session." };
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const query =
      typeof params["query"] === "string"
        ? params["query"].trim().toLowerCase()
        : "";
    // Filter after the read: the name filter is not indexed, and the per-user
    // limit is what bounds the scan.
    const rows = await TimelineSequence.listByUser(context.userId, 100);
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

  userMessage(): string {
    return "Listing timelines";
  }
}

export class ListTimelineVersionsTool extends Tool {
  readonly name = "list_timeline_versions";
  readonly description =
    "List a timeline sequence's snapshots, newest first: version number, " +
    "name, save type ('manual', 'autosave', 'restore'), render settings, and " +
    "when it was taken. Call this before restoring — restore_timeline_version " +
    "addresses a snapshot by its version number.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      timeline_id: {
        type: "string" as const,
        description: "Timeline sequence id."
      },
      save_type: SAVE_TYPE_PROPERTY,
      limit: {
        type: "number" as const,
        description: `Max versions to return (default ${DEFAULT_VERSION_LIMIT}, max ${MAX_VERSION_LIMIT}).`
      }
    },
    required: ["timeline_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const seq = await loadTimeline(context, params["timeline_id"]);
    if (isError(seq)) return seq;

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

  userMessage(params: Record<string, unknown>): string {
    return `Listing versions of timeline ${String(params["timeline_id"])}`;
  }
}

export class GetTimelineVersionTool extends Tool {
  readonly name = "get_timeline_version";
  readonly description =
    "Read one snapshot of a timeline sequence without restoring it: the " +
    "version's metadata plus the full document it stored. Use this to inspect " +
    "or compare versions before deciding which one to restore.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      timeline_id: {
        type: "string" as const,
        description: "Timeline sequence id."
      },
      version: {
        type: "number" as const,
        description: "Version number to read, from list_timeline_versions."
      }
    },
    required: ["timeline_id", "version"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const seq = await loadTimeline(context, params["timeline_id"]);
    if (isError(seq)) return seq;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

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

  userMessage(params: Record<string, unknown>): string {
    return `Reading v${String(params["version"])} of timeline ${String(params["timeline_id"])}`;
  }
}

export class CreateTimelineVersionTool extends Tool {
  readonly name = "create_timeline_version";
  readonly description =
    "Snapshot a timeline sequence's current document as a manual version, so " +
    "it can be restored later. Manual snapshots are never pruned (autosaves " +
    "are), so take one before an edit the user may want undone. Returns the " +
    "new version's number.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      timeline_id: {
        type: "string" as const,
        description: "Timeline sequence id."
      },
      name: {
        type: "string" as const,
        description: "Label for the snapshot, e.g. 'before the recut'."
      }
    },
    required: ["timeline_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const seq = await loadTimeline(context, params["timeline_id"]);
    if (isError(seq)) return seq;

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

  userMessage(params: Record<string, unknown>): string {
    return `Snapshotting timeline ${String(params["timeline_id"])}`;
  }
}

export class RestoreTimelineVersionTool extends Tool {
  readonly name = "restore_timeline_version";
  readonly description =
    "Roll a timeline sequence's document and render settings back to one of " +
    "its snapshots, addressed by version number (from " +
    "list_timeline_versions). The state being overwritten is snapshotted " +
    "first, so the restore is itself undoable — restore that snapshot to come " +
    "back. An old document is restored against today's schema, so the result " +
    "is validated afterwards and the findings are returned with it.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      timeline_id: {
        type: "string" as const,
        description: "Timeline sequence id."
      },
      version: {
        type: "number" as const,
        description: "Version number to restore, from list_timeline_versions."
      }
    },
    required: ["timeline_id", "version"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const seq = await loadTimeline(context, params["timeline_id"]);
    if (isError(seq)) return seq;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

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

    const validation = validateTimelineSequence(document, {
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

  userMessage(params: Record<string, unknown>): string {
    return `Restoring timeline ${String(params["timeline_id"])} to v${String(params["version"])}`;
  }
}

/** Every tool in this module, for toolbelt assembly and docs. */
export const TIMELINE_VERSION_TOOL_NAMES = [
  "list_timelines",
  "list_timeline_versions",
  "get_timeline_version",
  "create_timeline_version",
  "restore_timeline_version"
] as const;
