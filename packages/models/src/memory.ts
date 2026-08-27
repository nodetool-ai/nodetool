/**
 * Memory model — durable memory an agent records and reads back.
 *
 * A Memory is a plain relational row scoped to a **user**, not to one
 * conversation. It persists deterministically, is editable, and can reference
 * resources of any kind — the assets (images/videos), workflows, collections,
 * documents, or external URLs an agent works with — by a typed
 * `{ type, id }` handle, so work done in one thread stays reusable in the next.
 *
 * `thread_id` records where a memory was written and is a filter, never a
 * boundary. It is empty for a memory saved outside a chat thread.
 */

import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { memories } from "./schema/memories.js";

export type MemoryKind =
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
export interface MemoryResource {
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

/** Filters every listing accepts. `threadId` narrows, it does not gate. */
export interface MemoryListOptions {
  limit?: number;
  /** Only memories recorded in this thread. Omit for every thread. */
  threadId?: string;
  /** Only these kinds. Omit for every kind. */
  kinds?: readonly string[];
}

/** Longest query accepted. Past this it is a paste, not a search. */
const MAX_QUERY_LENGTH = 512;
/** Terms past this many are ignored — each one costs another OR pair. */
const MAX_TERMS = 8;

/**
 * Split a query into search terms: whitespace-separated, lowercased, deduped.
 * Quoting is deliberately not supported — a term is a word.
 */
export function memorySearchTerms(query: string): string[] {
  const terms = query
    .slice(0, MAX_QUERY_LENGTH)
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  return [...new Set(terms)].slice(0, MAX_TERMS);
}

/**
 * Wrap a term as a LIKE pattern, escaping the wildcards so a query containing
 * `%` or `_` matches those characters instead of matching everything.
 */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export class Memory extends DBModel {
  static override table = memories;

  declare id: string;
  declare user_id: string;
  declare thread_id: string;
  declare kind: string;
  declare title: string;
  declare content: string;
  declare resources: MemoryResource[] | null;
  declare metadata: Record<string, unknown> | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.thread_id ??= "";
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
  static async find(userId: string, memoryId: string): Promise<Memory | null> {
    const memory = await Memory.get<Memory>(memoryId);
    if (!memory || memory.user_id !== userId) return null;
    return memory;
  }

  /**
   * List a user's memories, newest first, across every thread unless
   * `threadId` narrows it.
   */
  static async list(
    userId: string,
    options: MemoryListOptions = {}
  ): Promise<Memory[]> {
    const { limit = 200, threadId, kinds } = options;
    const db = getDb();
    const filters = [eq(memories.user_id, userId)];
    if (threadId !== undefined) {
      filters.push(eq(memories.thread_id, threadId));
    }
    if (kinds && kinds.length > 0) {
      filters.push(inArray(memories.kind, [...kinds]));
    }
    const rows = await db
      .select()
      .from(memories)
      .where(and(...filters))
      // Secondary sort on the id keeps ordering deterministic when two rows
      // share a created_at (same-millisecond writes).
      .orderBy(desc(memories.created_at), desc(memories.id))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Memory(r));
  }

  /** List memories recorded in one thread, newest first. */
  static async listByThread(
    userId: string,
    threadId: string,
    limit = 200
  ): Promise<Memory[]> {
    return Memory.list(userId, { threadId, limit });
  }

  /**
   * Find a user's memories by keyword, newest first.
   *
   * Every term must appear in the title or the content — an AND across terms,
   * an OR across the two columns — matched case-insensitively as a substring.
   * The match runs in SQL, where `LIKE` means the same thing in SQLite and
   * Postgres, so `limit` bounds the work instead of bounding a scan.
   *
   * An empty query matches nothing rather than everything: a search box the
   * user has not typed into should not return the whole store.
   */
  static async search(
    userId: string,
    query: string,
    options: MemoryListOptions = {}
  ): Promise<Memory[]> {
    const terms = memorySearchTerms(query);
    if (terms.length === 0) return [];

    const { limit = 50, threadId, kinds } = options;
    const db = getDb();
    const filters = [eq(memories.user_id, userId)];
    if (threadId !== undefined) {
      filters.push(eq(memories.thread_id, threadId));
    }
    if (kinds && kinds.length > 0) {
      filters.push(inArray(memories.kind, [...kinds]));
    }
    for (const term of terms) {
      const pattern = likePattern(term);
      filters.push(
        sql`(lower(${memories.title}) LIKE ${pattern} ESCAPE '\\' OR lower(${memories.content}) LIKE ${pattern} ESCAPE '\\')`
      );
    }
    const rows = await db
      .select()
      .from(memories)
      .where(and(...filters))
      .orderBy(desc(memories.created_at), desc(memories.id))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Memory(r));
  }

  /**
   * Delete every memory recorded in a thread in one statement. Returns how
   * many were removed (no per-row cap).
   */
  static async deleteByThread(
    userId: string,
    threadId: string
  ): Promise<number> {
    const db = getDb();
    const where = and(
      eq(memories.user_id, userId),
      eq(memories.thread_id, threadId)
    );
    const existing = await db
      .select({ id: memories.id })
      .from(memories)
      .where(where);
    if (existing.length === 0) return 0;
    await db.delete(memories).where(where);
    return existing.length;
  }
}
