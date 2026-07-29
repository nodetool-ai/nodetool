import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

export const triggerInputs = pgTable(
  "trigger_inputs",
  {
    id: text("id").primaryKey(),
    input_id: text("input_id").notNull(),
    run_id: text("run_id").notNull(),
    node_id: text("node_id").notNull(),
    payload_json: jsonText<unknown>()("payload_json"),
    processed: integer("processed").notNull().default(0),
    processed_at: text("processed_at"),
    cursor: text("cursor"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_trigger_input_run_node_processed").on(
      table.run_id,
      table.node_id,
      table.processed
    ),
    uniqueIndex("idx_trigger_input_id").on(table.input_id)
  ]
);
