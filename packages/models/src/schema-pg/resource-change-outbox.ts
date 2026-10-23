import { pgTable, text, index } from "drizzle-orm/pg-core";

export const resourceChangeOutbox = pgTable(
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
