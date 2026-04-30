import { pgTable, text, integer, real, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

export const predictions = pgTable(
  "nodetool_predictions",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    node_id: text("node_id").notNull().default(""),
    provider: text("provider").notNull().default(""),
    model: text("model").notNull().default(""),
    workflow_id: text("workflow_id"),
    error: text("error"),
    logs: text("logs"),
    status: text("status").notNull().default("pending"),
    cost: real("cost"),
    input_tokens: integer("input_tokens"),
    output_tokens: integer("output_tokens"),
    total_tokens: integer("total_tokens"),
    cached_tokens: integer("cached_tokens"),
    reasoning_tokens: integer("reasoning_tokens"),
    created_at: text("created_at"),
    started_at: text("started_at"),
    completed_at: text("completed_at"),
    duration: real("duration"),
    hardware: text("hardware"),
    input_size: integer("input_size"),
    output_size: integer("output_size"),
    parameters: jsonText<Record<string, unknown>>()("parameters"),
    metadata: jsonText<Record<string, unknown>>()("metadata")
  },
  (table) => [
    index("idx_predictions_user_id").on(table.user_id),
    index("idx_predictions_user_provider").on(table.user_id, table.provider),
    index("idx_prediction_created_at").on(table.created_at),
    index("idx_prediction_user_model").on(table.user_id, table.model)
  ]
);
