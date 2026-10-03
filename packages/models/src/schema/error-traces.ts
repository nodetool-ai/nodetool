import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * Redacted error traces, stored in the deployment's own database.
 *
 * Every row passes through `redactErrorTrace` (`error-trace-redaction.ts`)
 * before the insert, on both the local capture path and the sync ingest path.
 * `message` and `stack` are free text, unlike `nodetool_user_events`, because
 * a trace without its message cannot be debugged. They are length-capped and
 * scrubbed of credentials, emails, IP addresses and home-directory names.
 * Workflow inputs, prompts and outputs are never written: `context` keeps only
 * the allowlisted identifiers in `ERROR_TRACE_CONTEXT_KEYS`.
 *
 * `user_id` is nullable because an unauthenticated request can fail. On
 * Supabase the table has row-level security, so the Data API only shows a
 * signed-in user their own rows.
 *
 * `origin` is `local` for a trace captured by this server and `ingest` for one
 * received through sync. Only local rows are pushed, which keeps a server that
 * both captures and receives traces from forwarding what it was sent.
 */
export const errorTraces = sqliteTable(
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
