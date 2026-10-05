import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { RunTraceParent, TraceContent, TraceRecord } from "@nodetool-ai/protocol";
import { jsonText } from "./helpers.js";

export const runTraces = sqliteTable("nodetool_run_traces", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  kind: text("kind").notNull(),
  source_id: text("source_id").notNull(),
  parent_run_id: text("parent_run_id"),
  canonical_root_id: text("canonical_root_id").notNull(),
  trace_id: text("trace_id").notNull(),
  root_span_id: text("root_span_id"),
  origin: text("origin").notNull(),
  status: text("status").notNull().default("running"),
  started_at: text("started_at").notNull(),
  ended_at: text("ended_at"),
  cost_usd: real("cost_usd"),
  error: text("error"),
  content_expired: integer("content_expired").notNull().default(0),
  truncated: integer("truncated").notNull().default(0),
  incomplete: integer("incomplete").notNull().default(0),
  parents: jsonText<RunTraceParent[]>()("parents").notNull(),
  next_cursor: integer("next_cursor").notNull().default(0),
  span_count: integer("span_count").notNull().default(0),
  event_count: integer("event_count").notNull().default(0)
}, (table) => [
  uniqueIndex("idx_run_trace_canonical").on(table.trace_id).where(sql`${table.parent_run_id} IS NULL`),
  uniqueIndex("idx_run_trace_user_source").on(table.user_id, table.kind, table.source_id),
  index("idx_run_trace_owner_trace").on(table.user_id, table.trace_id),
  index("idx_run_trace_trace").on(table.trace_id),
  index("idx_run_trace_root").on(table.canonical_root_id),
  index("idx_run_trace_owner_started").on(table.user_id, table.started_at)
]);

export const runSpans = sqliteTable("nodetool_run_spans", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  run_id: text("run_id").notNull(),
  trace_id: text("trace_id").notNull(),
  span_id: text("span_id").notNull(),
  cursor: integer("cursor").notNull(),
  update_kind: text("update_kind").notNull(),
  metadata: jsonText<TraceRecord>()("metadata").notNull(),
  content: jsonText<TraceContent>()("content"),
  error_summary: text("error_summary"),
  content_expired: integer("content_expired").notNull().default(0),
  truncated: integer("truncated").notNull().default(0),
  incomplete: integer("incomplete").notNull().default(0)
}, (table) => [
  uniqueIndex("idx_run_span_identity").on(table.trace_id, table.span_id),
  index("idx_run_span_owner_trace_cursor").on(table.user_id, table.trace_id, table.cursor),
  index("idx_run_span_run").on(table.run_id)
]);
