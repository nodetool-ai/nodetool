import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const resourceChangeOutbox = sqliteTable(
  "resource_change_outbox",
  {
    id: text("id").primaryKey().notNull(),
    payload: text("payload").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_resource_change_outbox_created_at").on(table.created_at)
  ]
);
