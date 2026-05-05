import { eq, desc } from "drizzle-orm";
import type {
  TimelineSequence as TimelineSequenceDoc,
  TimelineTrack,
  TimelineClip,
  TimelineMarker
} from "@nodetool-ai/timeline";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { timelineSequences } from "./schema/timeline-sequences.js";

export interface TimelineDocument {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
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
    this.updated_at = new Date().toISOString();
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
      markers: seq.markers
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
    return rows.map(
      (r: Record<string, unknown>) => new TimelineSequence(r)
    );
  }

  static async listByProject(
    projectId: string,
    limit = 50
  ): Promise<TimelineSequence[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(timelineSequences)
      .where(eq(timelineSequences.project_id, projectId))
      .orderBy(desc(timelineSequences.updated_at))
      .limit(limit);
    return rows.map(
      (r: Record<string, unknown>) => new TimelineSequence(r)
    );
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

  /** Touch `updated_at` without changing any other field. */
  async touchUpdatedAt(): Promise<void> {
    this.updated_at = new Date().toISOString();
    await this.save();
  }
}
