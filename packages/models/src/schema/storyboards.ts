import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const storyboards = sqliteTable(
  "storyboards",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    name: text("name").notNull(),
    document: text("document").notNull(),
    /** Timeline sequence this board was assembled into, if any. */
    timeline_id: text("timeline_id"),
    /**
     * Monotonic write counter. Resource providers hand it out inside a
     * `ResourceRef` and reject a write whose ref is behind — optimistic
     * concurrency for interactive editing widgets.
     */
    revision: integer("revision").notNull().default(0),
    // Path of the storyboard's file, relative to the folder of the project
    // in `project_id`: `Storyboards/<name>.storyboard.json`. Null until the
    // file is first written.
    file_path: text("file_path"),
    // SHA-256 of the file as NodeTool last wrote or imported it, in hex.
    file_hash: text("file_hash"),
    // What the last reconcile found wrong with the file, or null.
    file_error: text("file_error"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_storyboard_user").on(table.user_id),
    index("idx_storyboard_project").on(table.project_id),
    index("idx_storyboard_updated").on(table.updated_at)
  ]
);
