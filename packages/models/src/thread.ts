/**
 * Thread model – conversation thread container.
 *
 * Port of Python's `nodetool.models.thread`.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";

// ── Schema ───────────────────────────────────────────────────────────

const THREAD_SCHEMA: TableSchema = {
  table_name: "nodetool_threads",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    title: { type: "string" },
    created_at: { type: "datetime" },
    updated_at: { type: "datetime" },
  },
};

const THREAD_INDEXES: IndexSpec[] = [
  {
    name: "idx_threads_user_id",
    columns: ["user_id"],
    unique: false,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class Thread extends DBModel {
  static override schema = THREAD_SCHEMA;
  static override indexes = THREAD_INDEXES;

  declare id: string;
  declare user_id: string;
  declare title: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Row) {
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

  // ── Static queries ───────────────────────────────────────────────

  /** Find a thread by id, scoped to the user. */
  static async find(
    userId: string,
    threadId: string,
  ): Promise<Thread | null> {
    const thread = await (Thread as unknown as ModelClass<Thread>).get(
      threadId,
    );
    if (!thread) return null;
    if (thread.user_id === userId) return thread;
    return null;
  }

  /** Paginate threads for a user. */
  static async paginate(
    userId: string,
    opts: { limit?: number; startKey?: string; reverse?: boolean } = {},
  ): Promise<[Thread[], string]> {
    const { limit = 50, startKey: _startKey, reverse = true } = opts;
    const cond = field("user_id").equals(userId);

    return (Thread as unknown as ModelClass<Thread>).query({
      condition: cond,
      orderBy: "updated_at",
      reverse,
      limit,
    });
  }
}
