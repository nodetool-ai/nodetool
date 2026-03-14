/**
 * Message model -- conversation messages with tool call support.
 *
 * Port of Python's `nodetool.models.message`.
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

const MESSAGE_SCHEMA: TableSchema = {
  table_name: "nodetool_messages",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    thread_id: { type: "string" },
    role: { type: "string" },
    name: { type: "string", optional: true },
    content: { type: "json", optional: true },
    tool_calls: { type: "json", optional: true },
    tool_call_id: { type: "string", optional: true },
    input_files: { type: "json", optional: true },
    output_files: { type: "json", optional: true },
    provider: { type: "json", optional: true },
    model: { type: "string", optional: true },
    cost: { type: "number", optional: true },
    workflow_id: { type: "string", optional: true },
    graph: { type: "json", optional: true },
    tools: { type: "json", optional: true },
    collections: { type: "json", optional: true },
    agent_mode: { type: "boolean", optional: true },
    help_mode: { type: "boolean", optional: true },
    agent_execution_id: { type: "string", optional: true },
    execution_event_type: { type: "string", optional: true },
    workflow_target: { type: "string", optional: true },
    created_at: { type: "datetime" },
  },
};

const MESSAGE_INDEXES: IndexSpec[] = [
  {
    name: "idx_messages_thread_id",
    columns: ["thread_id"],
    unique: false,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse a JSON string into an array, returning the original value if not a string. */
function parseJsonArray(v: unknown): unknown {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not valid JSON
    }
  }
  return v;
}

/** Parse a JSON string into an object, returning the original value if not a string. */
function parseJsonObject(v: unknown): unknown {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      // not valid JSON
    }
  }
  return v;
}

// ── Model ────────────────────────────────────────────────────────────

export class Message extends DBModel {
  static override schema = MESSAGE_SCHEMA;
  static override indexes = MESSAGE_INDEXES;

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
  declare created_at: string;

  constructor(data: Row) {
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
    this.created_at ??= now;

    // Deserialize JSON strings from SQLite TEXT columns
    this.tools = parseJsonArray(this.tools) as string[] | null;
    this.collections = parseJsonArray(this.collections) as string[] | null;
    this.tool_calls = parseJsonArray(this.tool_calls) as unknown[] | null;
    this.input_files = parseJsonArray(this.input_files) as unknown[] | null;
    this.output_files = parseJsonArray(this.output_files) as unknown[] | null;
    this.graph = parseJsonObject(this.graph) as Record<string, unknown> | null;

    // SQLite stores booleans as 0/1
    if (typeof this.agent_mode === "number") {
      this.agent_mode = this.agent_mode !== 0;
    }
    this.agent_mode ??= null;

    if (typeof this.help_mode === "number") {
      this.help_mode = this.help_mode !== 0;
    }
    this.help_mode ??= null;
  }

  // ── Static queries ───────────────────────────────────────────────

  /** Find a message by id. */
  static async find(messageId: string): Promise<Message | null> {
    return (await (Message as unknown as ModelClass<Message>).get(messageId)) as Message | null;
  }

  /** Paginate messages in a thread. */
  static async paginate(
    threadId: string,
    opts: { limit?: number; startKey?: string; reverse?: boolean } = {},
  ): Promise<[Message[], string]> {
    const { limit = 50, startKey: _startKey, reverse = false } = opts;
    const cond = field("thread_id").equals(threadId);

    return (Message as unknown as ModelClass<Message>).query({
      condition: cond,
      orderBy: "created_at",
      reverse,
      limit,
    });
  }
}
