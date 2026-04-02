import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

export const workflowVersions = sqliteTable(
  "nodetool_workflow_versions",
  {
    id: text("id").primaryKey(),
    workflow_id: text("workflow_id").notNull(),
    user_id: text("user_id").notNull(),
    name: text("name"),
    description: text("description"),
    graph: jsonText<{
      nodes: Record<string, unknown>[];
      edges: Record<string, unknown>[];
    }>()("graph").notNull(),
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    autosave_metadata: jsonText<Record<string, unknown>>()("autosave_metadata"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_wv_workflow_id").on(table.workflow_id),
    index("idx_wv_user_id").on(table.user_id),
    index("idx_nodetool_workflow_versions_workflow_id_save_type_created_at").on(
      table.workflow_id,
      table.save_type,
      table.created_at
    )
  ]
);
