import { pgTable, text, index, integer } from "drizzle-orm/pg-core";
import { integerBoolean, jsonText } from "./helpers.js";

export const workflows = pgTable(
  "nodetool_workflows",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull().default(""),
    tool_name: text("tool_name"),
    description: text("description").default(""),
    tags: jsonText<string[]>()("tags"),
    thumbnail: text("thumbnail"),
    thumbnail_url: text("thumbnail_url"),
    graph: jsonText<{
      nodes: Record<string, unknown>[];
      edges: Record<string, unknown>[];
    }>()("graph").notNull(),
    settings: jsonText<Record<string, unknown>>()("settings"),
    package_name: text("package_name"),
    path: text("path"),
    run_mode: text("run_mode"),
    workspace_id: text("workspace_id"),
    project_id: text("project_id").notNull().default("default"),
    html_app: text("html_app"),
    app_doc: jsonText<Record<string, unknown>>()("app_doc"),
    receive_clipboard: integerBoolean("receive_clipboard"),
    access: text("access").notNull().default("private"),
    // File in the project folder and the hash last synced — see
    // schema/workflows.ts.
    file_path: text("file_path"),
    file_hash: text("file_hash"),
    file_error: text("file_error"),
    // Editing instance and document schema version — see schema/workflows.ts.
    last_writer_instance: text("last_writer_instance"),
    schema_version: integer("schema_version").notNull().default(1),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_workflows_user_id").on(table.user_id),
    index("idx_workflows_user_project").on(table.user_id, table.project_id),
    index("idx_workflows_access").on(table.access)
  ]
);
