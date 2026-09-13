import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { predictions } from "./predictions.js";
import { generationOutputs } from "./generation-outputs.js";

export const generationAttachments = sqliteTable(
  "nodetool_generation_attachments",
  {
    id: text("id").primaryKey(),
    generation_id: text("generation_id")
      .notNull()
      .references(() => predictions.id, { onDelete: "cascade" }),
    output_id: text("output_id")
      .notNull()
      .references(() => generationOutputs.id, { onDelete: "cascade" }),
    target_type: text("target_type").notNull(),
    target_id: text("target_id").notNull(),
    status: text("status").notNull().default("pending"),
    selected: integer("selected", { mode: "boolean" }).notNull().default(false),
    error: text("error"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_generation_attachment_identity").on(
      table.generation_id,
      table.output_id,
      table.target_type,
      table.target_id
    ),
    index("idx_generation_attachment_target").on(
      table.target_type,
      table.target_id
    ),
    index("idx_generation_attachment_status").on(table.status)
  ]
);
