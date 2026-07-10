import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

export const triggerRegistrations = pgTable(
  "trigger_registrations",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    workflow_id: text("workflow_id").notNull(),
    node_id: text("node_id").notNull(),
    kind: text("kind").notNull(),
    config_json: jsonText<Record<string, unknown>>()("config_json"),
    enabled: integer("enabled").notNull().default(1),
    cursor: text("cursor"),
    last_fired_at: text("last_fired_at"),
    last_error: text("last_error"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_trigger_reg_workflow").on(table.workflow_id),
    index("idx_trigger_reg_kind_enabled").on(table.kind, table.enabled),
    uniqueIndex("idx_trigger_reg_workflow_node").on(
      table.workflow_id,
      table.node_id
    )
  ]
);
