import { pgTable, text, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import type { StoryboardDocument } from "../storyboard.js";

export const storyboards = pgTable(
  "storyboards",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    name: text("name").notNull(),
    document: jsonText<StoryboardDocument>()("document").notNull(),
    /** Timeline sequence this board was assembled into, if any. */
    timeline_id: text("timeline_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_storyboard_user").on(table.user_id),
    index("idx_storyboard_project").on(table.project_id),
    index("idx_storyboard_updated").on(table.updated_at)
  ]
);
