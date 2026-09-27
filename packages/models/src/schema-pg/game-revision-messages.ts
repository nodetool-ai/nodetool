import { index, pgTable, text } from "drizzle-orm/pg-core";

export const gameRevisionMessages = pgTable(
  "game_revision_messages",
  {
    revision: text("revision").primaryKey(),
    game_id: text("game_id").notNull(),
    message: text("message"),
    created_at: text("created_at").notNull()
  },
  (table) => [index("idx_game_revision_message_game").on(table.game_id)]
);
