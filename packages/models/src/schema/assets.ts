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
    sketch_document_id: text("sketch_document_id"),
    workflow_id: text("workflow_id"),
    node_id: text("node_id"),
    job_id: text("job_id"),
    // Source timeline a video was rendered from. Lets "edit" on a video open
    // its underlying timeline sequence for re-editing.
    timeline_id: text("timeline_id"),
    // The project this asset belongs to, spelled exactly as every document
    // table spells it: the loose bucket's id rather than null. Only entities
    // (assets carrying the entity marker) are shown per project today; every
    // other asset sits in the loose bucket and is never read by project.
    project_id: text("project_id").notNull().default("default"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_assets_user_parent").on(table.user_id, table.parent_id),
    index("idx_assets_user_project").on(table.user_id, table.project_id)
  ]
);
