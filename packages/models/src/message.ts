/**
 * Message model -- conversation messages with tool call support.
 *
 * Port of Python's `nodetool.models.message`.
 */

import {
  eq,
  and,
  or,
  gt,
  gte,
  lt,
  desc,
  asc,
  inArray,
  isNotNull,
  isNull
} from "drizzle-orm";
import type { ProviderSession } from "@nodetool-ai/protocol";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getPortableDb } from "./db.js";
import { eraseRunTraceParentForModelDeletion } from "./run-trace.js";
import { messages } from "./schema/messages.js";

/**
 * `execution_event_type` of a compaction record: the persisted summary that
 * replaces everything before it in the view a provider is handed.
 *
 * The column is free-form text and every other value in it names a streamed
 * execution event (`planning_update`, `task_update`, `log_update`), so the
 * marker needs no schema change. The row keeps `role: "user"` so it is
 * ordinary history to a provider once written, which is what keeps the cached
 * prefix stable across the turns that follow.
 */
export const COMPACTION_EVENT_TYPE = "compaction";

/** Whether a stored message is a compaction record. */
export function isCompactionMessage(message: {
  execution_event_type?: string | null;
}): boolean {
  return message.execution_event_type === COMPACTION_EVENT_TYPE;
}

/**
 * The content a compaction record carries. The header tells the model what it
 * is reading, since the row is otherwise indistinguishable from something the
 * user typed.
 */
export function compactionMessageContent(summary: string): string {
  return `[Conversation so far]\n${summary}`;
}

export class Message extends DBModel {
  static override table = messages;

  declare id: string;
  declare user_id: string;
  declare thread_id: string;
  declare role: string;
  declare name: string | null;
  declare content: string | Record<string, unknown> | unknown[] | null;
  declare tool_calls: unknown[] | null;
  declare tool_call_id: string | null;
  declare input_files: unknown[] | null;
  declare output_files: unknown[] | null;
  declare provider: string | null;
  declare model: string | null;
  declare cost: number | null;
  declare workflow_id: string | null;
  declare graph: Record<string, unknown> | null;
  declare tools: string[] | null;
  declare collections: string[] | null;
  declare agent_mode: boolean | null;
  declare help_mode: boolean | null;
  declare agent_execution_id: string | null;
  declare execution_event_type: string | null;
  declare workflow_target: string | null;
  declare media_generation: Record<string, unknown> | null;
  /** Provider session continuation token (state after this turn). */
  declare provider_session: ProviderSession | null;
  /** Null on the live conversation; the version id on an archived tail. */
  declare branch_id: string | null;
  /** Live message an archived version forks after; "" for the thread start. */
  declare branch_after: string | null;
  declare created_at: string;

  override async delete(): Promise<void> {
    await eraseRunTraceParentForModelDeletion({ kind: "message", id: this.id });
    await eraseRunTraceParentForModelDeletion({ kind: "thread", id: this.thread_id });
    await super.delete();
    await eraseRunTraceParentForModelDeletion({ kind: "message", id: this.id });
    await eraseRunTraceParentForModelDeletion({ kind: "thread", id: this.thread_id });
  }

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.role ??= "user";
    this.name ??= null;
    this.content ??= null;
    this.tool_calls ??= null;
    this.tool_call_id ??= null;
    this.input_files ??= null;
    this.output_files ??= null;
    this.provider ??= null;
    this.model ??= null;
    this.cost ??= null;
    this.workflow_id ??= null;
    this.graph ??= null;
    this.tools ??= null;
    this.collections ??= null;
    this.agent_execution_id ??= null;
    this.execution_event_type ??= null;
    this.workflow_target ??= null;
    this.media_generation ??= null;
    this.provider_session ??= null;
    this.branch_id ??= null;
    this.branch_after ??= null;
    this.created_at ??= now;

    // Drizzle handles JSON<->text via jsonText custom type, but handle
    // edge cases where raw strings come through (e.g. legacy data)
    if (typeof this.agent_mode === "number") {
      this.agent_mode = this.agent_mode !== 0;
    }
    this.agent_mode ??= null;

