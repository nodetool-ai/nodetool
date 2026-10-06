import { and, eq, like, sql } from "drizzle-orm";
import { getDatabase } from "./db.js";
import { Storyboard } from "./storyboard.js";
import { TimelineSequence, type TimelineDocument } from "./timeline-sequence.js";
import { createTimeOrderedUuid, ModelObserver, ModelChangeEvent } from "./base-model.js";

export interface FinishStoryboardWrite {
  board: Storyboard;
  timeline?: TimelineSequence;
  document: TimelineDocument;
  width: number;
  height: number;
  durationMs: number;
  /** The board document with layers the finish added, such as generated decoration. */
  boardDocument?: string;
}

/** The board link and produced document commit together or neither commits. */
export async function commitFinishedStoryboard(input: FinishStoryboardWrite): Promise<{ board: Storyboard; timeline: TimelineSequence }> {
  const connection = getDatabase();
  const id = input.timeline?.id ?? createTimeOrderedUuid();
  const now = new Date(Math.max(Date.now(), Date.parse(input.board.updated_at) + 1, Date.parse(input.timeline?.updated_at ?? "") + 1 || 0)).toISOString();
  const boardFields = { timeline_id: id, revision: input.board.revision + 1, updated_at: now, ...(input.boardDocument !== undefined && { document: input.boardDocument }) };
  const timelineFields = { document: JSON.stringify(input.document), duration_ms: input.durationMs, updated_at: now };
  const initial = { ...timelineFields, id, user_id: input.board.user_id, project_id: input.board.project_id, name: input.board.name, fps: 30, width: input.width, height: input.height, revision: 0, created_at: now };
  if (connection.dialect === "sqlite") {
    const { storyboards, timelineSequences } = connection.schema;
    connection.db.transaction((tx) => {
      const board = tx.update(storyboards).set(boardFields).where(and(eq(storyboards.id, input.board.id), eq(storyboards.revision, input.board.revision), eq(storyboards.updated_at, input.board.updated_at))).returning().get();
      if (!board) throw new Error("Storyboard was modified concurrently.");
      if (input.timeline) {
        const timeline = tx.update(timelineSequences).set({ ...timelineFields, revision: sql`${timelineSequences.revision} + 1` }).where(and(eq(timelineSequences.id, id), eq(timelineSequences.revision, input.timeline.revision), eq(timelineSequences.updated_at, input.timeline.updated_at))).returning().get();
        if (!timeline) throw new Error("Timeline was modified concurrently.");
      } else tx.insert(timelineSequences).values(initial).run();
    });
  } else {
    const { storyboards, timelineSequences } = connection.schema;
    await connection.db.transaction(async (tx) => {
      const [board] = await tx.update(storyboards).set(boardFields).where(and(eq(storyboards.id, input.board.id), eq(storyboards.revision, input.board.revision), eq(storyboards.updated_at, input.board.updated_at))).returning();
      if (!board) throw new Error("Storyboard was modified concurrently.");
      if (input.timeline) {
        const [timeline] = await tx.update(timelineSequences).set({ ...timelineFields, revision: sql`${timelineSequences.revision} + 1` }).where(and(eq(timelineSequences.id, id), eq(timelineSequences.revision, input.timeline.revision), eq(timelineSequences.updated_at, input.timeline.updated_at))).returning();
        if (!timeline) throw new Error("Timeline was modified concurrently.");
      } else await tx.insert(timelineSequences).values(initial);
    });
  }
  const board = await Storyboard.findById(input.board.id);
  const timeline = await TimelineSequence.findById(id);
  if (!board || !timeline) throw new Error("Finished resources disappeared before confirmation.");
  ModelObserver.notify(board, ModelChangeEvent.UPDATED);
  ModelObserver.notify(timeline, input.timeline ? ModelChangeEvent.UPDATED : ModelChangeEvent.CREATED);
  return { board, timeline };
}

/** Resolve full ids or exact twelve-character prefixes only within ownership. */
export async function findFinishResourceIds(kind: "storyboard" | "timeline" | "asset", id: string, userId: string, projectId?: string): Promise<string[]> {
  const connection = getDatabase();
  const prefix = /^[a-f0-9]{12}$/.test(id);
  if (connection.dialect === "sqlite") {
    const table = kind === "storyboard" ? connection.schema.storyboards : kind === "timeline" ? connection.schema.timelineSequences : connection.schema.assets;
    const predicate = and(eq(table.user_id, userId), prefix ? like(table.id, `${id}%`) : eq(table.id, id), projectId ? eq(table.project_id, projectId) : undefined);
    return connection.db.select({ id: table.id }).from(table).where(predicate).limit(2).all().map((row) => row.id);
  }
  const table = kind === "storyboard" ? connection.schema.storyboards : kind === "timeline" ? connection.schema.timelineSequences : connection.schema.assets;
  const predicate = and(eq(table.user_id, userId), prefix ? like(table.id, `${id}%`) : eq(table.id, id), projectId ? eq(table.project_id, projectId) : undefined);
  return (await connection.db.select({ id: table.id }).from(table).where(predicate).limit(2)).map((row) => row.id);
}
