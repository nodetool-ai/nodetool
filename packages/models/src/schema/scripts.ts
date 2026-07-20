import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const scripts = sqliteTable(
  "scripts",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    name: text("name").notNull(),
    document: text("document").notNull(),
    /** Timeline sequence this script was assembled into, if any. */
    timeline_id: text("timeline_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_script_user").on(table.user_id),
    index("idx_script_project").on(table.project_id),
    index("idx_script_updated").on(table.updated_at)
  ]
);
