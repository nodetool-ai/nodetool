/**
 * Thread model – conversation thread container.
 *
 * Port of Python's `nodetool.models.thread`.
 */

import { eq, desc, asc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { threads } from "./schema/threads.js";

export class Thread extends DBModel {
  static override table = threads;

  declare id: string;
  declare user_id: string;
  declare title: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.title ??= "";
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  /** Find a thread by id, scoped to the user. */
  static async find(userId: string, threadId: string): Promise<Thread | null> {
    const thread = await Thread.get<Thread>(threadId);
    if (!thread) return null;
    if (thread.user_id === userId) return thread;
    return null;
  }

  /** Paginate threads for a user. */
  static async paginate(
    userId: string,
    opts: { limit?: number; startKey?: string; reverse?: boolean } = {}
  ): Promise<[Thread[], string]> {
    const { limit = 50, reverse = true } = opts;
    const db = getDb();
    const rows = await db
      .select()
      .from(threads)
      .where(eq(threads.user_id, userId))
      .orderBy(reverse ? desc(threads.updated_at) : asc(threads.updated_at))
      .limit(limit + 1)

    const items = rows.map((r: Record<string, unknown>) => new Thread(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }
}
