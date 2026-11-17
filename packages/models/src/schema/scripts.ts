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
    /** Storyboard this script is linked to, if any. */
    storyboard_id: text("storyboard_id"),
    // Path of the script's file, relative to the folder of the project in
    // `project_id`: `Scripts/<name>.script.json`. Null until the file is first written.
    file_path: text("file_path"),
    // SHA-256 of the file as NodeTool last wrote or imported it, in hex.
    file_hash: text("file_hash"),
    // What the last reconcile found wrong with the file, or null.
    file_error: text("file_error"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_script_user").on(table.user_id),
    index("idx_script_project").on(table.project_id),
    index("idx_script_updated").on(table.updated_at)
  ]
);
