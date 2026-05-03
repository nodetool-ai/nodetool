import { pgTable, text, integer, real, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

export const jobs = pgTable(
  "nodetool_jobs",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    job_type: text("job_type").notNull().default(""),
    workflow_id: text("workflow_id").notNull(),
    status: text("status").notNull().default("scheduled"),
    name: text("name").default(""),
    graph: jsonText<Record<string, unknown>>()("graph"),
    params: jsonText<Record<string, unknown>>()("params"),
    worker_id: text("worker_id"),
    heartbeat_at: text("heartbeat_at"),
    started_at: text("started_at"),
    finished_at: text("finished_at"),
    completed_at: text("completed_at"),
    failed_at: text("failed_at"),
    error: text("error"),
    error_message: text("error_message"),
    cost: real("cost"),
    logs: jsonText<Record<string, unknown>[]>()("logs"),
    retry_count: integer("retry_count").notNull().default(0),
    max_retries: integer("max_retries").notNull().default(3),
    version: integer("version").notNull().default(0),
    suspended_node_id: text("suspended_node_id"),
    suspension_reason: text("suspension_reason"),
    suspension_state_json: jsonText<Record<string, unknown>>()(
      "suspension_state_json"
    ),
    suspension_metadata_json: jsonText<Record<string, unknown>>()(
      "suspension_metadata_json"
    ),
    execution_strategy: text("execution_strategy"),
    execution_id: text("execution_id"),
    metadata_json: jsonText<Record<string, unknown>>()("metadata_json"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_jobs_status").on(table.status),
    index("idx_jobs_updated_at").on(table.updated_at),
    index("idx_jobs_worker_id").on(table.worker_id),
    index("idx_jobs_heartbeat_at").on(table.heartbeat_at),
    index("idx_jobs_recovery").on(table.status, table.heartbeat_at)
  ]
);
