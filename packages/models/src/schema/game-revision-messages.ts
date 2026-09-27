import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameRevisionMessages = sqliteTable(
  "game_revision_messages",
  {
    revision: text("revision").primaryKey(),
    game_id: text("game_id").notNull(),
    message: text("message"),
    created_at: text("created_at").notNull()
  },
  (table) => [index("idx_game_revision_message_game").on(table.game_id)]
);
