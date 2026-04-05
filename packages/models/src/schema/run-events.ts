import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

export const runEvents = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    event_type: text("event_type").notNull(),
    event_time: text("event_time").notNull(),
    node_id: text("node_id"),
    payload: jsonText<Record<string, unknown>>()("payload")
  },
  (table) => [
    uniqueIndex("idx_run_events_run_seq").on(table.run_id, table.seq),
    index("idx_run_events_run_node").on(table.run_id, table.node_id),
    index("idx_run_events_run_type").on(table.run_id, table.event_type)
  ]
);
