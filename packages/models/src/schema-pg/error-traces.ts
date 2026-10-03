import { pgTable, text, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

/**
 * PostgreSQL twin of `schema/error-traces.ts`. See that file for what is
 * stored and what is deliberately left out.
 */
export const errorTraces = pgTable(
  "nodetool_error_traces",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id"),
    fingerprint: text("fingerprint").notNull(),
    source: text("source").notNull(),
    severity: text("severity").notNull(),
    error_type: text("error_type"),
    message: text("message").notNull(),
    stack: text("stack"),
    context: jsonText<Record<string, string | number | boolean>>()("context"),
    app_version: text("app_version"),
    platform: text("platform"),
    origin: text("origin").notNull(),
    synced_at: text("synced_at"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_error_trace_user_created").on(table.user_id, table.created_at),
    index("idx_error_trace_fingerprint").on(
      table.fingerprint,
      table.created_at
    ),
    index("idx_error_trace_created").on(table.created_at)
  ]
);
