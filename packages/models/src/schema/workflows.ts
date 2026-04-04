import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

export const workflows = sqliteTable(
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
    html_app: text("html_app"),
    receive_clipboard: integer("receive_clipboard", { mode: "boolean" }),
    access: text("access").notNull().default("private"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_workflows_user_id").on(table.user_id),
    index("idx_workflows_access").on(table.access)
  ]
);
