/**
 * TimelineSequenceVersion model — immutable snapshots of a timeline sequence.
 *
 * A snapshot carries the document plus the render settings it was written
 * against, so restoring one restores what the editor actually showed. Manual
 * saves, autosaves and the pre-restore snapshot are told apart by `save_type`;
 * only autosaves are ever pruned.
 */

import { eq, and, desc, asc, max } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { timelineSequenceVersions } from "./schema/timeline-sequence-versions.js";
import type { TimelineSequence } from "./timeline-sequence.js";

export type TimelineSequenceSaveType = "manual" | "autosave" | "restore";

/**
 * The fields {@link TimelineSequenceVersion.snapshot} copies off a sequence.
 * Naming them lets a caller that holds only a row — the CLI's version-store
 * seam — pass it without pretending to be a full model instance.
 */
export type TimelineSequenceSnapshotSource = Pick<
  TimelineSequence,
  "id" | "user_id" | "fps" | "width" | "height" | "duration_ms" | "document"
>;

/**
 * Whether an insert lost the race for a version number. SQLite and both
 * PostgreSQL drivers word it differently; all three mean the unique index on
 * (timeline_id, version) rejected the row.
 */
function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "23505" || err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return true;
  }
  const message = String(err.message ?? "");
  return (
    message.includes("UNIQUE constraint failed") ||
    message.includes("duplicate key value")
  );
}

export class TimelineSequenceVersion extends DBModel {
  static override table = timelineSequenceVersions;

  declare id: string;
  declare timeline_id: string;
  declare user_id: string;
  declare name: string | null;
  declare version: number;
  declare save_type: string;
  declare fps: number;
  declare width: number;
  declare height: number;
  declare duration_ms: number;
  declare document: string;
  declare created_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.name ??= null;
    this.version ??= 1;
    this.save_type ??= "manual";
    this.fps ??= 30;
    this.width ??= 1920;
    this.height ??= 1080;
    this.duration_ms ??= 0;
    this.created_at ??= new Date().toISOString();
  }

  /** Versions of a timeline, newest first. */
  static async listForTimeline(
    timelineId: string,
    opts: { limit?: number; saveType?: string } = {}
  ): Promise<TimelineSequenceVersion[]> {
    const { limit = 100, saveType } = opts;
    const db = getDb();
    const where =
      saveType === undefined
        ? eq(timelineSequenceVersions.timeline_id, timelineId)
        : and(
            eq(timelineSequenceVersions.timeline_id, timelineId),
            eq(timelineSequenceVersions.save_type, saveType)
          );
    const rows = await db
      .select()
      .from(timelineSequenceVersions)
      .where(where)
      .orderBy(desc(timelineSequenceVersions.version))
      .limit(limit);
    return rows.map(
      (r: Record<string, unknown>) => new TimelineSequenceVersion(r)
    );
  }

  /** One version by timeline id + version number. */
  static async findByVersion(
    timelineId: string,
    version: number
  ): Promise<TimelineSequenceVersion | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(timelineSequenceVersions)
      .where(
        and(
          eq(timelineSequenceVersions.timeline_id, timelineId),
          eq(timelineSequenceVersions.version, version)
        )
      )
      .limit(1);
    return row
      ? new TimelineSequenceVersion(row)
      : null;
  }

  /** The next version number for a timeline (max existing + 1). */
  static async nextVersion(timelineId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ value: max(timelineSequenceVersions.version) })
      .from(timelineSequenceVersions)
      .where(eq(timelineSequenceVersions.timeline_id, timelineId));
    return Number(rows[0]?.value ?? 0) + 1;
  }

  /**
   * Snapshot a sequence as the next version.
   *
   * The version number is read and written in two steps, so two writers can
   * pick the same one. The unique index on (timeline_id, version) is what
   * decides: the loser's insert fails, re-reads the number, and tries once
   * more before giving up.
   */
  static async snapshot(
    seq: TimelineSequenceSnapshotSource,
    opts: {
      saveType: TimelineSequenceSaveType;
      name?: string | null;
    }
  ): Promise<TimelineSequenceVersion> {
    const row = {
      timeline_id: seq.id,
      user_id: seq.user_id,
      name: opts.name ?? null,
      save_type: opts.saveType,
      fps: seq.fps,
      width: seq.width,
      height: seq.height,
      duration_ms: seq.duration_ms,
      document: seq.document,
      created_at: new Date().toISOString()
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const version = await TimelineSequenceVersion.nextVersion(seq.id);
      try {
        return await TimelineSequenceVersion.create<TimelineSequenceVersion>({
          ...row,
          id: createTimeOrderedUuid(),
          version
        });
      } catch (error) {
        if (attempt === 1 || !isUniqueViolation(error)) throw error;
      }
    }

    // Unreachable: the loop either returns or rethrows.
    throw new Error(`Failed to snapshot timeline ${seq.id}`);
  }

  /**
   * Drop the oldest autosaves beyond `maxAutosaves`. Manual and restore
   * snapshots are never touched — they are what a user asked to keep.
   */
  static async pruneAutosaves(
    timelineId: string,
    maxAutosaves: number
  ): Promise<void> {
    const db = getDb();
    const rows = await db
      .select({ id: timelineSequenceVersions.id })
      .from(timelineSequenceVersions)
      .where(
        and(
          eq(timelineSequenceVersions.timeline_id, timelineId),
          eq(timelineSequenceVersions.save_type, "autosave")
        )
      )
      .orderBy(asc(timelineSequenceVersions.version));

    const excess = rows.length - Math.max(0, maxAutosaves);
    if (excess <= 0) return;

    for (const row of rows.slice(0, excess)) {
      await db
        .delete(timelineSequenceVersions)
        .where(eq(timelineSequenceVersions.id, row.id));
    }
  }

  /**
   * Delete every version of a timeline. Called when the sequence is deleted:
   * SQLite only enforces the foreign key when `PRAGMA foreign_keys` is on, so
   * the cascade alone cannot be relied on.
   */
  static async deleteForTimeline(timelineId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(timelineSequenceVersions)
      .where(eq(timelineSequenceVersions.timeline_id, timelineId));
  }
}
