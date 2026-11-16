import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const timelineSequences = sqliteTable(
  "timeline_sequences",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    workflow_id: text("workflow_id"),
    name: text("name").notNull(),
    fps: integer("fps").notNull().default(30),
    width: integer("width").notNull().default(1920),
    height: integer("height").notNull().default(1080),
    duration_ms: integer("duration_ms").notNull().default(0),
    document: text("document").notNull(),
    /**
     * Monotonic write counter. Resource providers hand it out inside a
     * `ResourceRef` and reject a write whose ref is behind — optimistic
     * concurrency for interactive editing widgets.
     */
    revision: integer("revision").notNull().default(0),
    // Path of the timeline's file, relative to the folder of the project in
    // `project_id`: `Timelines/<name>.timeline.json`. Null until the file is
    // first written.
    file_path: text("file_path"),
    // SHA-256 of the file content last synced with this row, in hex. Null
    // when the row is newer than the file and the file is still to be written.
    file_hash: text("file_hash"),
    // What the last reconcile found wrong with the file: "File missing", or
    // the reason an edited file was refused. Null while row and file agree.
    file_error: text("file_error"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_timeline_sequence_user").on(table.user_id),
    index("idx_timeline_sequence_project").on(table.project_id),
    index("idx_timeline_sequence_updated").on(table.updated_at)
  ]
);
