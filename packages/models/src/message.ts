/**
 * Message model -- conversation messages with tool call support.
 *
 * Port of Python's `nodetool.models.message`.
 */

import { eq, and, or, gt, lt, desc, asc } from "drizzle-orm";
import type { ProviderSession } from "@nodetool-ai/protocol";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
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
  declare created_at: string;

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

  /** Paginate messages in a thread. */
  static async paginate(
    threadId: string,
    opts: { limit?: number; startKey?: string; reverse?: boolean } = {}
  ): Promise<[Message[], string]> {
    const { limit = 50, reverse = false, startKey } = opts;
    const db = getDb();
    const conditions = [eq(messages.thread_id, threadId)];
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
    const db = getDb();
    const where = eq(messages.thread_id, threadId);
    const existing = await db
      .select({ id: messages.id })
      .from(messages)
      .where(where);
    if (existing.length === 0) return 0;
    await db.delete(messages).where(where);
    return existing.length;
  }
}
