import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const jsScripts = sqliteTable(
  "js_scripts",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    name: text("name").notNull(),
    document: text("document").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_js_script_user").on(table.user_id),
    index("idx_js_script_project").on(table.project_id),
    index("idx_js_script_updated").on(table.updated_at)
  ]
);
