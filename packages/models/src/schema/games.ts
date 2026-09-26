import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    workspace_id: text("workspace_id").notNull(),
    name: text("name").notNull(),
    source_root: text("source_root").notNull(),
    current_revision: text("current_revision").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_game_user_project").on(table.user_id, table.project_id),
    index("idx_game_workspace").on(table.workspace_id)
  ]
);
