/**
 * `nodetool timeline versions` — the version-history half of the timeline
 * harness.
 *
 * Timeline sequences keep immutable snapshots: manual saves, autosaves the
 * server writes at most every five minutes, and the pre-restore snapshot that
 * makes a restore undoable. These commands read and write that history
 * directly against the local database, the way `timeline validate` and
 * `timeline debug` read a sequence row, so an agent can inspect, snapshot,
 * restore and prune without a server.
 *
 * `restore` mirrors the tRPC router (`timeline.versions.restore`): snapshot
 * what is about to be overwritten, then CAS-write the version's document and
 * render settings back onto the sequence. It then runs the same static check
 * `timeline validate` runs — an old document is restored against today's
 * schema, so what it used to pass is not what it passes now.
 *
 * The database and the validator core are injected with lazy defaults, so
 * registration stays light and the actions are unit-testable.
 */
import type { Command } from "commander";
import type { TimelineValidation } from "@nodetool-ai/execution/timeline-debug";
import { printCommandError } from "../command-errors.js";
import { asJson, confirm, printTable } from "./output.js";
import { numericOptionParser } from "../numeric-options.js";
import { renderTimelineValidation } from "./timeline.js";

/** A decoded JSON document, before anything validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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

/** The model calls these commands make — the whole database seam. */
export interface TimelineVersionStore {
  loadSequence: (id: string) => Promise<TimelineSequenceRow | null>;
  listVersions: (
    timelineId: string,
    opts: { limit?: number; saveType?: string }
  ) => Promise<TimelineVersionRow[]>;
  findVersion: (
    timelineId: string,
    version: number
  ) => Promise<TimelineVersionRow | null>;
  snapshot: (
    seq: TimelineSequenceRow,
    opts: { saveType: "manual" | "restore"; name?: string | null }
  ) => Promise<TimelineVersionRow>;
  /**
   * Write a version's document and render settings back onto the sequence,
   * compare-and-swap on the `updated_at` it was loaded with. Resolves to null
   * when someone else wrote first.
   */
  restore: (
    seq: TimelineSequenceRow,
    version: TimelineVersionRow
  ) => Promise<TimelineSequenceRow | null>;
  deleteVersion: (timelineId: string, version: number) => Promise<void>;
}

export interface TimelineVersionsDeps {
  /** Defaults to the local database through `@nodetool-ai/models`. */
  store?: () => Promise<TimelineVersionStore>;
  /** Defaults to `@nodetool-ai/execution/timeline-debug`. */
  validate?: (
    raw: unknown,
    meta: { fps?: number; width?: number; height?: number }
  ) => Promise<TimelineValidation> | TimelineValidation;
  /** Defaults to the interactive prompt in `output.ts`. */
  confirmDelete?: (message: string, force?: boolean) => Promise<boolean>;
}

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
  return items.map((v) => ({
    version: v.version,
    saveType: v.saveType,
    name: v.name ?? "",
    createdAt: v.createdAt,
    fps: v.fps,
    resolution: `${v.width}x${v.height}`
  }));
}

/** Parse a stored document without throwing — an unreadable one is a finding. */
export function parseVersionDocument(raw: unknown): JsonValue {
  // SAFETY: a Postgres json column arrives already decoded; either way the
  // stored document is JSON.
  if (typeof raw !== "string") return raw as JsonValue;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw;
  }
}

/** Track / clip / marker counts of whatever a version stored. */
export function documentCounts(document: unknown) {
  const doc = (document ?? {}) as Record<string, unknown>;
  const count = (value: unknown): number =>
    Array.isArray(value) ? value.length : 0;
  return {
    tracks: count(doc.tracks),
    clips: count(doc.clips),
    markers: count(doc.markers)
  };
}

