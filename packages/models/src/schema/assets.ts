import { sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

export const assets = sqliteTable(
  "nodetool_assets",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    parent_id: text("parent_id"),
    file_id: text("file_id"),
    name: text("name").notNull().default(""),
    content_type: text("content_type")
      .notNull()
      .default("application/octet-stream"),
    size: real("size"),
    duration: real("duration"),
    metadata: jsonText<Record<string, unknown>>()("metadata"),
    workflow_id: text("workflow_id"),
    node_id: text("node_id"),
    job_id: text("job_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_assets_user_parent").on(table.user_id, table.parent_id)
  ]
);