    if (typeof this.help_mode === "number") {
      this.help_mode = this.help_mode !== 0;
    }
    this.help_mode ??= null;
  }

  /** Find a message by id. */
  static async find(messageId: string): Promise<Message | null> {
    return Message.get<Message>(messageId);
  }

  /** Paginate the live messages in a thread. Archived versions are left out. */
  static async paginate(
    threadId: string,
    opts: { limit?: number; startKey?: string; reverse?: boolean } = {}
  ): Promise<[Message[], string]> {
    const { limit = 50, reverse = false, startKey } = opts;
    const db = getPortableDb();
    const conditions = [
      eq(messages.thread_id, threadId),
      isNull(messages.branch_id)
    ];
    // Seek past the cursor row so following the returned cursor actually
    // advances. Without this, every page returned the same first page while
    // still advertising a `next` cursor — an infinite loop for the client.
    if (startKey) {
      const cursorRow = await Message.get<Message>(startKey);
      if (cursorRow && cursorRow.thread_id === threadId) {
        const compare = reverse ? lt : gt;
        const afterCursor = or(
          compare(messages.created_at, cursorRow.created_at),
          and(
            eq(messages.created_at, cursorRow.created_at),
            compare(messages.id, cursorRow.id)
          )
        );
        if (afterCursor) conditions.push(afterCursor);
      }
    }
    const rows = await db
      .select()
      .from(messages)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(
        reverse ? desc(messages.created_at) : asc(messages.created_at),
        reverse ? desc(messages.id) : asc(messages.id)
      )
      .limit(limit + 1);

    const items = rows.map((r: Record<string, unknown>) => new Message(r));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  /** Delete all messages for a thread. */
  static async deleteByThread(threadId: string): Promise<number> {
    const db = getPortableDb();
    const where = eq(messages.thread_id, threadId);
    const existing = await db
      .select({ id: messages.id })
      .from(messages)
      .where(where);
    if (existing.length === 0) return 0;
    await eraseRunTraceParentForModelDeletion({ kind: "thread", id: threadId });
    await db.delete(messages).where(where);
    await eraseRunTraceParentForModelDeletion({ kind: "thread", id: threadId });
    return existing.length;
  }

  /**
   * Rewind a thread to just before `messageId`: that message and every later
   * live one leave the conversation, so the next turn continues from the
   * history before it. This is what Regenerate, editing a sent message and
   * `/rewind` do. The removed tail is kept as an earlier version of the
   * conversation at that point, which `switchVersion` can bring back.
   *
   * Provider session tokens on the surviving rows are cleared too. A token
   * resumes the upstream transcript as it stood after its turn, and that
   * transcript still holds the turns removed here, so the next turn must
   * rebuild its context from the stored rows instead.
   *
   * Returns the removed ids, or null when the message is not live in the
   * thread.
   */
  static async rewind(
    threadId: string,
    messageId: string
  ): Promise<string[] | null> {
    const target = await Message.get<Message>(messageId);
    if (!target || target.thread_id !== threadId || target.branch_id) {
      return null;
    }
    const after = await Message.liveBefore(target);
    const ids = await Message.archiveLiveFrom(threadId, target, after);
    await Message.clearProviderSessions(threadId);
    return ids;
  }

  /**
   * Every point in a thread where more than one version exists. A fork is
   * named by the live message it follows ("" for the thread start), and its
   * versions are ordered by when each began. `active` is the index of the
   * live one, or -1 when nothing live follows the fork.
   */
  static async versions(threadId: string): Promise<MessageFork[]> {
    const db = getPortableDb();
    const archived = await db
      .select({
        id: messages.id,
        branch_id: messages.branch_id,
        branch_after: messages.branch_after,
        created_at: messages.created_at
      })
      .from(messages)
      .where(
        and(eq(messages.thread_id, threadId), isNotNull(messages.branch_id))
      )
      .orderBy(asc(messages.created_at), asc(messages.id));
    if (archived.length === 0) return [];

    const live = await db
      .select({ id: messages.id, created_at: messages.created_at })
      .from(messages)
      .where(and(eq(messages.thread_id, threadId), isNull(messages.branch_id)))
      .orderBy(asc(messages.created_at), asc(messages.id));
    const liveIndex = new Map(live.map((row, index) => [row.id, index]));

    // Each archived version, by the fork it hangs off, in start order.
    const byFork = new Map<string, { branch_id: string; started: string; first_id: string }[]>();
    for (const row of archived) {
      const after = row.branch_after ?? "";
      // A fork after an archived message only shows once that message does.
      if (after !== "" && !liveIndex.has(after)) continue;
      const list = byFork.get(after) ?? [];
      if (!list.some((entry) => entry.branch_id === row.branch_id)) {
        list.push({
          branch_id: row.branch_id ?? "",
          started: row.created_at,
          first_id: row.id
        });
        byFork.set(after, list);
      }
    }

    const forks: MessageFork[] = [];
    for (const [after, branches] of byFork) {
      const nextIndex = after === "" ? 0 : (liveIndex.get(after) ?? -1) + 1;
      const next = live[nextIndex];
      const entries: { branch_id: string | null; started: string; first_id: string }[] = [
        ...branches
      ];
      if (next) {
        entries.push({ branch_id: null, started: next.created_at, first_id: next.id });
      }
      entries.sort((a, b) =>
        a.started === b.started
          ? a.first_id.localeCompare(b.first_id)
          : a.started.localeCompare(b.started)
      );
      forks.push({
        after,
        first_message_id: next?.id ?? null,
        versions: entries.map((entry) => entry.branch_id),
        active: entries.findIndex((entry) => entry.branch_id === null)
      });
    }
    return forks;
  }

  /**
   * Make the archived version `branchId` the live tail after `after` ("" for
   * the thread start). The tail it replaces is archived as a version of its
   * own, so switching back restores it. Returns false when `after` is not live
   * or `branchId` is not a version at that fork.
   */
  static async switchVersion(
    threadId: string,
    after: string,
    branchId: string
  ): Promise<boolean> {
    const db = getPortableDb();
    const chosen = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.thread_id, threadId),
          eq(messages.branch_id, branchId),
          eq(messages.branch_after, after)
        )
      );
    if (chosen.length === 0) return false;

    let afterRow: Message | null = null;
    if (after !== "") {
      afterRow = await Message.get<Message>(after);
      if (!afterRow || afterRow.thread_id !== threadId || afterRow.branch_id) {
        return false;
      }
    }

    const firstLive = await Message.liveAfter(threadId, afterRow);
    if (firstLive) {
      await Message.archiveLiveFrom(threadId, firstLive, after);
    }
    await db
      .update(messages)
      .set({ branch_id: null, branch_after: null })
      .where(inArray(messages.id, chosen.map((row) => row.id)));
    await Message.clearProviderSessions(threadId);
    return true;
  }

  /** Live rows from `target` on, in thread order. */
  private static liveFrom(threadId: string, target: Message) {
    return and(
      eq(messages.thread_id, threadId),
      isNull(messages.branch_id),
      or(
        gt(messages.created_at, target.created_at),
        and(
          eq(messages.created_at, target.created_at),
          gte(messages.id, target.id)
        )
      )
    );
  }

  /** Archive `target` and every later live row as one version after `after`. */
  private static async archiveLiveFrom(
    threadId: string,
    target: Message,
    after: string
  ): Promise<string[]> {
    const db = getPortableDb();
    const rows = await db
      .select({ id: messages.id })
      .from(messages)
      .where(Message.liveFrom(threadId, target));
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await db
        .update(messages)
        .set({ branch_id: createTimeOrderedUuid(), branch_after: after })
        .where(inArray(messages.id, ids));
    }
    return ids;
  }

  /** Id of the live row just before `target`, or "" when it is the first. */
  private static async liveBefore(target: Message): Promise<string> {
    const db = getPortableDb();
    const [row] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.thread_id, target.thread_id),
          isNull(messages.branch_id),
          or(
            lt(messages.created_at, target.created_at),
            and(
              eq(messages.created_at, target.created_at),
              lt(messages.id, target.id)
            )
          )
        )
      )
      .orderBy(desc(messages.created_at), desc(messages.id))
      .limit(1);
    return row?.id ?? "";
  }

  /** The first live row after `after` (the thread's first when null). */
  private static async liveAfter(
    threadId: string,
    after: Message | null
  ): Promise<Message | null> {
    const db = getPortableDb();
    const conditions = [
      eq(messages.thread_id, threadId),
      isNull(messages.branch_id)
    ];
    if (after) {
      const later = or(
        gt(messages.created_at, after.created_at),
        and(
          eq(messages.created_at, after.created_at),
          gt(messages.id, after.id)
        )
      );
      if (later) conditions.push(later);
    }
    const [row] = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.created_at), asc(messages.id))
      .limit(1);
    return row ? new Message(row as Record<string, unknown>) : null;
  }

  private static async clearProviderSessions(threadId: string): Promise<void> {
    await getPortableDb()
      .update(messages)
      .set({ provider_session: null })
      .where(
        and(eq(messages.thread_id, threadId), isNotNull(messages.provider_session))
      );
  }
}

/** A point in a thread where Edit or Retry left more than one version. */
export interface MessageFork {
  /** Live message the versions follow; "" for the thread start. */
  after: string;
  /** First live message after the fork, where a switcher belongs. */
  first_message_id: string | null;
  /** Version ids in start order; null marks the live one. */
  versions: (string | null)[];
  /** Index of the live version, or -1 when nothing live follows. */
  active: number;
}
