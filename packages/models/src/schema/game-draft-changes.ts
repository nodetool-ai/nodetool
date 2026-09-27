import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameDraftChanges = sqliteTable(
  "game_draft_changes",
  {
    id: text("id").primaryKey(),
    game_id: text("game_id").notNull(),
    actor: text("actor").notNull(),
    thread_id: text("thread_id"),
    message_id: text("message_id"),
    ops: text("ops").notNull(),
    summary: text("summary").notNull(),
    before_updated_at: text("before_updated_at").notNull(),
    before_digest: text("before_digest").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [index("idx_game_draft_change_game_created").on(table.game_id, table.created_at)]
);
