/**
 * `nodetool timeline versions` — the version-history half of the timeline
 * harness. The commands themselves live in `version-commands.ts`; this file is
 * the timeline's row shapes, database seam, columns and messages.
 *
 * Timeline sequences keep immutable snapshots: manual saves, autosaves the
 * server writes at most every five minutes, and the pre-restore snapshot that
 * makes a restore undoable. The history is read and written directly against
 * the local database, the way `timeline validate` and `timeline debug` read a
 * sequence row, so an agent can work without a server.
 */
import type { Command } from "commander";
import type { TimelineValidation } from "@nodetool-ai/execution/timeline-debug";
import { renderTimelineValidation } from "./timeline-validation-output.js";
import {
  countArray,
  registerVersionCommands,
  type JsonValue,
  type VersionCommandDeps,
  type VersionCommandSpec,
  type VersionStore
} from "./version-commands.js";

export { parseVersionDocument, parseVersionNumber } from "./version-commands.js";

/** A `timeline_sequences` row as these commands need it. */
export interface TimelineSequenceRow {
  id: string;
  user_id: string;
  name?: string | null;
  fps: number;
  width: number;
  height: number;
  duration_ms: number;
  updated_at: string;
  document: string;
}

/** A `timeline_sequence_versions` row. */
export interface TimelineVersionRow {
  id: string;
  timeline_id: string;
  version: number;
  name: string | null;
  save_type: string;
  fps: number;
  width: number;
  height: number;
  duration_ms: number;
  created_at: string;
  document: string;
}

export type TimelineVersionStore = VersionStore<
  TimelineSequenceRow,
  TimelineVersionRow
>;

/** The list-item shape, matching the tRPC router's `timelineVersionListItem`. */
export interface TimelineVersionListItem {
  id: string;
  timelineId: string;
  version: number;
  name: string | null;
  saveType: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  createdAt: string;
}

export function toVersionListItem(
  row: TimelineVersionRow
): TimelineVersionListItem {
  return {
    id: row.id,
    timelineId: row.timeline_id,
    version: row.version,
    name: row.name ?? null,
    saveType: row.save_type,
    fps: row.fps,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    createdAt: row.created_at
  };
}

/** One table row per version: what it is, when it was taken, what it renders. */
export function versionTableRows(
  items: TimelineVersionListItem[]
): Record<string, unknown>[] {
  return items.map(tableRow);
}

function tableRow(v: TimelineVersionListItem): Record<string, unknown> {
  return {
    version: v.version,
    saveType: v.saveType,
    name: v.name ?? "",
    createdAt: v.createdAt,
    fps: v.fps,
    resolution: `${v.width}x${v.height}`
  };
}

/** Track / clip / marker counts of whatever a version stored. */
export function documentCounts(document: JsonValue | undefined) {
  const doc = (document ?? {}) as Record<string, unknown>;
  return {
    tracks: countArray(doc.tracks),
    clips: countArray(doc.clips),
    markers: countArray(doc.markers)
  };
}

async function defaultStore(): Promise<TimelineVersionStore> {
  const { initDb, TimelineSequence, TimelineSequenceVersion } =
    await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  initDb(getDefaultDbPath());

  return {
    load: async (id) => await TimelineSequence.findById(id),
    listVersions: async (timelineId, opts) =>
      await TimelineSequenceVersion.listForTimeline(timelineId, opts),
    findVersion: async (timelineId, version) =>
      await TimelineSequenceVersion.findByVersion(timelineId, version),
    snapshot: async (seq, opts) =>
      await TimelineSequenceVersion.snapshot(seq, opts),
    restore: async (seq, version) =>
      await TimelineSequence.updateFieldsIfUnchanged(seq.id, seq.updated_at, {
        document: version.document,
        fps: version.fps,
        width: version.width,
        height: version.height,
        duration_ms: version.duration_ms
      }),
    deleteVersion: async (timelineId, version) => {
      const row = await TimelineSequenceVersion.findByVersion(
        timelineId,
        version
      );
      if (row) await row.delete();
    }
  };
}

interface TimelineValidateMeta {
  fps?: number;
  width?: number;
  height?: number;
}

async function defaultValidate(
  raw: unknown,
  meta: TimelineValidateMeta
): Promise<TimelineValidation> {
  const { validateTimelineSequence } =
    await import("@nodetool-ai/execution/timeline-debug");
  return await validateTimelineSequence(raw, meta);
}

const spec: VersionCommandSpec<
  TimelineSequenceRow,
  TimelineVersionRow,
  TimelineVersionListItem,
  TimelineValidation,
  ReturnType<typeof documentCounts>,
  TimelineValidateMeta
> = {
  idArg: "timeline_id",
  idKey: "timelineId",
  descriptions: {
    group:
      "Inspect and restore the snapshot history of a timeline sequence (manual saves, autosaves, pre-restore snapshots)",
    list: "List a timeline's versions, newest first",
    show: "Print one version's metadata and the document it stored",
    create: "Snapshot the sequence as it stands now (a manual save)",
    restore:
      "Restore a version onto the sequence. The pre-restore state is snapshotted first, and the restored document is validated against the current schema — a restore whose document no longer validates exits non-zero",
    delete: "Delete one version from a timeline's history",
    restoreJson: "Print the restore result and validation as JSON"
  },
  notFoundDocument: (id) => `Timeline sequence not found: ${id}`,
  notFoundVersion: (id, version) =>
    `Timeline version not found: ${id} v${version}`,
  conflict: "Timeline has been modified since last load",
  confirmDelete: (id, version) => `Delete v${version} of timeline ${id}?`,
  deleted: (id, version) => `✅ Deleted v${version} of timeline ${id}`,
  toItem: toVersionListItem,
  tableRow,
  counts: documentCounts,
  showSummary: (counts, item) =>
    `\n  ${counts.tracks} track(s), ${counts.clips} clip(s), ${counts.markers} marker(s), ${item.durationMs}ms`,
  restoreSummary: (id, version, counts, row) =>
    `✅ Restored v${version} onto ${id}: ${counts.tracks} track(s), ${counts.clips} clip(s), ${row.duration_ms}ms @ ${row.fps}fps ${row.width}x${row.height}`,
  restoreJsonExtra: (seq) => ({
    sequence: {
      id: seq.id,
      fps: seq.fps,
      width: seq.width,
      height: seq.height,
      durationMs: seq.duration_ms
    }
  }),
  validateMeta: (row) => ({ fps: row.fps, width: row.width, height: row.height }),
  renderValidation: renderTimelineValidation
};

export type TimelineVersionsDeps = VersionCommandDeps<
  TimelineSequenceRow,
  TimelineVersionRow,
  TimelineValidation,
  TimelineValidateMeta
>;

export function registerTimelineVersionsCommands(
  timeline: Command,
  deps: TimelineVersionsDeps = {}
): void {
  registerVersionCommands(timeline, spec, deps, {
    store: defaultStore,
    validate: defaultValidate
  });
}
