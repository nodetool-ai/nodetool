/**
 * ThreadMemory model — durable, per-conversation memory.
 *
 * Unlike the vector-backed {@link LongTermMemory} (fuzzy, cross-session,
 * embedding-gated), a ThreadMemory is a plain relational row scoped to a
 * single chat thread. It persists deterministically, is editable, and can
 * reference resources of any kind — the assets (images/videos), workflows,
 * collections, documents, or external URLs an agent works with — by a typed
 * `{ type, id }` handle, so a creative project can record and reuse them over
 * the life of the conversation.
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
  | "resource";

/**
 * A typed reference to any resource a memory is about. `type` is an open
 * string — the known kinds are asset | workflow | collection | node | job |
 * timeline | script | storyboard | image_document | thread | url — but any
 * value is accepted so new resource kinds work without a schema change.
 */
export interface ThreadMemoryResource {
  /** Resource kind (asset, workflow, collection, url, …). */
  type: string;
  /** Identifier: asset id, workflow id, collection name, a URL, etc. */
  id: string;
  /** Canonical uri when the resource has one (asset://…, https://…). */
  uri?: string;
  /** Optional human-readable label. */
  label?: string;
  /** Optional extra metadata. */
  metadata?: Record<string, unknown>;
}

export class ThreadMemory extends DBModel {
  static override table = threadMemories;

  declare id: string;
  declare user_id: string;
  declare thread_id: string;
  declare kind: string;
  declare title: string;
  declare content: string;
  declare resources: ThreadMemoryResource[] | null;
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
    this.resources ??= null;
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
      // Secondary sort on the id keeps ordering deterministic when two rows
      // share a created_at (same-millisecond writes).
      .orderBy(desc(threadMemories.created_at), desc(threadMemories.id))
      .limit(limit);
    return rows.map(
      (r: Record<string, unknown>) => new ThreadMemory(r as Record<string, unknown>)
    );
  }

  /**
   * Delete every memory belonging to a thread in one statement. Returns how
   * many were removed (no per-row cap).
   */
  static async deleteByThread(
    userId: string,
    threadId: string
  ): Promise<number> {
    const db = getDb();
    const where = and(
      eq(threadMemories.user_id, userId),
      eq(threadMemories.thread_id, threadId)
    );
    const existing = await db
      .select({ id: threadMemories.id })
      .from(threadMemories)
      .where(where);
    if (existing.length === 0) return 0;
    await db.delete(threadMemories).where(where);
    return existing.length;
  }
}
