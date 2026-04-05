import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

export const runNodeState = sqliteTable(
  "run_node_state",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    node_id: text("node_id").notNull(),
    status: text("status").notNull().default("idle"),
    attempt: integer("attempt").notNull().default(1),
    scheduled_at: text("scheduled_at"),
    started_at: text("started_at"),
    completed_at: text("completed_at"),
    failed_at: text("failed_at"),
    suspended_at: text("suspended_at"),
    updated_at: text("updated_at").notNull(),
    last_error: text("last_error"),
    retryable: integer("retryable", { mode: "boolean" })
      .notNull()
      .default(false),
    suspension_reason: text("suspension_reason"),
    resume_state_json: jsonText<Record<string, unknown>>()("resume_state_json"),
    outputs_json: jsonText<Record<string, unknown>>()("outputs_json")
  },
  (table) => [
    index("idx_run_node_state_run_status").on(table.run_id, table.status),
    uniqueIndex("idx_run_node_state_run_node").on(table.run_id, table.node_id)
  ]
);
