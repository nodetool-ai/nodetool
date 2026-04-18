/**
 * Message model -- conversation messages with tool call support.
 *
 * Port of Python's `nodetool.models.message`.
 */

import { eq, desc, asc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { messages } from "./schema/messages.js";

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
    const { limit = 50, reverse = false } = opts;
    const db = getDb();
    const rows = db
      .select()
      .from(messages)
      .where(eq(messages.thread_id, threadId))
      .orderBy(reverse ? desc(messages.created_at) : asc(messages.created_at))
      .limit(limit + 1)
      .all();

    const items = rows.map((r) => new Message(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }
}