async function defaultStore(): Promise<TimelineVersionStore> {
  const { initDb, TimelineSequence, TimelineSequenceVersion } =
    await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  initDb(getDefaultDbPath());

  return {
    loadSequence: async (id) =>
      (await TimelineSequence.findById(id)) as TimelineSequenceRow | null,
    listVersions: async (timelineId, opts) =>
      (await TimelineSequenceVersion.listForTimeline(
        timelineId,
        opts
      )),
    findVersion: async (timelineId, version) =>
      (await TimelineSequenceVersion.findByVersion(
        timelineId,
        version
      )),
    snapshot: async (seq, opts) =>
      await TimelineSequenceVersion.snapshot(seq, opts),
    restore: async (seq, version) =>
      (await TimelineSequence.updateFieldsIfUnchanged(seq.id, seq.updated_at, {
        document: version.document,
        fps: version.fps,
        width: version.width,
        height: version.height,
        duration_ms: version.duration_ms
      })) as TimelineSequenceRow | null,
    deleteVersion: async (timelineId, version) => {
      const row = await TimelineSequenceVersion.findByVersion(
        timelineId,
        version
      );
      if (row) await row.delete();
    }
  };
}

async function defaultValidate(
  raw: unknown,
  meta: { fps?: number; width?: number; height?: number }
): Promise<TimelineValidation> {
  const { validateTimelineSequence } =
    await import("@nodetool-ai/execution/timeline-debug");
  return await validateTimelineSequence(raw, meta);
}

/** Load a sequence or say which id was not found. */
async function requireSequence(
  store: TimelineVersionStore,
  id: string
): Promise<TimelineSequenceRow> {
  const seq = await store.loadSequence(id);
  if (!seq) throw new Error(`Timeline sequence not found: ${id}`);
  return seq;
}

async function requireVersion(
  store: TimelineVersionStore,
  timelineId: string,
  version: number
): Promise<TimelineVersionRow> {
  const row = await store.findVersion(timelineId, version);
  if (!row) {
    throw new Error(`Timeline version not found: ${timelineId} v${version}`);
  }
  return row;
}

interface JsonOption {
  json?: boolean;
}

interface ListOptions extends JsonOption {
  saveType?: string;
  limit?: number;
}

