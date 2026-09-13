import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";
import { predictions } from "./predictions.js";
import { generationAttempts } from "./generation-attempts.js";

export const generationOutputs = sqliteTable(
  "nodetool_generation_outputs",
  {
    id: text("id").primaryKey(),
    generation_id: text("generation_id")
      .notNull()
      .references(() => predictions.id, { onDelete: "cascade" }),
    attempt_id: text("attempt_id")
      .notNull()
      .references(() => generationAttempts.id, { onDelete: "cascade" }),
    output_key: text("output_key").notNull(),
    output_index: integer("output_index").notNull().default(0),
    output_type: text("output_type").notNull().default("media"),
    provider_ref: text("provider_ref"),
    raw_result: jsonText<Record<string, unknown>>()("raw_result"),
    storage_key: text("storage_key"),
    asset_id: text("asset_id"),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_generation_output_identity").on(
      table.generation_id,
      table.attempt_id,
      table.output_key,
      table.output_index
    ),
    index("idx_generation_output_generation").on(table.generation_id),
    index("idx_generation_output_status").on(table.status)
  ]
);
