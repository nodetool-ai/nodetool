/**
 * ThreadMemory model — durable, per-conversation memory.
 *
 * Unlike the vector-backed {@link LongTermMemory} (fuzzy, cross-session,
 * embedding-gated), a ThreadMemory is a plain relational row scoped to a
 * single chat thread. It persists deterministically, is editable, and can
 * reference assets (generated images/videos) by id so an agent can record
 * and reuse the media it produces over the life of a creative project.
 */

import { eq, and, desc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { threadMemories } from "./schema/thread-memories.js";

export type ThreadMemoryKind =
  | "note"
  | "fact"
  | "preference"
  | "decision"
  | "asset";

export class ThreadMemory extends DBModel {
  static override table = threadMemories;

  declare id: string;
  declare user_id: string;
  declare thread_id: string;
  declare kind: string;
  declare title: string;
  declare content: string;
  declare asset_ids: string[] | null;
  declare metadata: Record<string, unknown> | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.kind ??= "note";
    this.title ??= "";
    this.content ??= "";
    this.asset_ids ??= null;
    this.metadata ??= null;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  /** Find a memory by id, scoped to the user. */
  static async find(
    userId: string,
    memoryId: string
  ): Promise<ThreadMemory | null> {
    const memory = await ThreadMemory.get<ThreadMemory>(memoryId);
    if (!memory || memory.user_id !== userId) return null;
    return memory;
  }

  /** List memories for a thread, newest first. */
  static async listByThread(
    userId: string,
    threadId: string,
    limit = 200
  ): Promise<ThreadMemory[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(threadMemories)
      .where(
        and(
          eq(threadMemories.user_id, userId),
          eq(threadMemories.thread_id, threadId)
        )
      )
      .orderBy(desc(threadMemories.created_at))
      .limit(limit);
    return rows.map(
      (r: Record<string, unknown>) => new ThreadMemory(r as Record<string, unknown>)
    );
  }

  /** Delete every memory belonging to a thread. Returns how many were removed. */
  static async deleteByThread(
    userId: string,
    threadId: string
  ): Promise<number> {
    const memories = await ThreadMemory.listByThread(userId, threadId, 10_000);
    for (const memory of memories) {
      await memory.delete();
    }
    return memories.length;
  }
}
