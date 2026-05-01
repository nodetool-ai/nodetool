import {
  sqliteTable,
  text,
  integer,
  real,
  index
} from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

export const messages = sqliteTable(
  "nodetool_messages",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    thread_id: text("thread_id").notNull(),
    role: text("role").notNull().default("user"),
    name: text("name"),
    content: jsonText<string | Record<string, unknown> | unknown[]>()(
      "content"
    ),
    tool_calls: jsonText<unknown[]>()("tool_calls"),
    tool_call_id: text("tool_call_id"),
    input_files: jsonText<unknown[]>()("input_files"),
    output_files: jsonText<unknown[]>()("output_files"),
    provider: text("provider"),
    model: text("model"),
    cost: real("cost"),
    workflow_id: text("workflow_id"),
    graph: jsonText<Record<string, unknown>>()("graph"),
    tools: jsonText<string[]>()("tools"),
    collections: jsonText<string[]>()("collections"),
    agent_mode: integer("agent_mode", { mode: "boolean" }),
    help_mode: integer("help_mode", { mode: "boolean" }),
    agent_execution_id: text("agent_execution_id"),
    execution_event_type: text("execution_event_type"),
    workflow_target: text("workflow_target"),
    media_generation: jsonText<Record<string, unknown>>()("media_generation"),
    created_at: text("created_at").notNull()
  },
  (table) => [index("idx_messages_thread_id").on(table.thread_id)]
);
