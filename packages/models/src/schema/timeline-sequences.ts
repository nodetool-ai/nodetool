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
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_timeline_sequence_user").on(table.user_id),
    index("idx_timeline_sequence_project").on(table.project_id),
    index("idx_timeline_sequence_updated").on(table.updated_at)
  ]
);