export function registerTimelineVersionsCommands(
  timeline: Command,
  deps: TimelineVersionsDeps = {}
): void {
  const openStore = deps.store ?? defaultStore;
  const validate = deps.validate ?? defaultValidate;
  const confirmDelete =
    deps.confirmDelete ??
    ((message: string, force?: boolean) => confirm(message, { force }));

  const versions = timeline
    .command("versions")
    .description(
      "Inspect and restore the snapshot history of a timeline sequence (manual saves, autosaves, pre-restore snapshots)"
    );

  versions
    .command("list <timeline_id>")
    .description("List a timeline's versions, newest first")
    .option("--save-type <type>", "Only manual, autosave or restore snapshots")
    .option(
      "--limit <n>",
      "Maximum versions to list (default 100)",
      numericOptionParser("--limit", { integer: true, min: 1 })
    )
    .option("--json", "Print the versions as JSON")
    .action(async (timelineId: string, opts: ListOptions) => {
      try {
        const store = await openStore();
        await requireSequence(store, timelineId);
        const query: Parameters<typeof store.listVersions>[1] = {};
        if (opts.limit !== undefined) {
          query.limit = opts.limit;
        }
        if (opts.saveType) {
          query.saveType = opts.saveType;
        }
        const rows = await store.listVersions(timelineId, query);
        const items = rows.map(toVersionListItem);

        if (opts.json) {
          asJson({ timelineId, versions: items });
          return;
        }
        printTable(versionTableRows(items));
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command("show <timeline_id> <version>")
    .description("Print one version's metadata and the document it stored")
    .option("--json", "Print the metadata and the full document as JSON")
    .action(async (timelineId: string, version: string, opts: JsonOption) => {
      try {
        const number = parseVersionNumber(version);
        const store = await openStore();
        await requireSequence(store, timelineId);
        const row = await requireVersion(store, timelineId, number);
        const item = toVersionListItem(row);
        const document = parseVersionDocument(row.document);

        if (opts.json) {
          asJson({ ...item, document });
          return;
        }
        const counts = documentCounts(document);
        printTable([
          {
            version: item.version,
            saveType: item.saveType,
            name: item.name ?? "",
            createdAt: item.createdAt,
            fps: item.fps,
            resolution: `${item.width}x${item.height}`
          }
        ]);
        console.log(
          `\n  ${counts.tracks} track(s), ${counts.clips} clip(s), ${counts.markers} marker(s), ${item.durationMs}ms`
        );
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command("create <timeline_id>")
    .description("Snapshot the sequence as it stands now (a manual save)")
    .option("--name <name>", "Label for the snapshot")
    .option("--json", "Print the created version as JSON")
    .action(
      async (timelineId: string, opts: JsonOption & { name?: string }) => {
        try {
          const store = await openStore();
          const seq = await requireSequence(store, timelineId);
          const row = await store.snapshot(seq, {
            saveType: "manual",
            name: opts.name ?? null
          });
          const item = toVersionListItem(row);

          if (opts.json) {
            asJson(item);
            return;
          }
          console.log(
            `✅ Snapshot saved as v${item.version}${item.name ? ` (${item.name})` : ""}`
          );
        } catch (e) {
          printCommandError(e, opts.json);
          process.exit(1);
        }
      }
    );

  versions
    .command("restore <timeline_id> <version>")
    .description(
      "Restore a version onto the sequence. The pre-restore state is snapshotted first, and the restored document is validated against the current schema — a restore whose document no longer validates exits non-zero"
    )
    .option("--json", "Print the restore result and validation as JSON")
    .action(async (timelineId: string, version: string, opts: JsonOption) => {
      // The verdict leaves the try block in a variable: `process.exit`
      // throws under test, and an exit inside the try would be caught here
      // as a command failure.
      let restoredOk = false;
      try {
        const number = parseVersionNumber(version);
        const store = await openStore();
        const seq = await requireSequence(store, timelineId);
        const target = await requireVersion(store, timelineId, number);

        // Snapshot what is about to be overwritten first, so the restore is
        // itself undoable — same order the tRPC router uses.
        const backup = await store.snapshot(seq, {
          saveType: "restore",
          name: `Before restore to v${number}`
        });

        const updated = await store.restore(seq, target);
        if (!updated) {
          throw new Error("Timeline has been modified since last load");
        }

        const document = parseVersionDocument(target.document);
        const validation = await validate(document, {
          fps: target.fps,
          width: target.width,
          height: target.height
        });

        if (opts.json) {
          asJson({
            timelineId,
            restored: toVersionListItem(target),
            snapshot: toVersionListItem(backup),
            sequence: {
              id: updated.id,
              fps: updated.fps,
              width: updated.width,
              height: updated.height,
              durationMs: updated.duration_ms
            },
            validation
          });
        } else {
          const counts = documentCounts(document);
          console.log(
            `✅ Restored v${number} onto ${timelineId}: ${counts.tracks} track(s), ${counts.clips} clip(s), ${target.duration_ms}ms @ ${target.fps}fps ${target.width}x${target.height}`
          );
          console.log(
            `  pre-restore state saved as v${backup.version} (${backup.save_type})`
          );
          console.log(renderTimelineValidation(validation).join("\n"));
        }
        restoredOk = validation.ok;
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
      process.exit(restoredOk ? 0 : 1);
    });

  versions
    .command("delete <timeline_id> <version>")
    .description("Delete one version from a timeline's history")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--json", "Print the result as JSON")
    .action(
      async (
        timelineId: string,
        version: string,
        opts: JsonOption & { yes?: boolean }
      ) => {
        let aborted = false;
        try {
          const number = parseVersionNumber(version);
          const store = await openStore();
          await requireSequence(store, timelineId);
          await requireVersion(store, timelineId, number);

          const ok = await confirmDelete(
            `Delete v${number} of timeline ${timelineId}?`,
            opts.yes
          );
          if (!ok) {
            aborted = true;
            if (opts.json) {
              asJson({
                timelineId,
                version: number,
                deleted: false,
                aborted: true
              });
            } else {
              console.error("Aborted.");
            }
          } else {
            await store.deleteVersion(timelineId, number);
            if (opts.json) {
              asJson({ timelineId, version: number, deleted: true });
            } else {
              console.log(`✅ Deleted v${number} of timeline ${timelineId}`);
            }
          }
        } catch (e) {
          printCommandError(e, opts.json);
          process.exit(1);
        }
        if (aborted) process.exit(1);
      }
    );
}

/** A version is a positive integer; anything else names itself in the error. */
export function parseVersionNumber(raw: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`version must be a positive integer (got "${raw}")`);
  }
  return value;
}
