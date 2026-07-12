import { eq, desc, and } from "drizzle-orm";
import type {
  TimelineSequence as TimelineSequenceDoc,
  TimelineTrack,
  TimelineClip,
  TimelineMarker,
  TranscriptLine
} from "@nodetool-ai/timeline";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { timelineSequences } from "./schema/timeline-sequences.js";

export class TimelineSequenceConflictError extends Error {
  constructor(id: string) {
    super(`Timeline sequence ${id} was modified concurrently`);
    this.name = "TimelineSequenceConflictError";
  }
}

export interface TimelineSequenceMutationResult<T> {
  sequence: TimelineSequence;
  result: T;
}

function validateTimelineDocument(doc: TimelineDocument): void {
  if (
    !Array.isArray(doc.tracks) ||
    !Array.isArray(doc.clips) ||
    !Array.isArray(doc.markers)
  ) {
    throw new Error("document must contain tracks, clips, and markers arrays");
  }
}

// Guarantees a strictly increasing updated_at so a mutation is never a no-op
// against the CAS predicate even when two writes land within the same ms.
function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
}

export interface TimelineDocument {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  /** Studio transcript lines. Optional for documents written before Studio. */
  transcript?: TranscriptLine[];
  /** Whether the script lane + transcript panel are shown. Unset on legacy. */
  scriptEnabled?: boolean;
}

export class TimelineSequence extends DBModel {
  static override table = timelineSequences;

  declare id: string;
  declare user_id: string;
  declare project_id: string;
  declare workflow_id: string | null;
  declare name: string;
  declare fps: number;
  declare width: number;
  declare height: number;
  declare duration_ms: number;
  declare document: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.workflow_id ??= null;
    this.fps ??= 30;
    this.width ??= 1920;
    this.height ??= 1080;
    this.duration_ms ??= 0;
    this.document ??= JSON.stringify({ tracks: [], clips: [], markers: [] });
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    const doc = JSON.parse(this.document);
    if (
      !Array.isArray(doc.tracks) ||
      !Array.isArray(doc.clips) ||
      !Array.isArray(doc.markers)
    ) {
      throw new Error(
        "document must contain tracks, clips, and markers arrays"
      );
    }
  }

  toDocument(): TimelineDocument {
    return JSON.parse(this.document) as TimelineDocument;
  }

  fromDocument(doc: TimelineDocument): void {
    this.document = JSON.stringify(doc);
  }

  toTimelineSequence(): TimelineSequenceDoc {
    const doc = this.toDocument();
    return {
      id: this.id,
      projectId: this.project_id,
      workflowId: this.workflow_id ?? undefined,
      name: this.name,
      fps: this.fps,
      width: this.width,
      height: this.height,
      durationMs: this.duration_ms,
      tracks: doc.tracks,
      clips: doc.clips,
      markers: doc.markers,
      transcript: doc.transcript ?? [],
      scriptEnabled: doc.scriptEnabled,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  static fromTimelineSequence(
    userId: string,
    seq: TimelineSequenceDoc
  ): TimelineSequence {
    const doc: TimelineDocument = {
      tracks: seq.tracks,
      clips: seq.clips,
      markers: seq.markers,
      transcript: seq.transcript ?? [],
      scriptEnabled: seq.scriptEnabled
    };
    return new TimelineSequence({
      id: seq.id,
      user_id: userId,
      project_id: seq.projectId,
      workflow_id: seq.workflowId ?? null,
      name: seq.name,
      fps: seq.fps,
      width: seq.width,
      height: seq.height,
      duration_ms: seq.durationMs,
      document: JSON.stringify(doc),
      created_at: seq.createdAt,
      updated_at: seq.updatedAt
    });
  }

  static async findById(id: string): Promise<TimelineSequence | null> {
    return TimelineSequence.get<TimelineSequence>(id);
  }

  static async listByUser(
    userId: string,
    limit = 50
  ): Promise<TimelineSequence[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(timelineSequences)
      .where(eq(timelineSequences.user_id, userId))
      .orderBy(desc(timelineSequences.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new TimelineSequence(r));
  }

  static async listByProject(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<TimelineSequence[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(timelineSequences)
      .where(
        and(
          eq(timelineSequences.user_id, userId),
          eq(timelineSequences.project_id, projectId)
        )
      )
      .orderBy(desc(timelineSequences.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new TimelineSequence(r));
  }

  /**
   * Validate and update the `document` field then persist.
   * Throws a `SyntaxError` if `documentJson` is not valid JSON.
   */
  static async update(
    id: string,
    fields: Partial<{
      name: string;
      fps: number;
      width: number;
      height: number;
      duration_ms: number;
      workflow_id: string | null;
      document: string;
    }>
  ): Promise<TimelineSequence | null> {
    const seq = await TimelineSequence.get<TimelineSequence>(id);
    if (!seq) return null;

    if (fields.document !== undefined) {
      // Validate JSON before writing.
      JSON.parse(fields.document);
    }

    Object.assign(seq, fields);
    await seq.save();
    return seq;
  }

  /**
   * Atomic compare-and-swap on the `document` field. Writes only when the row's
   * `updated_at` still equals `expectedUpdatedAt`, so a concurrent write landing
   * in between makes this a no-op (returns null) instead of clobbering it.
   */
  static async updateDocumentIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    doc: TimelineDocument
  ): Promise<TimelineSequence | null> {
    validateTimelineDocument(doc);
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(timelineSequences)
      .set({
        document: JSON.stringify(doc),
        updated_at: now
      })
      .where(
        and(
          eq(timelineSequences.id, id),
          eq(timelineSequences.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const updated = new TimelineSequence(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }

  /**
   * Atomic compare-and-swap for a client-driven save that may touch scalar
   * fields and/or the document in one write. Applies only when the row's
   * `updated_at` still equals `expectedUpdatedAt`; returns null on conflict so
   * the caller can report "modified since last load" instead of clobbering.
   */
  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: Partial<{
      name: string;
      fps: number;
      width: number;
      height: number;
      duration_ms: number;
      workflow_id: string | null;
      document: string;
    }>
  ): Promise<TimelineSequence | null> {
    if (fields.document !== undefined) {
      validateTimelineDocument(JSON.parse(fields.document) as TimelineDocument);
    }
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(timelineSequences)
      .set({ ...fields, updated_at: now })
      .where(
        and(
          eq(timelineSequences.id, id),
          eq(timelineSequences.updated_at, expectedUpdatedAt)
        )
      )
      .returning();

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const updated = new TimelineSequence(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }

  /**
   * Load → mutate → CAS-write the document, retrying on concurrent conflicts.
   * The mutator receives a fresh document snapshot on every attempt, so callers
   * never operate on a stale read. Throws `TimelineSequenceConflictError` if all
   * retries lose the race.
   */
  static async mutateDocument<T>(
    id: string,
    mutator: (
      doc: TimelineDocument,
      sequence: TimelineSequence
    ) => T | Promise<T>,
    maxRetries = 5
  ): Promise<TimelineSequenceMutationResult<T> | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const seq = await TimelineSequence.get<TimelineSequence>(id);
      if (!seq) return null;

      const doc = seq.toDocument();
      const result = await mutator(doc, seq);
      const updated = await TimelineSequence.updateDocumentIfUnchanged(
        id,
        seq.updated_at,
        doc
      );
      if (updated) {
        return { sequence: updated, result };
      }
    }

    throw new TimelineSequenceConflictError(id);
  }

  /** Touch `updated_at` without changing any other field. */
  async touchUpdatedAt(): Promise<void> {
    this.updated_at = new Date().toISOString();
    await this.save();
  }
}
